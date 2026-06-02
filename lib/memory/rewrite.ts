import Anthropic from '@anthropic-ai/sdk'
import { supabaseAdmin } from '@/lib/supabase/admin'

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY!,
})

const THREE_DAYS_MS = 3 * 24 * 60 * 60 * 1000

export type RewriteResult =
  | { skipped: true; reason: string }
  | { success: true; memory: string }

export async function rewriteMemory(userId: string): Promise<RewriteResult> {
  // ── Step 2: Check if rewrite is needed ──────────────────────────────────────
  const { data: userRow } = await supabaseAdmin
    .from('users')
    .select('memory_updated_at, name, identity_patterns, identity_strengths, medium_term_memory')
    .eq('id', userId)
    .single()

  if (userRow?.memory_updated_at) {
    const lastUpdate = new Date(userRow.memory_updated_at).getTime()
    if (Date.now() - lastUpdate < THREE_DAYS_MS) {
      return { skipped: true, reason: 'Updated recently' }
    }
  }

  // ── Step 3: Fetch raw material in parallel ───────────────────────────────────
  const tenDaysAgo = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000)
    .toISOString()
    .split('T')[0]

  const [summariesRes, debriefRes] = await Promise.all([
    supabaseAdmin
      .from('session_summaries')
      .select('summary, summary_date')
      .eq('user_id', userId)
      .gte('summary_date', tenDaysAgo)
      .order('summary_date', { ascending: false })
      .limit(10),

    supabaseAdmin
      .from('debrief_logs')
      .select(
        'debrief_date, score_overall, hydration_litres, sleep_hours, dairy_violation, workout_done, win, failure, tomorrow_priority'
      )
      .eq('user_id', userId)
      .gte('debrief_date', tenDaysAgo)
      .order('debrief_date', { ascending: false })
      .limit(10),
  ])

  const summaries = summariesRes.data ?? []
  const debriefLogs = debriefRes.data ?? []

  // ── Step 4: Skip if no data ──────────────────────────────────────────────────
  if (summaries.length === 0 && debriefLogs.length === 0) {
    return { skipped: true, reason: 'No data yet' }
  }

  // ── Step 5: Build Claude prompt ──────────────────────────────────────────────
  const name = userRow?.name ?? 'User'
  const identity_patterns: string[] = userRow?.identity_patterns ?? []
  const identity_strengths: string[] = userRow?.identity_strengths ?? []

  const summariesText =
    summaries.length > 0
      ? summaries.map((s) => `${s.summary_date}: ${s.summary}`).join('\n')
      : 'No session notes in the last 10 days.'

  const debriefText =
    debriefLogs.length > 0
      ? debriefLogs
          .map(
            (d) =>
              `${d.debrief_date}: sleep ${d.sleep_hours ?? '?'}hrs, ` +
              `hydration ${d.hydration_litres ?? '?'}L, ` +
              `workout ${d.workout_done ? 'yes' : 'no'}, ` +
              `score ${d.score_overall ?? '?'}/10`
          )
          .join('\n')
      : 'No debrief data in the last 10 days.'

  const userPrompt = `USER: ${name}
KNOWN PATTERNS: ${identity_patterns.length ? identity_patterns.join(', ') : 'none yet'}
KNOWN STRENGTHS: ${identity_strengths.length ? identity_strengths.join(', ') : 'none yet'}

RECENT SESSION NOTES (last 10 days):
${summariesText}

RECENT HEALTH DATA:
${debriefText}

Write one paragraph (4-6 sentences) describing:
- Their current momentum and energy
- What they are struggling with right now
- What is going well
- Any concerning patterns in the last 10 days

Write it as if briefing a mentor before a session.
Be specific. Use the actual data. No generic statements.`

  const response = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 300,
    system:
      'You are a memory summarizer for a personal mentor AI. Write a concise paragraph summarizing where this person is right now based on recent data. Return ONLY the paragraph. No labels. No JSON. No preamble.',
    messages: [{ role: 'user', content: userPrompt }],
  })

  const memory =
    response.content[0]?.type === 'text' ? response.content[0].text.trim() : ''

  if (!memory) {
    throw new Error('Claude returned empty memory paragraph')
  }

  // ── Step 6: Save the paragraph ───────────────────────────────────────────────
  const { error } = await supabaseAdmin
    .from('users')
    .update({
      medium_term_memory: memory,
      memory_updated_at: new Date().toISOString(),
    })
    .eq('id', userId)

  if (error) {
    throw new Error(`Failed to save memory: ${error.message}`)
  }

  // ── Step 7: Return ───────────────────────────────────────────────────────────
  return { success: true, memory }
}
