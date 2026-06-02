export type UserProfile = {
  name: string
  age?: number
  role?: string
  primary_goal?: string
  non_negotiables?: string[]
  active_patterns?: string[]
  strictness?: number
  communication_style?: string
  created_at?: string
}

export function buildUserLayer(user: UserProfile): string {
  const nonNeg = user.non_negotiables?.length
    ? user.non_negotiables.map(r => `- ${r}`).join('\n')
    : '- None set yet'

  const patterns = user.active_patterns?.length
    ? user.active_patterns.map(p => `- ${p}`).join('\n')
    : '- No patterns detected yet'

  const strictnessLabel = {
    1: 'Gentle and encouraging',
    2: 'Supportive with light accountability',
    3: 'Balanced — honest but kind',
    4: 'Strict — high standards, direct feedback',
    5: 'Very strict — no excuses accepted',
  }[user.strictness ?? 3] ?? 'Balanced'

  return `
## YOUR USER
Name: ${user.name}
${user.age ? `Age: ${user.age}` : ''}
${user.role ? `Current role: ${user.role}` : ''}
${user.primary_goal ? `Primary goal: ${user.primary_goal}` : ''}
Active since: ${user.created_at ? new Date(user.created_at).toDateString() : 'Today'}

## THEIR NON-NEGOTIABLES
These are the user's own committed rules. Hold them to these.
${nonNeg}

## KNOWN PATTERNS TO WATCH
${patterns}

## MENTOR TONE
Strictness: ${strictnessLabel}
Style: ${user.communication_style ?? 'Direct'}
`.trim()
}
