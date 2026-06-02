'use client'

import { useEffect, useState } from 'react'
import { useUser } from '@clerk/nextjs'
import { useRouter } from 'next/navigation'
import { ChevronLeft, X } from 'lucide-react'
import { cn } from '@/lib/utils'

const TOTAL_STEPS = 5

const RULE_EXAMPLES = [
  'No junk food',
  'Sleep before midnight',
  '30 min workout daily',
]

const GOAL_PLACEHOLDERS = [
  'Stay consistent with my morning routine',
  'Build discipline around sleep and fitness',
  'Stop procrastinating on deep work',
]

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
  const [primaryGoal, setPrimaryGoal] = useState('')
  const [ruleInput, setRuleInput] = useState('')
  const [nonNegotiables, setNonNegotiables] = useState<string[]>([])
  const [strictness, setStrictness] = useState(3)
  const [communicationStyle, setCommunicationStyle] =
    useState<CommunicationStyle>('Balanced')
  const [reminderTime, setReminderTime] = useState('22:00')

  useEffect(() => {
    fetch('/api/user/sync', { method: 'POST' }).catch(console.error)
  }, [])

  useEffect(() => {
    if (!isLoaded || !user) return
    fetch('/api/user/profile')
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { onboarded?: boolean } | null) => {
        if (data?.onboarded) router.replace('/chat')
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
        return primaryGoal.trim().length > 0
      case 3:
        return nonNegotiables.length > 0
      case 4:
        return communicationStyle.length > 0
      case 5:
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
      const res = await fetch('/api/user/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          age: Number(age),
          role: role.trim(),
          primary_goal: primaryGoal.trim(),
          non_negotiables: nonNegotiables,
          strictness,
          communication_style: communicationStyle,
          reminder_time: reminderTime,
          onboarded: true,
        }),
      })

      if (!res.ok) throw new Error('Failed to save profile')

      router.push('/chat')
    } catch {
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
              <label className="block space-y-2">
                <span className="text-sm text-zinc-400">Current role</span>
                <input
                  type="text"
                  value={role}
                  onChange={(e) => setRole(e.target.value)}
                  placeholder="e.g. Product Manager"
                  className="w-full rounded-lg border border-zinc-800 bg-zinc-900/50 px-3 py-2.5 text-sm outline-none placeholder:text-zinc-600 focus:border-[#2E5BFF] focus:ring-1 focus:ring-[#2E5BFF]"
                />
              </label>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-6">
              <div>
                <h1 className="text-xl font-semibold tracking-tight">
                  Your goal
                </h1>
                <p className="mt-1 text-sm text-zinc-500">
                  What is the one thing you most want to improve?
                </p>
              </div>
              <textarea
                value={primaryGoal}
                onChange={(e) => setPrimaryGoal(e.target.value)}
                rows={5}
                placeholder="Describe your top priority..."
                className="w-full resize-none rounded-lg border border-zinc-800 bg-zinc-900/50 px-3 py-3 text-sm leading-relaxed outline-none placeholder:text-zinc-600 focus:border-[#2E5BFF] focus:ring-1 focus:ring-[#2E5BFF]"
              />
              <div className="space-y-2">
                <p className="text-xs text-zinc-500">Examples</p>
                <ul className="space-y-1.5">
                  {GOAL_PLACEHOLDERS.map((example) => (
                    <li
                      key={example}
                      className="text-xs text-zinc-600 italic"
                    >
                      &ldquo;{example}&rdquo;
                    </li>
                  ))}
                </ul>
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
                  What are your non-negotiables? Rules you&apos;ve set for
                  yourself.
                </p>
              </div>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={ruleInput}
                  onChange={(e) => setRuleInput(e.target.value)}
                  onKeyDown={handleRuleKeyDown}
                  placeholder="Type a rule and press Enter"
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
              {nonNegotiables.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {nonNegotiables.map((rule) => (
                    <span
                      key={rule}
                      className="inline-flex items-center gap-1.5 rounded-full border border-zinc-700/50 bg-[#1a1a2e] px-3 py-1.5 text-sm"
                    >
                      {rule}
                      <button
                        type="button"
                        onClick={() => removeRule(rule)}
                        aria-label={`Remove ${rule}`}
                        className="text-zinc-500 hover:text-zinc-300"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </span>
                  ))}
                </div>
              )}
              <div className="space-y-2">
                <p className="text-xs text-zinc-500">Examples</p>
                <ul className="space-y-1.5">
                  {RULE_EXAMPLES.map((example) => (
                    <li 
                      key={example} 
                      className="text-xs text-zinc-600 cursor-pointer hover:text-zinc-400 transition-colors"
                      onClick={() => !nonNegotiables.includes(example) && setNonNegotiables(prev => [...prev, example])}
                    >
                      {example}
                    </li>
                  ))}
                </ul>
              </div>
              <div className="space-y-2 pt-2">
                <p className="text-xs text-zinc-500">Finance</p>
                <ul className="space-y-1.5">
                  {[
                    "No food delivery more than 3x/week",
                    "Log every expense in the debrief daily",
                    "No impulse purchase above ₹500",
                    "Weekly spend under ₹3,000"
                  ].map((example) => (
                    <li 
                      key={example} 
                      className="text-xs text-zinc-600 cursor-pointer hover:text-zinc-400 transition-colors"
                      onClick={() => !nonNegotiables.includes(example) && setNonNegotiables(prev => [...prev, example])}
                    >
                      {example}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          )}

          {step === 4 && (
            <div className="space-y-8">
              <div>
                <h1 className="text-xl font-semibold tracking-tight">
                  Mentor tone
                </h1>
                <p className="mt-1 text-sm text-zinc-500">
                  How strict do you want your mentor to be?
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
                <p className="text-center text-2xl font-semibold text-[#2E5BFF]">
                  {strictness}
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

          {step === 5 && (
            <div className="space-y-6">
              <div>
                <h1 className="text-xl font-semibold tracking-tight">
                  Reminder time
                </h1>
                <p className="mt-1 text-sm text-zinc-500">
                  When should your mentor check in for the nightly debrief?
                </p>
              </div>
              <label className="block space-y-2">
                <span className="text-sm text-zinc-400">Debrief time</span>
                <input
                  type="time"
                  value={reminderTime}
                  onChange={(e) => setReminderTime(e.target.value)}
                  className="w-full rounded-lg border border-zinc-800 bg-zinc-900/50 px-3 py-2.5 text-sm outline-none focus:border-[#2E5BFF] focus:ring-1 focus:ring-[#2E5BFF] [color-scheme:dark]"
                />
              </label>
              <p className="text-xs text-zinc-600">
                Default: 10:00 PM — adjust to fit your schedule.
              </p>
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
