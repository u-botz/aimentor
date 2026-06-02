import { auth } from '@clerk/nextjs/server'
import { streamChat } from '@/lib/model-router'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { istDateString } from '@/lib/date'

type SessionMode = 'open_chat' | 'debrief' | 'morning'

type Structured = {
  score_overall: number | null
  hydration_litres: number | null
  sleep_hours: number | null
  dairy_violation: boolean
  workout_done: boolean
  win: string | null
  failure: string | null
  tomorrow_priority: string | null
  daily_spend: number | null
  expense_notes: string | null
  finance_violation: boolean
  violation_detail: string | null
}

type CommitmentMade = {
  text: string
  due_date: string | null
}

type ExtractionResult = {
  new_pattern: string | null
  new_strength: string | null
  commitments_made: CommitmentMade[]
  commitments_resolved: string[]
  carry_forward: string | null
  structured: Structured
}

type ChatMessage = { role: 'user' | 'assistant'; content: string }

export async function runSessionExtraction(
  userId: string,
  sessionId: string,
  messages: ChatMessage[],
  mode: SessionMode = 'debrief'
) {
    // ── Step 1: Idempotency guard ──────────────────────────────────────────────
    // A session can be extracted twice (e.g. abandoned-session sweep, then the
    // user reopens it and hits "End Session"). debrief_logs is an upsert so it's
    // safe, but commitments are plain inserts — guard against duplicates.
    const { data: existingSummary } = await supabaseAdmin
      .from('session_summaries')
      .select('id')
      .eq('session_id', sessionId)
      .limit(1)
      .maybeSingle()

    if (existingSummary) {
      return { skipped: true, reason: 'Already extracted' }
    }

    // ── Step 2: Fetch current user memory state ────────────────────────────────
    const { data: userData } = await supabaseAdmin
      .from('users')
      .select('identity_patterns, identity_strengths, medium_term_memory')
      .eq('id', userId)
      .single()

    const identity_patterns: string[] = userData?.identity_patterns ?? []
    const identity_strengths: string[] = userData?.identity_strengths ?? []

    // ── Step 3: Claude extraction call ────────────────────────────────────────
    const conversationText = messages
      .map((m) => `${m.role.toUpperCase()}: ${m.content}`)
      .join('\n')

    const userPrompt = `TODAY'S DATE: ${istDateString()} (IST). Use this to resolve any relative deadlines into absolute YYYY-MM-DD dates.
CURRENT KNOWN PATTERNS: ${identity_patterns.length ? identity_patterns.join(', ') : 'none'}
CURRENT KNOWN STRENGTHS: ${identity_strengths.length ? identity_strengths.join(', ') : 'none'}

CONVERSATION:
${conversationText}

Answer these questions in JSON:

{
  "new_pattern": "one short string if a NEW repeated tendency emerged that isn't already in known patterns, else null",
  "new_strength": "one short string if a strength was clearly demonstrated that isn't already known, else null",
  "commitments_made": [{"text": "a specific commitment the user made", "due_date": "YYYY-MM-DD if the user named or implied a deadline (e.g. 'by Friday', 'tomorrow', 'this week'), else null"}],
  "commitments_resolved": ["list of commitments that were explicitly marked done or closed, empty array if none"],
  "carry_forward": "one sentence — the single most important thing to remember from this conversation for future sessions",
  "structured": {
    "score_overall": <1-10 or null>,
    "hydration_litres": <number or null>,
    "sleep_hours": <number or null>,
    "dairy_violation": <true or false>,
    "workout_done": <true or false>,
    "win": "short string or null",
    "failure": "short string or null",
    "tomorrow_priority": "short string or null",
    "daily_spend": <integer or null>,
    "expense_notes": "string or null",
    "finance_violation": <true or false>,
    "violation_detail": "string or null"
  }
}`

    const extractionSystemPrompt =
      'You are a memory extraction assistant. Analyze this mentor conversation and extract only what matters long term. Return ONLY valid JSON. No explanation. No preamble. No markdown backticks.'

    const stream = await streamChat(
      extractionSystemPrompt,
      [{ role: 'user', content: userPrompt }],
      'haiku'
    )

    let rawText = ''
    for await (const chunk of stream) {
      if (
        chunk.type === 'content_block_delta' &&
        chunk.delta.type === 'text_delta'
      ) {
        rawText += chunk.delta.text
      }
    }

    // ── Step 4: Parse JSON ────────────────────────────────────────────────────
    let extracted: ExtractionResult
    try {
      extracted = JSON.parse(rawText) as ExtractionResult
    } catch {
      console.error('Extraction JSON parse failed. Raw response:', rawText)
      throw new Error('JSON parse error')
    }

    const today = istDateString()
    const s = extracted.structured ?? {}

    // Guard duplicate commitment inserts if this session was already partially
    // processed (belt-and-suspenders alongside the summary guard above).
    const { data: existingCommitments } = await supabaseAdmin
      .from('open_commitments')
      .select('id')
      .eq('session_id', sessionId)
      .limit(1)
    const commitmentsAlreadyInserted = (existingCommitments?.length ?? 0) > 0

    // Normalize commitments_made — tolerate the model returning bare strings or
    // objects, and drop anything without real text. due_date stays null unless a
    // valid YYYY-MM-DD was produced.
    const newCommitments = (extracted.commitments_made ?? [])
      .map((c: unknown) => {
        if (typeof c === 'string') return { text: c.trim(), due_date: null }
        const obj = (c ?? {}) as Partial<CommitmentMade>
        const due =
          typeof obj.due_date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(obj.due_date)
            ? obj.due_date
            : null
        return { text: (obj.text ?? '').trim(), due_date: due }
      })
      .filter((c) => c.text.length > 0)

    // ── Step 5: Parallel DB updates ───────────────────────────────────────────
    // Wrap each supabase builder in Promise.resolve so TypeScript sees a real Promise
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const wrap = (q: PromiseLike<any>) => Promise.resolve(q) as Promise<{ error: any }>

    const ops: Promise<{ error: unknown }>[] = [
      // a. Append new pattern
      ...(extracted.new_pattern
        ? [wrap(supabaseAdmin
            .from('users')
            .update({ identity_patterns: [...identity_patterns, extracted.new_pattern] })
            .eq('id', userId))]
        : []),

      // b. Append new strength
      ...(extracted.new_strength
        ? [wrap(supabaseAdmin
            .from('users')
            .update({ identity_strengths: [...identity_strengths, extracted.new_strength] })
            .eq('id', userId))]
        : []),

      // c. Insert carry_forward into session_summaries
      ...(extracted.carry_forward
        ? [wrap(supabaseAdmin.from('session_summaries').insert({
            user_id: userId,
            session_id: sessionId,
            summary_date: today,
            summary: extracted.carry_forward,
          }))]
        : []),

      // d. Insert new commitments
      ...(newCommitments.length > 0 && !commitmentsAlreadyInserted
        ? [wrap(supabaseAdmin.from('open_commitments').insert(
            newCommitments.map((c) => ({
              user_id: userId,
              session_id: sessionId,
              commitment: c.text,
              due_date: c.due_date,
              made_on: today,
              status: 'open',
            }))
          ))]
        : []),

      // e. Mark resolved commitments as completed
      ...(extracted.commitments_resolved?.length > 0
        ? extracted.commitments_resolved.map((item) =>
            wrap(supabaseAdmin
              .from('open_commitments')
              .update({ status: 'completed', resolved_on: today })
              .eq('user_id', userId)
              .eq('status', 'open')
              .ilike('commitment', `%${item}%`))
          )
        : []),

      // f. Upsert debrief_logs for debrief sessions.
      // Always log a completed debrief — even if no numeric score was inferred —
      // so the day still counts toward streaks and captures tomorrow's priority.
      // Open chats never produce a debrief log.
      ...(mode === 'debrief'
        ? [wrap(supabaseAdmin.from('debrief_logs').upsert(
            {
              user_id: userId,
              session_id: sessionId,
              debrief_date: today,
              score_overall: s.score_overall ?? null,
              hydration_litres: s.hydration_litres ?? null,
              sleep_hours: s.sleep_hours ?? null,
              dairy_violation: s.dairy_violation ?? false,
              workout_done: s.workout_done ?? false,
              win: s.win ?? null,
              failure: s.failure ?? null,
              tomorrow_priority: s.tomorrow_priority ?? null,
              daily_spend: s.daily_spend ?? null,
              expense_notes: s.expense_notes ?? null,
              finance_violation: s.finance_violation ?? false,
              violation_detail: s.violation_detail ?? null,
              completed: true,
            },
            { onConflict: 'user_id,debrief_date' }
          ))]
        : []),
    ]

    const results = await Promise.all(ops)
    const failed = results.find((r) => r?.error)
    if (failed) {
      console.error('DB operation failed:', failed.error)
      throw new Error('DB error')
    }

    return {
      new_pattern: extracted.new_pattern,
      new_strength: extracted.new_strength,
      carry_forward: extracted.carry_forward,
    }
}

export async function POST(req: Request) {
  try {
    const { userId } = await auth()
    if (!userId) return new Response('Unauthorized', { status: 401 })

    const { sessionId, messages } = (await req.json()) as {
      sessionId: string
      messages: ChatMessage[]
    }

    // Resolve the mode from the DB rather than trusting the client, so debrief
    // logs are only written for genuine debrief sessions.
    const { data: session } = await supabaseAdmin
      .from('sessions')
      .select('mode')
      .eq('id', sessionId)
      .eq('user_id', userId)
      .maybeSingle()

    const mode: SessionMode = session?.mode === 'debrief' ? 'debrief' : 'open_chat'

    const extracted = await runSessionExtraction(userId, sessionId, messages, mode)
    return Response.json({ success: true, extracted })
  } catch (error) {
    console.error('Extraction error:', error)
    if (error instanceof Response) return error
    if (error instanceof Error && error.message === 'JSON parse error') {
      return new Response('JSON parse error', { status: 500 })
    }
    if (error instanceof Error && error.message === 'DB error') {
      return new Response('DB error', { status: 500 })
    }
    return new Response('Internal server error', { status: 500 })
  }
}
