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

  // Strictness controls DELIVERY REGISTER, not accountability level. L1 sets
  // the core character (direct, honest, no excuses). These instructions tune
  // phrasing and warmth so the user's preference is honoured without
  // contradicting the base character.
  const strictnessLabel = {
    1: 'Soften your phrasing — lead with curiosity before challenge. Still hold the standard; just carry it more gently.',
    2: 'Lean toward encouragement when the user is trying. Reserve the blunt frame for clear patterns of avoidance.',
    3: 'Default register — honest and direct, balanced with recognition when it is earned.',
    4: 'Be direct and unsparing. Acknowledge effort briefly; move quickly to what needs to change.',
    5: 'Maximum directness. Minimum softening. Name the pattern plainly. The user has asked for no buffer.',
  }[user.strictness ?? 3] ?? 'Default register — honest and direct, balanced with recognition when it is earned.'

  const userLines = [
    `Name: ${user.name}`,
    user.age ? `Age: ${user.age}` : null,
    user.role ? `Current role: ${user.role}` : null,
    user.primary_goal ? `Primary goal: ${user.primary_goal}` : null,
    `Active since: ${user.created_at ? new Date(user.created_at).toDateString() : 'Today'}`,
    `Tracked domains: ${trackedDomainLine}`,
  ].filter(Boolean).join('\n')

  return `
## YOUR USER
${userLines}

## THEIR NON-NEGOTIABLES
These are the user's own committed rules. Hold them to these.
${nonNeg}
${trackHealth ? '' : '(Health tracking not enabled — do not ask about food, hydration, sleep, or movement.)'}
${trackFinance ? '' : '(Finance tracking not enabled — do not ask about spending, expenses, or finance rules.)'}

## KNOWN PATTERNS TO WATCH
${patterns}

## DELIVERY REGISTER
${strictnessLabel}
Communication style: ${user.communication_style ?? 'Direct'}
`.trim()
}
