import { supabaseAdmin } from '@/lib/supabase/admin'
import type {
  UserMemory,
  OpenCommitment,
  LastSession,
} from '@/lib/prompts/layer3-memory'

export async function fetchMemoryContext(userId: string): Promise<{
  memory: UserMemory
  lastSession: LastSession | null
  openCommitments: OpenCommitment[]
}> {
  const [userRes, summaryRes, debriefRes, commitmentsRes] = await Promise.all([
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
      .order('debrief_date', { ascending: false })
      .limit(1)
      .single(),

    supabaseAdmin
      .from('open_commitments')
      .select('commitment, made_on')
      .eq('user_id', userId)
      .eq('status', 'open')
      .order('made_on', { ascending: false })
      .limit(5),
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

  let lastSession: LastSession | null = null
  if (lastSummary || lastDebrief) {
    lastSession = {
      date: lastDebrief?.debrief_date ?? lastSummary?.summary_date ?? '',
      carry_forward: lastSummary?.summary ?? '',
      tomorrow_priority: lastDebrief?.tomorrow_priority ?? null,
    }
  }

  const openCommitments: OpenCommitment[] = (commitmentsRes.data ?? []) as OpenCommitment[]

  return { memory, lastSession, openCommitments }
}
