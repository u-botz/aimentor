import { auth } from '@clerk/nextjs/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { streamChat, resolveModel } from '@/lib/model-router'
import { assembleSystemPrompt, type SessionMode, type SystemBlock } from '@/lib/prompts/assemble'
import { fetchMemoryContext } from '@/lib/memory/fetch-context'
import { rewriteMemory } from '@/lib/memory/rewrite'
import { MORNING_PRIORITY_EXTRACT_PROMPT } from '@/lib/prompts/layer4-mode'
import { istDateString } from '@/lib/date'
import { runBuilderSweep } from '@/lib/memory/builder'

type ChatMsg = { role: 'user' | 'assistant'; content: string }

// The Anthropic API requires conversations to start with a user turn. In the
// new opener-led flow the client sends [assistant(opener), user(reply), ...],
// so messages[0] is always assistant. This function prepends a minimal synthetic
// user cue so the API receives valid alternation — the real context comes from
// the actual opener in messages[1]. It is a no-op when messages already starts
// with a user turn (all turns after the first exchange).
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
    const { messages, sessionId, mode = 'open_chat', isFirstSession = false } = await req.json() as {
      messages: { role: 'user' | 'assistant'; content: string }[]
      sessionId: string
      mode: SessionMode
      isFirstSession?: boolean
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

    // 5. Assemble system prompt (all 4 layers) — now async because it fetches
    //    the rich time context before building the block.  cache_control markers
    //    on L1 + L2 blocks still apply across turns.
    const systemPrompt: SystemBlock[] = await assembleSystemPrompt({
      userId,
      reminderTime: (user.reminder_time as string | null) ?? null,
      user,
      memory: memoryCtx.memory,
      lastSession: memoryCtx.lastSession,
      openCommitments: memoryCtx.openCommitments,
      mode,
      isFirstSession,
    })

    // 6. Persist new message turns to the DB.
    //
    // New first-call shape: [assistant(opener), user(reply)]
    // The opener may or may not already be in the DB (saved by /api/messages/save
    // in the client before this request). We detect this by counting existing rows:
    //
    //   count === 0  →  nothing saved yet; insert opener then user in order.
    //   count  > 0  →  opener already saved (or subsequent turn); insert only
    //                   the trailing user message — existing behaviour.
    //
    // This is idempotent: if /api/messages/save saved the opener first (count=1)
    // we skip re-inserting it and only append the user turn. If it failed
    // (count=0) we save both here as a fallback, preserving correct DB order.
    const { count: existingCount } = await supabaseAdmin
      .from('messages')
      .select('*', { count: 'exact', head: true })
      .eq('session_id', sessionId)

    const isFirstCall =
      (existingCount ?? 0) === 0 &&
      messages.length >= 2 &&
      messages[0].role === 'assistant'

    if (isFirstCall) {
      // Insert opener (assistant) then user reply in a single batch so the row
      // timestamps preserve the intended order.
      await supabaseAdmin.from('messages').insert([
        {
          session_id: sessionId,
          user_id: userId,
          role: 'assistant' as const,
          content: messages[0].content,
        },
        {
          session_id: sessionId,
          user_id: userId,
          role: 'user' as const,
          content: messages[messages.length - 1].content,
        },
      ])
    } else {
      // Subsequent turns: save only the new trailing user message.
      const lastMessage = messages[messages.length - 1]
      if (lastMessage?.role === 'user') {
        await supabaseAdmin.from('messages').insert({
          session_id: sessionId,
          user_id: userId,
          role: 'user',
          content: lastMessage.content,
        })
      }
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

        // Fire-and-forget: explicitly void so TS/runtime does not
        // implicitly await these and hold the function open.
        if (mode === 'morning' && messages.length > 0) {
          void saveMorningPlan(userId, [
            ...messages,
            { role: 'assistant', content: fullResponse },
          ]).catch((err) => console.error('Morning plan save failed:', err))
        }

        void runBuilderSweep(
          userId,
          sessionId,
          [...messages, { role: 'assistant', content: fullResponse }],
          { live: true }
        ).catch((err) => console.error('[builder live]', err))
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
