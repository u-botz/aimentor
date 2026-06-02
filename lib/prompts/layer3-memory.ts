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
}

export type OpenCommitment = {
  commitment: string
  made_on: string
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

  const commitmentText = openCommitments.length
    ? openCommitments
        .map(
          (c) =>
            `- "${c.commitment}" (since ${new Date(c.made_on).toDateString()})`
        )
        .join('\n')
    : '- None open'

  const lastSessionText = lastSession
    ? `DATE: ${new Date(lastSession.date).toDateString()}
NOTE: ${lastSession.carry_forward}
PRIORITY SET: ${lastSession.tomorrow_priority ?? 'Not set'}`
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
