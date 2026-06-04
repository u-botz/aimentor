'use client'

import { useEffect, useState } from 'react'
import { useUser } from '@clerk/nextjs'
import { useRouter } from 'next/navigation'
import { Briefcase, ChevronLeft, Heart, Wallet, X } from 'lucide-react'
import { cn } from '@/lib/utils'

const TOTAL_STEPS = 6

const RULE_SUGGESTIONS: { category: string; items: string[] }[] = [
  {
    category: 'Health',
    items: [
      'No junk food',
      '8 hrs sleep',
      '3L water daily',
      'No alcohol',
      '30 min workout',
    ],
  },
  {
    category: 'Work',
    items: [
      '2 hrs deep work daily',
      'No phone before 9am',
      'No social media before noon',
      'Ship something every day',
    ],
  },
  {
    category: 'Finance',
    items: [
      'Log every expense daily',
      'No impulse buy above ₹500',
      'No food delivery more than 3x/week',
      'Weekly spend under ₹3,000',
    ],
  },
]

const GOAL_PLACEHOLDERS = [
  'Stay consistent with my morning routine',
  'Build discipline around sleep and fitness',
  'Stop procrastinating on deep work',
]

const GOAL_AREA_OPTIONS = [
  'Consistency',
  'Focus & work',
  'Health',
  'Finances',
  'Relationships',
  'Other',
] as const

const DEBRIEF_TIME_OPTIONS = [
  { label: '9:00 PM',  value: '21:00', sub: 'Early wind-down' },
  { label: '9:30 PM',  value: '21:30', sub: 'Before 10' },
  { label: '10:00 PM', value: '22:00', sub: 'Most popular' },
  { label: '10:30 PM', value: '22:30', sub: 'Late night' },
]

const MORNING_TIME_OPTIONS = [
  { label: '7:00 AM', value: '07:00', sub: 'Early riser' },
  { label: '8:00 AM', value: '08:00', sub: 'Most popular' },
  { label: '9:00 AM', value: '09:00', sub: 'Slow start' },
  { label: 'Off',     value: 'off',   sub: 'Skip mornings' },
]

const STRICTNESS_LABELS: Record<number, string> = {
  1: 'Gentle — supportive first, never harsh',
  2: "Soft — nudges you, doesn't push hard",
  3: "Balanced — holds you to it, but won't pile on",
  4: 'Strict — calls it out directly, no softening',
  5: 'Very strict — no excuses, high standards always',
}

const STRICTNESS_PREVIEWS: Record<number, string> = {
  1: "Hey — you missed your workout today. That's okay, rest days happen. What's the plan for tomorrow?",
  2: "Workout didn't happen today. Worth checking in — is something getting in the way this week?",
  3: "You skipped your workout again. That's three days in a row — what's actually getting in the way?",
  4: "Three missed workouts. That's a pattern, not a blip. What are you going to do differently tomorrow?",
  5: "Three days missed. No excuse changes that. What's the plan — and why will tomorrow be different?",
}

const ROLE_OPTIONS = [
  'Student',
  'Working',
  'Freelancer',
  'Founder',
  'Job hunting',
  'Other',
] as const

type CommunicationStyle = 'Direct' | 'Balanced' | 'Encouraging'

const FEEDBACK_STYLES: CommunicationStyle[] = [
  'Direct',
  'Balanced',
  'Encouraging',
]

export default function OnboardingPage() {
  const router = useRouter()
  const { user, isLoaded } = useUser()

  const [step, setStep] = useState(1)
  const [transitioning, setTransitioning] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  const [name, setName] = useState('')
  const [age, setAge] = useState('')
  const [role, setRole] = useState('')
  const [roleDetail, setRoleDetail] = useState('')
  const [primaryGoal, setPrimaryGoal] = useState('')
  const [primaryGoalArea, setPrimaryGoalArea] = useState('')
  const [goalDetail, setGoalDetail] = useState('')
  const [ruleInput, setRuleInput] = useState('')
  const [nonNegotiables, setNonNegotiables] = useState<string[]>([])
  const [strictness, setStrictness] = useState(3)
  const [communicationStyle, setCommunicationStyle] =
    useState<CommunicationStyle>('Balanced')
  const [trackedDomains, setTrackedDomains] = useState<string[]>(['work', 'health'])
  const [reminderTime, setReminderTime] = useState('22:00')
  const [morningTime, setMorningTime] = useState('08:00')
  const [morningEnabled, setMorningEnabled] = useState(true)

  useEffect(() => {
    fetch('/api/user/sync', { method: 'POST' }).catch(console.error)
  }, [])

  useEffect(() => {
    if (!isLoaded || !user) return
    fetch('/api/user/profile')
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { onboarded?: boolean } | null) => {
        if (data?.onboarded) router.replace('/dashboard')
      })
      .catch(console.error)
  }, [isLoaded, user, router])

  useEffect(() => {
    if (!isLoaded || !user) return
    const clerkName =
      user.fullName ||
      [user.firstName, user.lastName].filter(Boolean).join(' ')
    if (clerkName && !name) setName(clerkName)
  }, [isLoaded, user, name])

  const goToStep = (next: number) => {
    setTransitioning(true)
    setTimeout(() => {
      setStep(next)
      setTransitioning(false)
    }, 150)
  }

  const addRule = () => {
    const trimmed = ruleInput.trim()
    if (!trimmed || nonNegotiables.includes(trimmed)) return
    setNonNegotiables((prev) => [...prev, trimmed])
    setRuleInput('')
  }

  const removeRule = (rule: string) => {
    setNonNegotiables((prev) => prev.filter((r) => r !== rule))
  }

  const handleRuleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      addRule()
    }
  }

  const canProceed = (): boolean => {
    switch (step) {
      case 1:
        return name.trim().length > 0 && age !== '' && role.trim().length > 0
      case 2:
        return primaryGoalArea.trim().length > 0
      case 3:
        return true
      case 4:
        return true // work is always on; health/finance are optional toggles
      case 5:
        return communicationStyle.length > 0
      case 6:
        return reminderTime.length > 0
      default:
        return false
    }
  }

  const handleNext = async () => {
    setError('')
    if (step < TOTAL_STEPS) {
      goToStep(step + 1)
      return
    }

    setSubmitting(true)
    try {
      await fetch('/api/user/sync', { method: 'POST' })

      const res = await fetch('/api/user/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          age: Number(age),
          role: roleDetail.trim() ? `${role} — ${roleDetail.trim()}` : role,
          primary_goal: goalDetail.trim()
            ? `${primaryGoalArea} — ${goalDetail.trim()}`
            : primaryGoalArea,
          non_negotiables: nonNegotiables,
          tracked_domains: trackedDomains,
          strictness,
          communication_style: communicationStyle,
          reminder_time: reminderTime,
          morning_time: morningTime,
          morning_enabled: morningEnabled,
          onboarded: true,
        }),
      })

      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}))
        throw new Error(
          (errBody as { error?: string }).error ?? 'Failed to save profile'
        )
      }

      // Hard navigation so middleware sees onboarded=true (soft router.push can loop back here)
      window.location.assign('/dashboard')
    } catch (err) {
      console.error('Onboarding submit error:', err)
      setError('Something went wrong. Please try again.')
      setSubmitting(false)
    }
  }

  const handleBack = () => {
    if (step > 1) goToStep(step - 1)
  }

  const progress = (step / TOTAL_STEPS) * 100

  return (
    <div className="flex min-h-dvh flex-col bg-[#0a0a0f] text-zinc-100">
      <div className="mx-auto w-full max-w-[480px] flex-1 px-5 py-8">
        <div className="mb-8">
          <div className="mb-2 flex items-center justify-between text-xs text-zinc-500">
            <span>
              Step {step} of {TOTAL_STEPS}
            </span>
            <span>{Math.round(progress)}%</span>
          </div>
          <div className="h-1 overflow-hidden rounded-full bg-zinc-800">
            <div
              className="h-full rounded-full bg-[#2E5BFF] transition-all duration-300 ease-out"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>

        <div
          className={cn(
            'transition-all duration-300 ease-in-out',
            transitioning
              ? 'translate-x-2 opacity-0'
              : 'translate-x-0 opacity-100'
          )}
        >
          {step === 1 && (
            <div className="space-y-6">
              <div>
                <h1 className="text-xl font-semibold tracking-tight">
                  Basic info
                </h1>
                <p className="mt-1 text-sm text-zinc-500">
                  Help your mentor know who you are.
                </p>
              </div>
              <label className="block space-y-2">
                <span className="text-sm text-zinc-400">Name</span>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full rounded-lg border border-zinc-800 bg-zinc-900/50 px-3 py-2.5 text-sm outline-none focus:border-[#2E5BFF] focus:ring-1 focus:ring-[#2E5BFF]"
                />
              </label>
              <label className="block space-y-2">
                <span className="text-sm text-zinc-400">Age</span>
                <input
                  type="number"
                  min={13}
                  max={120}
                  value={age}
                  onChange={(e) => setAge(e.target.value)}
                  className="w-full rounded-lg border border-zinc-800 bg-zinc-900/50 px-3 py-2.5 text-sm outline-none focus:border-[#2E5BFF] focus:ring-1 focus:ring-[#2E5BFF]"
                />
              </label>
              <div className="space-y-3">
                <span className="text-sm text-zinc-400">
                  What best describes you right now?
                </span>
                <div className="flex flex-wrap gap-2">
                  {ROLE_OPTIONS.map((option) => {
                    const selected = role === option
                    return (
                      <button
                        key={option}
                        type="button"
                        onClick={() => setRole(option)}
                        className={cn(
                          'rounded-lg border px-3 py-2 text-sm font-medium transition-colors',
                          selected
                            ? 'border-[#2E5BFF]/60 bg-[#2E5BFF]/10 text-zinc-100'
                            : 'border-zinc-800 bg-zinc-900/50 text-zinc-400 hover:border-zinc-700 hover:text-zinc-200'
                        )}
                      >
                        {option}
                      </button>
                    )
                  })}
                </div>
                <label className="block space-y-2">
                  <span className="text-sm text-zinc-400">
                    Tell us more (optional)
                  </span>
                  <input
                    type="text"
                    value={roleDetail}
                    onChange={(e) => setRoleDetail(e.target.value)}
                    placeholder="e.g. Final year CS, building a startup, 2 years into my first job…"
                    className="w-full rounded-lg border border-zinc-800 bg-zinc-900/50 px-3 py-2.5 text-sm outline-none placeholder:text-zinc-600 focus:border-[#2E5BFF] focus:ring-1 focus:ring-[#2E5BFF]"
                  />
                </label>
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-6">
              <div>
                <h1 className="text-xl font-semibold tracking-tight">
                  Your goal
                </h1>
                <p className="mt-1 text-sm text-zinc-500">
                  Pick the area you most want to work on.
                </p>
              </div>
              <div className="space-y-3">
                <span className="text-xs font-medium uppercase tracking-[0.04em] text-zinc-500">
                  Area
                </span>
                <div className="flex flex-wrap gap-2">
                  {GOAL_AREA_OPTIONS.map((option) => {
                    const selected = primaryGoalArea === option
                    return (
                      <button
                        key={option}
                        type="button"
                        onClick={() => setPrimaryGoalArea(option)}
                        className={cn(
                          'rounded-lg border px-3 py-2 text-sm font-medium transition-colors',
                          selected
                            ? 'border-[#2E5BFF]/60 bg-[#2E5BFF]/10 text-zinc-100'
                            : 'border-zinc-800 bg-zinc-900/50 text-zinc-400 hover:border-zinc-700 hover:text-zinc-200'
                        )}
                      >
                        {option}
                      </button>
                    )
                  })}
                </div>
                <div className="space-y-2">
                  <span className="text-sm text-zinc-400">
                    What does that look like for you?{' '}
                    <span className="text-zinc-600">(optional)</span>
                  </span>
                  <textarea
                    value={goalDetail}
                    onChange={(e) => setGoalDetail(e.target.value)}
                    rows={4}
                    placeholder="e.g. I skip the gym every time work gets busy…"
                    className="w-full resize-none rounded-lg border border-zinc-800 bg-zinc-900/50 px-3 py-3 text-sm leading-relaxed outline-none placeholder:text-zinc-600 focus:border-[#2E5BFF] focus:ring-1 focus:ring-[#2E5BFF]"
                  />
                  <p className="text-xs italic text-zinc-600">
                    The more honest you are, the sharper your mentor gets.
                  </p>
                </div>
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-6">
              <div>
                <h1 className="text-xl font-semibold tracking-tight">
                  Your rules
                </h1>
                <p className="mt-1 text-sm text-zinc-500">
                  What are your non-negotiables?
                </p>
              </div>

              {/* Section A — Added rules */}
              <div className="min-h-[36px]">
                {nonNegotiables.length === 0 ? (
                  <p className="text-xs italic text-zinc-600">
                    Your rules will appear here
                  </p>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {nonNegotiables.map((rule) => (
                      <span
                        key={rule}
                        className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-[#2E5BFF]/60 bg-[#2E5BFF]/10 px-3 py-1 text-xs text-zinc-100"
                      >
                        {rule}
                        <button
                          type="button"
                          onClick={() => removeRule(rule)}
                          aria-label={`Remove ${rule}`}
                          className="text-zinc-400 hover:text-zinc-200 transition-colors"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {/* Section B — Suggestion chips by category */}
              <div className="space-y-4">
                {RULE_SUGGESTIONS.map(({ category, items }) => (
                  <div key={category} className="space-y-2">
                    <p
                      className="text-[10px] font-medium uppercase tracking-[0.06em] text-zinc-500"
                    >
                      {category}
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {items.map((item) => {
                        const added = nonNegotiables.includes(item)
                        return (
                          <button
                            key={item}
                            type="button"
                            onClick={() =>
                              setNonNegotiables((prev) =>
                                added
                                  ? prev.filter((r) => r !== item)
                                  : [...prev, item]
                              )
                            }
                            className={cn(
                              'rounded-full border px-[11px] py-[5px] text-xs font-medium transition-colors',
                              added
                                ? 'border-[#2E5BFF]/60 bg-[#2E5BFF]/10 text-zinc-100'
                                : 'border-zinc-800 bg-[#1a1a1a] text-zinc-400 hover:border-zinc-700 hover:text-zinc-200'
                            )}
                          >
                            <span
                              className={cn(
                                'mr-1 font-semibold',
                                added ? 'text-[#2E5BFF]' : 'text-[#4A6FFF]'
                              )}
                            >
                              {added ? '✓' : '+'}
                            </span>
                            {item}
                          </button>
                        )
                      })}
                    </div>
                  </div>
                ))}
              </div>

              {/* Section C — Custom rule input */}
              <div className="space-y-2">
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={ruleInput}
                    onChange={(e) => setRuleInput(e.target.value)}
                    onKeyDown={handleRuleKeyDown}
                    placeholder="Write your own rule…"
                    className="flex-1 rounded-lg border border-zinc-800 bg-zinc-900/50 px-3 py-2.5 text-sm outline-none placeholder:text-zinc-600 focus:border-[#2E5BFF] focus:ring-1 focus:ring-[#2E5BFF]"
                  />
                  <button
                    type="button"
                    onClick={addRule}
                    disabled={!ruleInput.trim()}
                    className="shrink-0 rounded-lg bg-[#2E5BFF] px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-[#2548d4] disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    Add
                  </button>
                </div>
                <p className="text-xs italic text-zinc-600">
                  You can always add more later.
                </p>
              </div>
            </div>
          )}

          {step === 4 && (
            <div className="space-y-6">
              <div>
                <h1 className="text-xl font-semibold tracking-tight">
                  What should your mentor track?
                </h1>
                <p className="mt-1 text-sm text-zinc-500">
                  Turn off anything you don&apos;t want asked about.
                </p>
              </div>
              <div className="flex flex-col gap-3">
                {/* Work & Priorities — locked on */}
                <div
                  className="flex items-start gap-4 rounded-xl border px-4 py-3.5"
                  style={{ borderColor: '#2a3a6a', background: '#141824' }}
                >
                  <Briefcase className="mt-0.5 h-5 w-5 shrink-0 text-[#2E5BFF]" />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-zinc-100">Work &amp; Priorities</p>
                    <p className="text-xs text-zinc-500">Tasks, deep work, what actually got done</p>
                  </div>
                  <span className="shrink-0 rounded-full bg-[#2E5BFF]/20 px-2 py-0.5 text-[10px] font-medium text-[#2E5BFF]">
                    Always on
                  </span>
                </div>
                {/* Health — toggle */}
                <button
                  type="button"
                  onClick={() =>
                    setTrackedDomains((prev) =>
                      prev.includes('health')
                        ? prev.filter((d) => d !== 'health')
                        : [...prev, 'health']
                    )
                  }
                  className="flex items-start gap-4 rounded-xl border px-4 py-3.5 text-left transition-colors"
                  style={
                    trackedDomains.includes('health')
                      ? { borderColor: '#2a3a6a', background: '#141824' }
                      : { borderColor: '#222', background: '#161616' }
                  }
                >
                  <Heart className="mt-0.5 h-5 w-5 shrink-0 text-zinc-400" />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-zinc-100">Health</p>
                    <p className="text-xs text-zinc-500">Sleep, food, water, movement — the basics</p>
                  </div>
                  <span className={cn(
                    'shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium',
                    trackedDomains.includes('health')
                      ? 'bg-[#2E5BFF]/20 text-[#2E5BFF]'
                      : 'bg-zinc-800 text-zinc-500'
                  )}>
                    {trackedDomains.includes('health') ? 'On' : 'Off'}
                  </span>
                </button>
                {/* Finance — toggle */}
                <button
                  type="button"
                  onClick={() =>
                    setTrackedDomains((prev) =>
                      prev.includes('finance')
                        ? prev.filter((d) => d !== 'finance')
                        : [...prev, 'finance']
                    )
                  }
                  className="flex items-start gap-4 rounded-xl border px-4 py-3.5 text-left transition-colors"
                  style={
                    trackedDomains.includes('finance')
                      ? { borderColor: '#2a3a6a', background: '#141824' }
                      : { borderColor: '#222', background: '#161616' }
                  }
                >
                  <Wallet className="mt-0.5 h-5 w-5 shrink-0 text-zinc-400" />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-zinc-100">Finance</p>
                    <p className="text-xs text-zinc-500">Spending, impulse buys, weekly budget</p>
                  </div>
                  <span className={cn(
                    'shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium',
                    trackedDomains.includes('finance')
                      ? 'bg-[#2E5BFF]/20 text-[#2E5BFF]'
                      : 'bg-zinc-800 text-zinc-500'
                  )}>
                    {trackedDomains.includes('finance') ? 'On' : 'Off'}
                  </span>
                </button>
              </div>
              <p className="text-center text-xs italic text-zinc-600">
                You can change these anytime in settings.
              </p>
            </div>
          )}

          {step === 5 && (
            <div className="space-y-8">
              <div>
                <h1 className="text-xl font-semibold tracking-tight">
                  Mentor tone
                </h1>
                <p className="mt-1 text-sm text-zinc-500">
                  How should your mentor show up when you fall short?
                </p>
              </div>
              <div className="space-y-4">
                <input
                  type="range"
                  min={1}
                  max={5}
                  step={1}
                  value={strictness}
                  onChange={(e) => setStrictness(Number(e.target.value))}
                  className="w-full accent-[#2E5BFF]"
                />
                <div className="flex justify-between text-xs text-zinc-500">
                  <span className={cn(strictness === 1 && 'text-[#2E5BFF]')}>
                    Gentle
                  </span>
                  <span className={cn(strictness === 3 && 'text-[#2E5BFF]')}>
                    Balanced
                  </span>
                  <span className={cn(strictness === 5 && 'text-[#2E5BFF]')}>
                    Very strict
                  </span>
                </div>
                <p
                  className="text-center"
                  style={{ fontSize: 13, color: '#4A6FFF', marginTop: 8 }}
                >
                  {STRICTNESS_LABELS[strictness]}
                </p>
              </div>
              <div
                style={{
                  background: '#1a1f3a',
                  border: '1px solid #2a3a6a',
                  borderRadius: 10,
                  padding: '12px 14px',
                  marginBottom: 18,
                }}
              >
                <p
                  style={{
                    fontSize: 10,
                    color: '#4A6FFF',
                    textTransform: 'uppercase',
                    letterSpacing: '0.06em',
                    fontWeight: 500,
                    marginBottom: 7,
                  }}
                >
                  How your mentor sounds
                </p>
                <p
                  style={{
                    fontSize: 12,
                    color: '#8899cc',
                    lineHeight: 1.6,
                    fontStyle: 'italic',
                    margin: 0,
                  }}
                >
                  &ldquo;{STRICTNESS_PREVIEWS[strictness]}&rdquo;
                </p>
              </div>
              <div className="space-y-3">
                <p className="text-sm text-zinc-400">
                  How do you prefer feedback?
                </p>
                <div className="grid grid-cols-3 gap-2">
                  {FEEDBACK_STYLES.map((style) => (
                    <button
                      key={style}
                      type="button"
                      onClick={() => setCommunicationStyle(style)}
                      className={cn(
                        'rounded-lg border px-2 py-2.5 text-sm font-medium transition-colors',
                        communicationStyle === style
                          ? 'border-[#2E5BFF] bg-[#2E5BFF]/15 text-[#2E5BFF]'
                          : 'border-zinc-800 bg-zinc-900/50 text-zinc-400 hover:border-zinc-700 hover:text-zinc-200'
                      )}
                    >
                      {style}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {step === 6 && (
            <div className="space-y-5">
              <div>
                <h1 className="text-xl font-semibold tracking-tight">
                  Check-in times
                </h1>
                <p className="mt-1 text-sm text-zinc-500">
                  When do you usually wind down for the night?
                </p>
              </div>

              {/* Section A — Nightly debrief */}
              <div className="space-y-3">
                <span className="text-xs font-medium uppercase tracking-[0.06em] text-zinc-500">
                  Nightly debrief
                </span>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 7 }}>
                  {DEBRIEF_TIME_OPTIONS.map((opt) => {
                    const active = reminderTime === opt.value
                    return (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => setReminderTime(opt.value)}
                        style={{
                          background: active ? '#1a1f3a' : '#1a1a1a',
                          border: `1px solid ${active ? '#2a3a6a' : '#2a2a2a'}`,
                          borderRadius: 8,
                          padding: '9px 6px',
                          textAlign: 'center',
                          cursor: 'pointer',
                        }}
                      >
                        <p style={{ fontSize: 13, color: active ? '#7fa0ff' : '#777', margin: 0 }}>
                          {opt.label}
                        </p>
                        <p style={{ fontSize: 10, color: active ? '#4a6aaa' : '#555', marginTop: 2 }}>
                          {opt.sub}
                        </p>
                      </button>
                    )
                  })}
                </div>
                <div className="flex items-center gap-3">
                  <span style={{ fontSize: 12, color: '#555' }}>Or set exact time</span>
                  <input
                    type="time"
                    value={reminderTime}
                    onChange={(e) => setReminderTime(e.target.value)}
                    className="rounded-lg border border-zinc-800 bg-zinc-900/50 px-3 py-2 text-sm outline-none focus:border-[#2E5BFF] focus:ring-1 focus:ring-[#2E5BFF] [color-scheme:dark]"
                    style={{ width: 120 }}
                  />
                </div>
              </div>

              <hr style={{ border: 'none', borderTop: '1px solid #1e1e1e', margin: '14px 0' }} />

              {/* Section B — Morning check-in */}
              <div className="space-y-3">
                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-medium uppercase tracking-[0.06em] text-zinc-500">
                    Morning check-in
                  </span>
                  <span className="text-xs text-zinc-600">(optional)</span>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 7 }}>
                  {MORNING_TIME_OPTIONS.map((opt) => {
                    const active =
                      opt.value === 'off'
                        ? !morningEnabled
                        : morningEnabled && morningTime === opt.value
                    return (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => {
                          if (opt.value === 'off') {
                            setMorningEnabled(false)
                          } else {
                            setMorningTime(opt.value)
                            setMorningEnabled(true)
                          }
                        }}
                        style={{
                          background: active ? '#1a1f3a' : '#1a1a1a',
                          border: `1px solid ${active ? '#2a3a6a' : '#2a2a2a'}`,
                          borderRadius: 8,
                          padding: '9px 6px',
                          textAlign: 'center',
                          cursor: 'pointer',
                        }}
                      >
                        <p style={{ fontSize: 13, color: active ? '#7fa0ff' : '#777', margin: 0 }}>
                          {opt.label}
                        </p>
                        <p style={{ fontSize: 10, color: active ? '#4a6aaa' : '#555', marginTop: 2 }}>
                          {opt.sub}
                        </p>
                      </button>
                    )
                  })}
                </div>
              </div>
            </div>
          )}
        </div>

        {error && (
          <p className="mt-4 text-sm text-red-400">{error}</p>
        )}
      </div>

      <div className="mx-auto w-full max-w-[480px] px-5 pb-8">
        <div className="flex gap-3">
          {step > 1 && (
            <button
              type="button"
              onClick={handleBack}
              disabled={submitting || transitioning}
              className="flex items-center justify-center gap-1 rounded-lg border border-zinc-800 px-4 py-3 text-sm text-zinc-400 transition-colors hover:border-zinc-700 hover:text-zinc-200 disabled:opacity-40"
            >
              <ChevronLeft className="h-4 w-4" />
              Back
            </button>
          )}
          <button
            type="button"
            onClick={handleNext}
            disabled={!canProceed() || submitting || transitioning}
            className={cn(
              'flex-1 rounded-lg py-3 text-sm font-medium text-white transition-colors',
              'bg-[#2E5BFF] hover:bg-[#2548d4]',
              'disabled:cursor-not-allowed disabled:opacity-40'
            )}
          >
            {submitting
              ? 'Saving...'
              : step === TOTAL_STEPS
                ? 'Finish'
                : 'Continue'}
          </button>
        </div>
      </div>
    </div>
  )
}
