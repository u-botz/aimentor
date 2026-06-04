import { istDateString } from '@/lib/date'

export type UserMemory = {
  name: string
  identity_patterns: string[]
  identity_strengths: string[]
  medium_term_memory: string | null
}

export type LastSession = {
  date: string
  carry_forward: string
  tomorrow_priority: string | null
  closed_at: string | null
  mode: string | null
  completed: boolean | null
  last_interaction_date: string | null
  days_since_last: number | null
}

export type OpenCommitment = {
  commitment: string
  made_on: string
  due_date?: string | null
}

const ELAPSED_TIME_RULE =
  'Use ONLY the DAYS SINCE LAST INTERACTION figure above when referring ' +
  'to elapsed time. Do NOT estimate, calculate, or guess how long it has ' +
  'been. If a figure is not provided, do not state a time gap at all.'

export function buildMemoryLayer(
  memory: UserMemory,
  lastSession: LastSession | null,
  openCommitments: OpenCommitment[]
): string {
  // New user — no memory yet
  if (!memory.identity_patterns.length && !memory.medium_term_memory) {
    return `
## MEMORY CONTEXT
This is a new user. You are meeting them for the first time.
Be warm. Establish your character early. Ask what's on their mind.
`.trim()
  }

  const patternsText = memory.identity_patterns.length
    ? memory.identity_patterns.map((p) => `- ${p}`).join('\n')
    : '- Still learning'

  const strengthsText = memory.identity_strengths.length
    ? memory.identity_strengths.map((s) => `- ${s}`).join('\n')
    : '- Still learning'

  const todayIST = istDateString()

  const commitmentText = openCommitments.length
    ? openCommitments
        .map((c) => {
          const madeOn = c.made_on
          const due = c.due_date ?? null
          if (due && due < todayIST) {
            return `- "${c.commitment}" — OVERDUE since ${due} (made on ${madeOn})`
          }
          if (due) {
            return `- "${c.commitment}" — made on ${madeOn}, DUE ${due}`
          }
          return `- "${c.commitment}" — made on ${madeOn}`
        })
        .join('\n')
    : '- None open'

  const daysSinceLabel =
    lastSession?.days_since_last === null || lastSession?.days_since_last === undefined
      ? 'first session'
      : String(lastSession.days_since_last)

  const lastSessionText = lastSession
    ? `LAST INTERACTION: ${lastSession.last_interaction_date ?? 'unknown'} (YYYY-MM-DD)
DAYS SINCE LAST INTERACTION: ${daysSinceLabel}
TODAY: ${todayIST}
NOTE: ${lastSession.carry_forward}
PRIORITY SET: ${lastSession.tomorrow_priority ?? 'Not set'}
SESSION MODE: ${lastSession.mode ?? 'unknown'}
DEBRIEF COMPLETED: ${lastSession.completed === null ? 'n/a' : lastSession.completed ? 'yes' : 'no'}

${ELAPSED_TIME_RULE}`
    : `LAST INTERACTION: none (first session)
DAYS SINCE LAST INTERACTION: first session
TODAY: ${todayIST}
(No prior session notes yet)

${ELAPSED_TIME_RULE}`

  return `
## MEMORY CONTEXT

WHO THEY ARE
Patterns:
${patternsText}

Strengths:
${strengthsText}

WHERE THEY ARE NOW
${memory.medium_term_memory ?? 'Not enough data yet — still building picture.'}

LAST SESSION
${lastSessionText}

OPEN COMMITMENTS
${commitmentText}
`.trim()
}
