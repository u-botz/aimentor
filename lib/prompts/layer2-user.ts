export type UserProfile = {
  name: string
  age?: number
  role?: string
  primary_goal?: string
  non_negotiables?: string[]
  tracked_domains?: string[]
  active_patterns?: string[]
  strictness?: number
  communication_style?: string
  created_at?: string
}

export function buildUserLayer(user: UserProfile): string {
  const tracked = user.tracked_domains ?? ['work']
  const trackHealth = tracked.includes('health')
  const trackFinance = tracked.includes('finance')

  const allRules = user.non_negotiables ?? []
  // Finance-flavoured rules are shown only when finance tracking is on.
  // Since rules aren't tagged by domain, we use a heuristic: rules containing
  // spend / expense / ₹ / budget / finance keywords are treated as finance rules.
  const financeKeywords = /spend|expense|₹|budget|financ|cost|money|purchase/i
  const financeRules = allRules.filter((r) => financeKeywords.test(r))
  const nonFinanceRules = allRules.filter((r) => !financeKeywords.test(r))

  const visibleRules = trackFinance ? allRules : nonFinanceRules
  const nonNeg = visibleRules.length ? visibleRules.map(r => `- ${r}`).join('\n') : '- None set yet'

  const trackedDomainLine = [
    'Work & Priorities',
    ...(trackHealth ? ['Health'] : []),
    ...(trackFinance ? ['Finance'] : []),
  ].join(', ')

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
Tracked domains: ${trackedDomainLine}

## THEIR NON-NEGOTIABLES
These are the user's own committed rules. Hold them to these.
${nonNeg}
${trackHealth ? '' : '(Health tracking not enabled — do not ask about food, hydration, sleep, or movement.)'}
${trackFinance ? '' : '(Finance tracking not enabled — do not ask about spending, expenses, or finance rules.)'}

## KNOWN PATTERNS TO WATCH
${patterns}

## MENTOR TONE
Strictness: ${strictnessLabel}
Style: ${user.communication_style ?? 'Direct'}
`.trim()
}
