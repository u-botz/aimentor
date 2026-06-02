'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ChevronLeft, X, Check } from 'lucide-react'
import { cn } from '@/lib/utils'

type CommunicationStyle = 'Direct' | 'Balanced' | 'Encouraging'

const FEEDBACK_STYLES: CommunicationStyle[] = ['Direct', 'Balanced', 'Encouraging']

type ProfileResponse = {
  name?: string
  age?: number | null
  role?: string
  primary_goal?: string
  non_negotiables?: string[]
  strictness?: number
  communication_style?: string
  reminder_time?: string | null
  morning_time?: string | null
}

export default function ProfilePage() {
  const router = useRouter()

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)

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
  const [morningTime, setMorningTime] = useState('08:00')

  // ── Load current profile ──────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false
    fetch('/api/user/profile')
      .then((res) => (res.ok ? res.json() : null))
      .then((data: ProfileResponse | null) => {
        if (cancelled || !data) return
        setName(data.name ?? '')
        setAge(data.age != null ? String(data.age) : '')
        setRole(data.role ?? '')
        setPrimaryGoal(data.primary_goal ?? '')
        setNonNegotiables(data.non_negotiables ?? [])
        setStrictness(data.strictness ?? 3)
        setCommunicationStyle(
          (data.communication_style as CommunicationStyle) ?? 'Balanced'
        )
        setReminderTime(data.reminder_time ?? '22:00')
        setMorningTime(data.morning_time ?? '08:00')
      })
      .catch((err) => {
        console.error('Profile load error:', err)
        setError('Could not load your profile.')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  // ── Non-negotiables tag input ─────────────────────────────────────────────
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

  const canSave =
    name.trim().length > 0 &&
    age !== '' &&
    role.trim().length > 0 &&
    primaryGoal.trim().length > 0 &&
    nonNegotiables.length > 0 &&
    reminderTime.length > 0 &&
    morningTime.length > 0

  // ── Save ──────────────────────────────────────────────────────────────────
  const handleSave = async () => {
    setError('')
    setSaved(false)
    if (!canSave) {
      setError('Please fill in all fields before saving.')
      return
    }
    setSaving(true)
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
          morning_time: morningTime,
        }),
      })

      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error((body as { error?: string }).error ?? 'Save failed')
      }

      setSaved(true)
      setTimeout(() => setSaved(false), 2500)
    } catch (err) {
      console.error('Profile save error:', err)
      setError('Something went wrong. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-dvh flex-col bg-[#0a0a0f] text-zinc-100">
        <div className="mx-auto w-full max-w-[480px] flex-1 p-5 animate-pulse">
          <div className="mb-6 mt-2 h-8 w-1/3 rounded bg-zinc-800" />
          <div className="mb-4 h-32 rounded-xl border border-zinc-800 bg-zinc-900/50" />
          <div className="mb-4 h-24 rounded-xl border border-zinc-800 bg-zinc-900/50" />
          <div className="h-40 rounded-xl border border-zinc-800 bg-zinc-900/50" />
        </div>
      </div>
    )
  }

  return (
    <div className="flex min-h-dvh flex-col bg-[#0a0a0f] text-zinc-100">
      <div className="mx-auto w-full max-w-[480px] flex-1 px-5 py-8">
        {/* Header */}
        <div className="mb-8 flex items-center gap-3">
          <button
            type="button"
            onClick={() => router.push('/dashboard')}
            aria-label="Back to dashboard"
            className="rounded-lg border border-zinc-800 p-2 text-zinc-400 transition-colors hover:border-zinc-700 hover:text-zinc-200"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <h1 className="text-2xl font-semibold tracking-tight">Profile</h1>
        </div>

        <div className="space-y-8">
          {/* Basic info */}
          <section className="space-y-4">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-[#2E5BFF]">
              Basic info
            </h2>
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
          </section>

          {/* Goal */}
          <section className="space-y-4">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-[#2E5BFF]">
              Your goal
            </h2>
            <textarea
              value={primaryGoal}
              onChange={(e) => setPrimaryGoal(e.target.value)}
              rows={4}
              placeholder="Describe your top priority..."
              className="w-full resize-none rounded-lg border border-zinc-800 bg-zinc-900/50 px-3 py-3 text-sm leading-relaxed outline-none placeholder:text-zinc-600 focus:border-[#2E5BFF] focus:ring-1 focus:ring-[#2E5BFF]"
            />
          </section>

          {/* Non-negotiables */}
          <section className="space-y-4">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-[#2E5BFF]">
              Your rules
            </h2>
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
            {nonNegotiables.length > 0 ? (
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
            ) : (
              <p className="text-xs text-zinc-600">
                Add at least one non-negotiable rule.
              </p>
            )}
          </section>

          {/* Mentor tone */}
          <section className="space-y-5">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-[#2E5BFF]">
              Mentor tone
            </h2>
            <div className="space-y-4">
              <span className="text-sm text-zinc-400">Strictness</span>
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
            </div>
            <div className="space-y-3">
              <span className="text-sm text-zinc-400">Feedback style</span>
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
          </section>

          {/* Check-in times */}
          <section className="space-y-4">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-[#2E5BFF]">
              Check-in times
            </h2>
            <label className="block space-y-2">
              <span className="text-sm text-zinc-400">Morning check-in time</span>
              <input
                type="time"
                value={morningTime}
                onChange={(e) => setMorningTime(e.target.value)}
                className="w-full rounded-lg border border-zinc-800 bg-zinc-900/50 px-3 py-2.5 text-sm outline-none focus:border-[#2E5BFF] focus:ring-1 focus:ring-[#2E5BFF] [color-scheme:dark]"
              />
            </label>
            <label className="block space-y-2">
              <span className="text-sm text-zinc-400">Nightly debrief time</span>
              <input
                type="time"
                value={reminderTime}
                onChange={(e) => setReminderTime(e.target.value)}
                className="w-full rounded-lg border border-zinc-800 bg-zinc-900/50 px-3 py-2.5 text-sm outline-none focus:border-[#2E5BFF] focus:ring-1 focus:ring-[#2E5BFF] [color-scheme:dark]"
              />
            </label>
          </section>

          {error && <p className="text-sm text-red-400">{error}</p>}
        </div>
      </div>

      {/* Sticky save bar */}
      <div className="sticky bottom-0 border-t border-zinc-800/60 bg-[#0a0a0f]/95 backdrop-blur">
        <div className="mx-auto w-full max-w-[480px] px-5 py-4">
          <button
            type="button"
            onClick={handleSave}
            disabled={saving || !canSave}
            className={cn(
              'flex w-full items-center justify-center gap-2 rounded-xl py-3.5 text-sm font-medium text-white transition-all',
              saved
                ? 'bg-emerald-600 hover:bg-emerald-600'
                : 'bg-[#2E5BFF] hover:bg-[#2548d4]',
              'disabled:cursor-not-allowed disabled:opacity-40'
            )}
          >
            {saved ? (
              <>
                <Check className="h-4 w-4" />
                Saved
              </>
            ) : saving ? (
              'Saving...'
            ) : (
              'Save changes'
            )}
          </button>
        </div>
      </div>
    </div>
  )
}
