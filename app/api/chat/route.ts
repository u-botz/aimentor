import { auth } from '@clerk/nextjs/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { streamChat, resolveModel } from '@/lib/model-router'
import { assembleSystemPrompt, type SessionMode } from '@/lib/prompts/assemble'
import { fetchMemoryContext } from '@/lib/memory/fetch-context'
import { rewriteMemory } from '@/lib/memory/rewrite'
import { MORNING_PRIORITY_EXTRACT_PROMPT } from '@/lib/prompts/layer4-mode'
import { istDateString } from '@/lib/date'

type ChatMsg = { role: 'user' | 'assistant'; content: string }

// The Anthropic API requires the first message to be from the user. When the
// mentor opens the conversation proactively (notification → empty chat), the
// stored transcript starts with an assistant turn, so we prepend a synthetic
// user "opener" that cues the mentor to speak first. This opener is sent to the
// model only — it is never saved to the DB and never shown in the UI.
function withLeadingUser(messages: ChatMsg[], mode: SessionMode): ChatMsg[] {
  if (messages.length > 0 && messages[0].role === 'user') return messages
  const opener =
    mode === 'morning'
      ? '(I just opened the app for my morning check-in. Start us off.)'
      : mode === 'debrief'
        ? "(I just opened the app for tonight's debrief. Start us off.)"
        : '(I just opened the app. Start us off.)'
  return [{ role: 'user', content: opener }, ...messages]
}

// Silently extract today's committed priority + intention from a morning
// conversation and upsert it into daily_plans (last write wins). A failure here
// must never break the chat response, so all callers wrap this in try/catch.
async function saveMorningPlan(
  userId: string,
  conversation: { role: 'user' | 'assistant'; content: string }[]
): Promise<void> {
  const conversationText = conversation
    .map((m) => `${m.role.toUpperCase()}: ${m.content}`)
    .join('\n')

  const stream = await streamChat(
    MORNING_PRIORITY_EXTRACT_PROMPT,
    [{ role: 'user', content: conversationText }],
    resolveModel('fast'),
    256
  )

  let raw = ''
  for await (const chunk of stream) {
    if (
      chunk.type === 'content_block_delta' &&
      chunk.delta.type === 'text_delta'
    ) {
      raw += chunk.delta.text
    }
  }

  // Models sometimes wrap JSON in ```json fences or add stray prose — strip
  // fences and isolate the first {...} object before parsing.
  const cleaned = raw.replace(/```json/gi, '').replace(/```/g, '').trim()
  const match = cleaned.match(/\{[\s\S]*\}/)
  const jsonText = match ? match[0] : cleaned

  let parsed: { top_priority?: string; intentions?: string }
  try {
    parsed = JSON.parse(jsonText)
  } catch (err) {
    console.error('Morning plan JSON parse failed. Raw response:', raw, err)
    return
  }

  const topPriority = (parsed.top_priority ?? '').trim()

  // Only write when a real priority exists.
  if (!topPriority) return

  await supabaseAdmin.from('daily_plans').upsert(
    {
      user_id: userId,
      plan_date: istDateString(),
      top_priority: topPriority,
      intentions: (parsed.intentions ?? '').trim(),
    },
    { onConflict: 'user_id,plan_date' }
  )
}

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

    // 6. Save user message to DB (skip when the mentor is opening — no real
    //    user message exists yet for a proactive opener).
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
    if (messages.length > 0 && messages.length % 3 === 0) {
      rewriteMemory(userId).catch((err) =>
        console.error('Background memory rewrite failed:', err)
      )
    }

    // 7. Call Claude API with streaming
    const stream = await streamChat(
      systemPrompt,
      withLeadingUser(messages, mode).map((m) => ({
        role: m.role,
        content: m.content,
      })),
      resolveModel('deep'),
      1024
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

        // Close the stream FIRST so the client's reader receives `done` and
        // clears its loading state immediately. Anything heavier (a second LLM
        // call) must run off this critical path — otherwise the typing
        // indicator spins until that work finishes.
        controller.close()

        // Morning mode: silently capture today's plan. Fire-and-forget so it
        // never blocks the response. Skip on the proactive opener — there's no
        // user input to extract yet.
        if (mode === 'morning' && messages.length > 0) {
          saveMorningPlan(userId, [
            ...messages,
            { role: 'assistant', content: fullResponse },
          ]).catch((err) => console.error('Morning plan save failed:', err))
        }
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
