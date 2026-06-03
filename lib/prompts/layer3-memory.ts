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
}

export type OpenCommitment = {
  commitment: string
  made_on: string
  due_date?: string | null
}

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

  const todayIST = new Date().toLocaleDateString('en-CA', {
    timeZone: 'Asia/Kolkata',
  })

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

  const lastSessionText = lastSession
    ? `DATE: ${new Date(lastSession.date).toDateString()}
NOTE: ${lastSession.carry_forward}
PRIORITY SET: ${lastSession.tomorrow_priority ?? 'Not set'}
LAST CLOSED: ${lastSession.closed_at ?? 'unknown'}
SESSION MODE: ${lastSession.mode ?? 'unknown'}
DEBRIEF COMPLETED: ${lastSession.completed === null ? 'n/a' : lastSession.completed ? 'yes' : 'no'}`
    : 'No previous sessions yet'

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
