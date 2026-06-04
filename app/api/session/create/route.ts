import { after } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { runSessionExtraction } from '@/app/api/session/extract/route'
import { istDateString } from '@/lib/date'

async function closeAndExtractAbandonedSessions(userId: string) {
  const { data: abandoned, error } = await supabaseAdmin
    .from('sessions')
    .select('id, mode')
    .eq('user_id', userId)
    .eq('status', 'active')
    .is('closed_at', null)

  if (error) {
    console.error('Abandoned sessions lookup error:', error)
    return
  }

  const now = new Date().toISOString()

  for (const session of abandoned ?? []) {
    await supabaseAdmin
      .from('sessions')
      .update({ status: 'closed', closed_at: now })
      .eq('id', session.id)
      .eq('user_id', userId)

    // Skip extraction for opener-only or empty sessions — there is nothing
    // meaningful to extract if the user never replied. A limit-1 query on
    // role='user' is cheaper than fetching all messages and avoids running the
    // LLM extractor (and writing a session_summary) for sessions that only
    // contain the mentor's generated opener.
    const { data: userMsg } = await supabaseAdmin
      .from('messages')
      .select('role')
      .eq('session_id', session.id)
      .eq('role', 'user')
      .limit(1)
      .maybeSingle()

    if (!userMsg) continue

    // Fetch all messages for extraction (only reached when >=1 user message exists).
    const { data: messages } = await supabaseAdmin
      .from('messages')
      .select('role, content')
      .eq('session_id', session.id)
      .order('created_at', { ascending: true })

    if (!messages?.length) continue

    // Extract every session (not just debriefs) so open chats also feed the
    // mentor's long-term memory (patterns, strengths, commitments, summaries).
    // The extractor only writes a debrief_log when the mode is 'debrief'.
    const mode: 'open_chat' | 'debrief' | 'morning' =
      session.mode === 'debrief' ? 'debrief'
      : session.mode === 'morning' ? 'morning'
      : 'open_chat'

    try {
      await runSessionExtraction(
        userId,
        session.id,
        messages as { role: 'user' | 'assistant'; content: string }[],
        mode
      )
    } catch (err) {
      console.error('Abandoned session extraction failed:', session.id, err)
    }
  }
}

export async function POST(req: Request) {
  try {
    const { userId } = await auth()
    if (!userId) return new Response('Unauthorized', { status: 401 })

    const { mode } = await req.json() as { mode: 'open_chat' | 'debrief' | 'morning' }

    // Sweeping + extracting leftover abandoned sessions runs a full LLM call per
    // session (no timeout). Awaiting it inline blocks the new session id from
    // returning and, on serverless, can blow the function's execution limit so
    // session creation fails outright — which stalls/loops the proactive opener
    // (felt most in the morning, the first session after an overnight abandoned
    // one). `after()` runs it once the response is sent (kept alive via
    // waitUntil on serverless), so creation returns immediately while extraction
    // still completes. Extraction is idempotent, so running it later is safe.
    after(() =>
      closeAndExtractAbandonedSessions(userId).catch((err) =>
        console.error('Abandoned session sweep failed:', err)
      )
    )

    const sessionData: {
      user_id: string
      mode: string
      debrief_date?: string
    } = {
      user_id: userId,
      mode,
    }

    // For debrief, tag with today's IST date
    if (mode === 'debrief') {
      sessionData.debrief_date = istDateString()
    }

    const { data, error } = await supabaseAdmin
      .from('sessions')
      .insert(sessionData)
      .select('id')
      .single()

    if (error) {
      console.error('Session creation error:', error)
      return new Response('DB error', { status: 500 })
    }

    // Count total sessions for this user (including the one just created) to
    // detect the very first session. count === 1 means this is their first ever.
    const { count } = await supabaseAdmin
      .from('sessions')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId)

    const isFirstSession = (count ?? 0) <= 1

    return Response.json({ sessionId: data.id, isFirstSession })
  } catch (error) {
    console.error('Session error:', error)
    return new Response('Internal server error', { status: 500 })
  }
}
