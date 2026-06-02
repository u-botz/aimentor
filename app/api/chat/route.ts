import { auth } from '@clerk/nextjs/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { streamChat } from '@/lib/model-router'
import { assembleSystemPrompt, type SessionMode } from '@/lib/prompts/assemble'
import { fetchMemoryContext } from '@/lib/memory/fetch-context'
import { rewriteMemory } from '@/lib/memory/rewrite'

export async function POST(req: Request) {
  try {
    // 1. Auth check
    const { userId } = await auth()
    if (!userId) {
      return new Response('Unauthorized', { status: 401 })
    }

    // 2. Parse request
    const { messages, sessionId, mode = 'open_chat' } = await req.json() as {
      messages: { role: 'user' | 'assistant'; content: string }[]
      sessionId: string
      mode: SessionMode
    }

    // 3. Fetch user profile (Layer 2)
    const { data: user, error: userError } = await supabaseAdmin
      .from('users')
      .select('*')
      .eq('id', userId)
      .single()

    if (userError || !user) {
      return new Response('User not found', { status: 404 })
    }

    // 4. Fetch memory context (Layer 3)
    const memoryCtx = await fetchMemoryContext(userId)

    // 5. Assemble system prompt (all 4 layers)
    const systemPrompt = assembleSystemPrompt({
      user,
      memory: memoryCtx.memory,
      lastSession: memoryCtx.lastSession,
      openCommitments: memoryCtx.openCommitments,
      mode,
    })

    // 6. Save user message to DB
    const lastMessage = messages[messages.length - 1]
    if (lastMessage?.role === 'user') {
      await supabaseAdmin.from('messages').insert({
        session_id: sessionId,
        user_id: userId,
        role: 'user',
        content: lastMessage.content,
      })
    }

    // 6b. Every 3rd message, trigger memory rewrite in the background (fire-and-forget)
    if (messages.length % 3 === 0) {
      rewriteMemory(userId).catch((err) =>
        console.error('Background memory rewrite failed:', err)
      )
    }

    // 7. Call Claude API with streaming
    const stream = await streamChat(
      systemPrompt,
      messages.map((m) => ({
        role: m.role,
        content: m.content,
      }))
    )

    // 8. Stream response back + save assistant message when done
    const encoder = new TextEncoder()
    let fullResponse = ''

    const readable = new ReadableStream({
      async start(controller) {
        for await (const chunk of stream) {
          if (
            chunk.type === 'content_block_delta' &&
            chunk.delta.type === 'text_delta'
          ) {
            const text = chunk.delta.text
            fullResponse += text
            controller.enqueue(encoder.encode(text))
          }
        }

        // Save assistant response to DB after stream completes
        await supabaseAdmin.from('messages').insert({
          session_id: sessionId,
          user_id: userId,
          role: 'assistant',
          content: fullResponse,
        })

        controller.close()
      },
    })

    return new Response(readable, {
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Transfer-Encoding': 'chunked',
      },
    })
  } catch (error) {
    console.error('Chat API error:', error)
    return new Response('Internal server error', { status: 500 })
  }
}
