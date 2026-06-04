import { supabaseAdmin } from '@/lib/supabase/admin'
import { istDateString } from '@/lib/date'
import type {
  UserMemory,
  OpenCommitment,
  LastSession,
} from '@/lib/prompts/layer3-memory'

// Whole IST calendar days between two YYYY-MM-DD strings (UTC midnight math).
function istDaysBetween(from: string, to: string): number {
  const a = Date.parse(`${from}T00:00:00Z`)
  const b = Date.parse(`${to}T00:00:00Z`)
  if (Number.isNaN(a) || Number.isNaN(b)) return 0
  return Math.max(0, Math.round((b - a) / 86_400_000))
}

function latestISTDate(...candidates: (string | null | undefined)[]): string | null {
  const valid = candidates.filter(
    (d): d is string => typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d)
  )
  if (valid.length === 0) return null
  return valid.sort().at(-1) ?? null
}

export async function fetchMemoryContext(userId: string): Promise<{
  memory: UserMemory
  lastSession: LastSession | null
  openCommitments: OpenCommitment[]
}> {
  const [userRes, summaryRes, debriefRes, commitmentsRes, lastClosedRes] =
    await Promise.all([
    supabaseAdmin
      .from('users')
      .select('name, identity_patterns, identity_strengths, medium_term_memory')
      .eq('id', userId)
      .single(),

    supabaseAdmin
      .from('session_summaries')
      .select('summary, summary_date')
      .eq('user_id', userId)
      .order('summary_date', { ascending: false })
      .limit(1)
      .single(),

    supabaseAdmin
      .from('debrief_logs')
      .select('debrief_date, tomorrow_priority')
      .eq('user_id', userId)
      .eq('completed', true)
      .order('debrief_date', { ascending: false })
      .limit(1)
      .single(),

    supabaseAdmin
      .from('open_commitments')
      .select('commitment, made_on, due_date')
      .eq('user_id', userId)
      .eq('status', 'open')
      .order('made_on', { ascending: false })
      .limit(5),

    supabaseAdmin
      .from('sessions')
      .select('mode, closed_at, debrief_date')
      .eq('user_id', userId)
      .eq('status', 'closed')
      .not('closed_at', 'is', null)
      .order('closed_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ])

  const u = userRes.data
  const memory: UserMemory = {
    name: u?.name ?? '',
    identity_patterns: u?.identity_patterns ?? [],
    identity_strengths: u?.identity_strengths ?? [],
    medium_term_memory: u?.medium_term_memory ?? null,
  }

  const lastSummary = summaryRes.data
  const lastDebrief = debriefRes.data
  const lastClosed = lastClosedRes.data

  let lastDebriefCompleted: boolean | null = null
  if (lastClosed?.mode === 'debrief' && lastClosed.debrief_date) {
    const { data: debriefLog } = await supabaseAdmin
      .from('debrief_logs')
      .select('completed')
      .eq('user_id', userId)
      .eq('debrief_date', lastClosed.debrief_date)
      .maybeSingle()
    lastDebriefCompleted = debriefLog?.completed ?? false
  }

  const closedAtIST = lastClosed?.closed_at
    ? istDateString(new Date(lastClosed.closed_at))
    : null

  const last_interaction_date = latestISTDate(
    lastSummary?.summary_date,
    lastDebrief?.debrief_date,
    closedAtIST
  )

  const today = istDateString()
  const days_since_last =
    last_interaction_date !== null
      ? istDaysBetween(last_interaction_date, today)
      : null

  let lastSession: LastSession | null = null
  if (lastSummary || lastDebrief || lastClosed) {
    lastSession = {
      date: lastDebrief?.debrief_date ?? lastSummary?.summary_date ?? '',
      carry_forward: lastSummary?.summary ?? '',
      tomorrow_priority: lastDebrief?.tomorrow_priority ?? null,
      closed_at: lastClosed?.closed_at ?? null,
      mode: lastClosed?.mode ?? null,
      completed: lastDebriefCompleted,
      last_interaction_date,
      days_since_last,
    }
  }

  const openCommitments: OpenCommitment[] = (commitmentsRes.data ?? []) as OpenCommitment[]

  return { memory, lastSession, openCommitments }
}
