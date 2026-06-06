'use client'

import { useEffect, useRef, useState } from 'react'
import { useClerk } from '@clerk/nextjs'
import {
  Clock,
  Sunrise,
  Sliders,
  Bell,
  X,
  Check,
  Pencil,
  ChevronRight,
  LogOut,
} from 'lucide-react'
import { cn } from '@/lib/utils'

type ProfileData = {
  name: string
  age: number | null
  role: string
  primary_goal: string
  non_negotiables: string[]
  strictness: number
  communication_style: string
  reminder_time: string | null
  morning_time: string | null
}

const STRICTNESS_LABELS: Record<number, string> = {
  1: 'Gentle',
  2: 'Soft',
  3: 'Balanced',
  4: 'Strict',
  5: 'Very strict',
}

// ─── Bottom sheet wrapper ─────────────────────────────────────────────────────

function BottomSheet({
  title,
  onClose,
  children,
}: {
  title: string
  onClose: () => void
  children: React.ReactNode
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-end">
      <div className="absolute inset-0 sheet-backdrop" onClick={onClose} />
      <div className="animate-slide-up relative w-full rounded-t-3xl bg-[#141414] px-5 pt-3 pb-10">
        <div className="mx-auto mb-4 h-1 w-8 rounded-full bg-[#2A2A2A]" />
        <div className="mb-5 flex items-center justify-between">
          <h3 className="text-[16px] font-bold text-[#F5F5F5]">{title}</h3>
          <button
            type="button"
            onClick={onClose}
            className="text-[#6B7280] hover:text-[#F5F5F5]"
          >
            <X size={20} />
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}

// ─── Chip component ───────────────────────────────────────────────────────────

function Chip({ text, onRemove }: { text: string; onRemove?: () => void }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-[#2A2A2A] bg-[#1E1E1E] px-3 py-1.5 text-[13px] text-[#F5F5F5]">
      {text}
      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          className="text-[#6B7280] hover:text-[#F5F5F5]"
        >
          <X size={12} />
        </button>
      )}
    </span>
  )
}

// ─── Setting row ──────────────────────────────────────────────────────────────

function SettingRow({
  icon: Icon,
  label,
  value,
  onClick,
  right,
}: {
  icon: React.ElementType
  label: string
  value?: string
  onClick?: () => void
  right?: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex w-full items-center gap-3 rounded-xl border border-[#2A2A2A] bg-[#141414] p-4 text-left',
        onClick ? 'transition-colors hover:border-[#3A3A3A] active:scale-[0.98]' : 'cursor-default'
      )}
    >
      <Icon size={18} className="shrink-0 text-[#6B7280]" />
      <span className="flex-1 text-[15px] text-[#F5F5F5]">{label}</span>
      {right ?? (
        <>
          {value && <span className="text-[14px] text-[#6B7280]">{value}</span>}
          {onClick && <ChevronRight size={16} className="text-[#6B7280]" />}
        </>
      )}
    </button>
  )
}

// ─── Toggle ───────────────────────────────────────────────────────────────────

function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={cn(
        'relative h-6 w-10 rounded-full transition-colors duration-200',
        checked ? 'bg-amber-400' : 'bg-[#2A2A2A]'
      )}
    >
      <span
        className={cn(
          'absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform duration-200',
          checked ? 'translate-x-[18px]' : 'translate-x-0.5'
        )}
      />
    </button>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function ProfilePage() {
  const { signOut } = useClerk()

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')
  const savedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Profile state
  const [profile, setProfile] = useState<ProfileData>({
    name: '',
    age: null,
    role: '',
    primary_goal: '',
    non_negotiables: [],
    strictness: 3,
    communication_style: 'Balanced',
    reminder_time: '22:00',
    morning_time: '08:00',
  })

  // Sheet states
  const [editGoalOpen, setEditGoalOpen] = useState(false)
  const [editRulesOpen, setEditRulesOpen] = useState(false)
  const [editReminderOpen, setEditReminderOpen] = useState(false)
  const [editMorningOpen, setEditMorningOpen] = useState(false)
  const [editStrictnessOpen, setEditStrictnessOpen] = useState(false)
  const [signOutConfirm, setSignOutConfirm] = useState(false)

  // Temp edit state
  const [tempGoal, setTempGoal] = useState('')
  const [tempRules, setTempRules] = useState<string[]>([])
  const [tempRuleInput, setTempRuleInput] = useState('')
  const [tempReminderTime, setTempReminderTime] = useState('22:00')
  const [tempMorningTime, setTempMorningTime] = useState('08:00')
  const [tempStrictness, setTempStrictness] = useState(3)
  const [morningEnabled, setMorningEnabled] = useState(true)
  const [notificationsEnabled, setNotificationsEnabled] = useState(false)

  // Load profile
  useEffect(() => {
    let cancelled = false
    fetch('/api/user/profile')
      .then((r) => (r.ok ? r.json() : null))
      .then((data: ProfileData | null) => {
        if (cancelled || !data) return
        setProfile(data)
        setMorningEnabled(!!data.morning_time)
        // Check if notifications are enabled
        if ('Notification' in window) {
          setNotificationsEnabled(Notification.permission === 'granted')
        }
      })
      .catch(() => setError('Could not load profile.'))
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => {
      cancelled = true
      if (savedTimerRef.current) clearTimeout(savedTimerRef.current)
    }
  }, [])

  const patchProfile = async (fields: Partial<ProfileData> & Record<string, unknown>) => {
    setSaving(true)
    setError('')
    try {
      const res = await fetch('/api/user/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(fields),
      })
      if (!res.ok) throw new Error('Save failed')
      setProfile((prev) => ({ ...prev, ...fields } as ProfileData))
      setSaved(true)
      if (savedTimerRef.current) clearTimeout(savedTimerRef.current)
      savedTimerRef.current = setTimeout(() => setSaved(false), 2000)
    } catch {
      setError('Something went wrong. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  const handleNotificationsToggle = async (enabled: boolean) => {
    if (!enabled) {
      setNotificationsEnabled(false)
      return
    }
    try {
      const perm = await Notification.requestPermission()
      setNotificationsEnabled(perm === 'granted')
    } catch {
      setNotificationsEnabled(false)
    }
  }

  if (loading) {
    return (
      <div
        className="animate-pulse px-5 pt-6 min-h-dvh bg-[#0A0A0A]"
        style={{ paddingBottom: 'calc(96px + env(safe-area-inset-bottom))' }}
      >
        <div className="mb-6 h-8 w-32 rounded-lg bg-[#1E1E1E]" />
        <div className="mb-3 h-4 w-48 rounded bg-[#1E1E1E]" />
        <div className="mb-2 h-16 rounded-xl bg-[#1E1E1E]" />
        <div className="mb-2 h-20 rounded-xl bg-[#1E1E1E]" />
        <div className="mb-2 h-16 rounded-xl bg-[#1E1E1E]" />
      </div>
    )
  }

  return (
    <div
      className="animate-fade-in min-h-dvh bg-[#0A0A0A] text-[#F5F5F5]"
      style={{ paddingBottom: 'calc(96px + env(safe-area-inset-bottom))' }}
    >
      {/* Save toast */}
      {saved && (
        <div className="fixed bottom-24 left-1/2 z-40 -translate-x-1/2 flex items-center gap-2 rounded-xl bg-[#10B981] px-4 py-2.5 text-[13px] font-semibold text-white shadow-lg">
          <Check size={14} />
          Saved
        </div>
      )}

      <div className="px-5 pt-6 space-y-6">
        {/* ── Page header ──────────────────────────────────────────────── */}
        <h1 className="text-[24px] font-bold tracking-tight">Your profile</h1>

        {error && (
          <p className="rounded-xl bg-[rgba(239,68,68,0.1)] px-4 py-2 text-[13px] text-[#EF4444]">
            {error}
          </p>
        )}

        {/* ══════════════════════════════════════════════════════════════
            SECTION 1 — What your mentor knows
        ══════════════════════════════════════════════════════════════ */}
        <section>
          <p className="mb-3 text-[11px] font-semibold uppercase tracking-widest text-[#6B7280]">
            What your mentor knows
          </p>
          <div className="space-y-2.5">

            {/* Goal card */}
            <div className="rounded-xl border border-[#2A2A2A] bg-[#141414] p-4">
              <div className="mb-1.5 flex items-center justify-between">
                <span className="text-[12px] text-[#6B7280]">Your goal</span>
                <button
                  type="button"
                  onClick={() => { setTempGoal(profile.primary_goal); setEditGoalOpen(true) }}
                  className="text-[#6B7280] hover:text-[#F5F5F5]"
                >
                  <Pencil size={14} />
                </button>
              </div>
              <p className="text-[15px] leading-snug text-[#F5F5F5]">
                {profile.primary_goal || (
                  <span className="italic text-[#6B7280]">Not set yet.</span>
                )}
              </p>
            </div>

            {/* Non-negotiables card */}
            <div className="rounded-xl border border-[#2A2A2A] bg-[#141414] p-4">
              <div className="mb-2.5 flex items-center justify-between">
                <span className="text-[12px] text-[#6B7280]">Your rules</span>
                <button
                  type="button"
                  onClick={() => {
                    setTempRules([...profile.non_negotiables])
                    setTempRuleInput('')
                    setEditRulesOpen(true)
                  }}
                  className="text-[#6B7280] hover:text-[#F5F5F5]"
                >
                  <Pencil size={14} />
                </button>
              </div>
              {profile.non_negotiables.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {profile.non_negotiables.map((rule) => (
                    <Chip key={rule} text={rule} />
                  ))}
                </div>
              ) : (
                <p className="text-[13px] italic text-[#6B7280]">No rules set yet.</p>
              )}
            </div>

            {/* Patterns card — grows over time from memory extraction */}
            <div
              className="rounded-xl border border-[#2A2A2A] bg-transparent p-4"
              style={{ borderLeft: '3px solid #0D9488' }}
            >
              <p className="mb-1 text-[12px] text-[#6B7280]">What your mentor has noticed</p>
              <p className="text-[11px] text-[#6B7280]/60">
                These build over time as you keep showing up.
              </p>
              <p className="mt-2 text-[13px] italic leading-relaxed text-[#6B7280]">
                Your mentor is still learning your patterns. Keep showing up.
              </p>
            </div>

          </div>
        </section>

        {/* ══════════════════════════════════════════════════════════════
            SECTION 2 — Settings
        ══════════════════════════════════════════════════════════════ */}
        <section>
          <p className="mb-3 text-[11px] font-semibold uppercase tracking-widest text-[#6B7280]">
            Settings
          </p>
          <div className="space-y-2">

            {/* Reminder time */}
            <SettingRow
              icon={Clock}
              label="Reminder time"
              value={profile.reminder_time ?? '—'}
              onClick={() => {
                setTempReminderTime(profile.reminder_time ?? '22:00')
                setEditReminderOpen(true)
              }}
            />

            {/* Morning check-in */}
            <div className="rounded-xl border border-[#2A2A2A] bg-[#141414] p-4">
              <div className="flex items-center gap-3">
                <Sunrise size={18} className="shrink-0 text-[#6B7280]" />
                <span className="flex-1 text-[15px] text-[#F5F5F5]">Morning check-in</span>
                <Toggle
                  checked={morningEnabled}
                  onChange={(v) => {
                    setMorningEnabled(v)
                    if (!v) patchProfile({ morning_time: null })
                  }}
                />
              </div>
              {morningEnabled && (
                <div className="mt-3 pl-[30px]">
                  <button
                    type="button"
                    onClick={() => {
                      setTempMorningTime(profile.morning_time ?? '08:00')
                      setEditMorningOpen(true)
                    }}
                    className="flex items-center gap-2 text-[14px] text-amber-400 hover:text-amber-300"
                  >
                    {profile.morning_time ?? '08:00'}
                    <Pencil size={12} />
                  </button>
                </div>
              )}
            </div>

            {/* Mentor strictness */}
            <SettingRow
              icon={Sliders}
              label="Strictness"
              value={`${profile.strictness} — ${STRICTNESS_LABELS[profile.strictness] ?? ''}`}
              onClick={() => {
                setTempStrictness(profile.strictness)
                setEditStrictnessOpen(true)
              }}
            />

            {/* Notifications */}
            <SettingRow
              icon={Bell}
              label="Notifications"
              right={
                <Toggle
                  checked={notificationsEnabled}
                  onChange={handleNotificationsToggle}
                />
              }
            />

          </div>
        </section>

        {/* ── Footer ──────────────────────────────────────────────────── */}
        <div className="pt-2">
          <p className="mb-4 text-center text-[12px] text-[#6B7280]/50">AI Mentor v1.0</p>

          {signOutConfirm ? (
            <div className="flex items-center justify-center gap-3">
              <span className="text-[14px] text-[#6B7280]">Sign out?</span>
              <button
                type="button"
                onClick={() => signOut({ redirectUrl: '/' })}
                className="rounded-lg bg-[#EF4444]/15 px-4 py-2 text-[14px] font-medium text-[#EF4444]"
              >
                Yes, sign out
              </button>
              <button
                type="button"
                onClick={() => setSignOutConfirm(false)}
                className="rounded-lg border border-[#2A2A2A] px-4 py-2 text-[14px] text-[#6B7280]"
              >
                Cancel
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setSignOutConfirm(true)}
              className="flex w-full items-center justify-center gap-2 py-2 text-[14px] font-medium text-[#EF4444] hover:text-[#EF4444]/80 transition-colors"
            >
              <LogOut size={15} />
              Sign out
            </button>
          )}
        </div>
      </div>

      {/* ════════════════════════════════════════════════════════════════
          BOTTOM SHEETS
      ════════════════════════════════════════════════════════════════ */}

      {/* Edit goal */}
      {editGoalOpen && (
        <BottomSheet title="Edit goal" onClose={() => setEditGoalOpen(false)}>
          <textarea
            value={tempGoal}
            onChange={(e) => setTempGoal(e.target.value)}
            rows={4}
            placeholder="Describe your top priority…"
            className="w-full resize-none rounded-xl border border-[#2A2A2A] bg-[#1E1E1E] px-4 py-3 text-[15px] leading-relaxed text-[#F5F5F5] outline-none placeholder:text-[#6B7280] focus:border-amber-400/40"
          />
          <button
            type="button"
            disabled={saving}
            onClick={() => {
              patchProfile({ primary_goal: tempGoal.trim() })
              setEditGoalOpen(false)
            }}
            className="mt-4 w-full rounded-xl bg-amber-400 py-3.5 text-[15px] font-semibold text-black disabled:opacity-50"
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
        </BottomSheet>
      )}

      {/* Edit rules */}
      {editRulesOpen && (
        <BottomSheet title="Edit rules" onClose={() => setEditRulesOpen(false)}>
          <div className="flex gap-2 mb-3">
            <input
              type="text"
              value={tempRuleInput}
              onChange={(e) => setTempRuleInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && tempRuleInput.trim()) {
                  e.preventDefault()
                  if (!tempRules.includes(tempRuleInput.trim())) {
                    setTempRules((prev) => [...prev, tempRuleInput.trim()])
                  }
                  setTempRuleInput('')
                }
              }}
              placeholder="Add a rule, press Enter"
              className="flex-1 rounded-xl border border-[#2A2A2A] bg-[#1E1E1E] px-3 py-2.5 text-[14px] text-[#F5F5F5] outline-none placeholder:text-[#6B7280] focus:border-amber-400/40"
            />
            <button
              type="button"
              onClick={() => {
                if (tempRuleInput.trim() && !tempRules.includes(tempRuleInput.trim())) {
                  setTempRules((prev) => [...prev, tempRuleInput.trim()])
                  setTempRuleInput('')
                }
              }}
              className="rounded-xl bg-amber-400 px-4 py-2.5 text-[14px] font-semibold text-black disabled:opacity-40"
              disabled={!tempRuleInput.trim()}
            >
              Add
            </button>
          </div>
          {tempRules.length > 0 && (
            <div className="mb-4 flex flex-wrap gap-2">
              {tempRules.map((rule) => (
                <Chip
                  key={rule}
                  text={rule}
                  onRemove={() => setTempRules((prev) => prev.filter((r) => r !== rule))}
                />
              ))}
            </div>
          )}
          <button
            type="button"
            disabled={saving}
            onClick={() => {
              patchProfile({ non_negotiables: tempRules })
              setEditRulesOpen(false)
            }}
            className="w-full rounded-xl bg-amber-400 py-3.5 text-[15px] font-semibold text-black disabled:opacity-50"
          >
            {saving ? 'Saving…' : 'Save rules'}
          </button>
        </BottomSheet>
      )}

      {/* Edit reminder time */}
      {editReminderOpen && (
        <BottomSheet title="Reminder time" onClose={() => setEditReminderOpen(false)}>
          <p className="mb-3 text-[13px] text-[#6B7280]">
            When should your mentor remind you to do your nightly debrief?
          </p>
          <input
            type="time"
            value={tempReminderTime}
            onChange={(e) => setTempReminderTime(e.target.value)}
            className="w-full rounded-xl border border-[#2A2A2A] bg-[#1E1E1E] px-4 py-3 text-[15px] text-[#F5F5F5] outline-none focus:border-amber-400/40 [color-scheme:dark]"
          />
          <button
            type="button"
            disabled={saving}
            onClick={() => {
              patchProfile({ reminder_time: tempReminderTime })
              setEditReminderOpen(false)
            }}
            className="mt-4 w-full rounded-xl bg-amber-400 py-3.5 text-[15px] font-semibold text-black disabled:opacity-50"
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
        </BottomSheet>
      )}

      {/* Edit morning time */}
      {editMorningOpen && (
        <BottomSheet title="Morning check-in time" onClose={() => setEditMorningOpen(false)}>
          <p className="mb-3 text-[13px] text-[#6B7280]">
            When should your morning check-in reminder arrive?
          </p>
          <input
            type="time"
            value={tempMorningTime}
            onChange={(e) => setTempMorningTime(e.target.value)}
            className="w-full rounded-xl border border-[#2A2A2A] bg-[#1E1E1E] px-4 py-3 text-[15px] text-[#F5F5F5] outline-none focus:border-amber-400/40 [color-scheme:dark]"
          />
          <button
            type="button"
            disabled={saving}
            onClick={() => {
              patchProfile({ morning_time: tempMorningTime })
              setEditMorningOpen(false)
            }}
            className="mt-4 w-full rounded-xl bg-amber-400 py-3.5 text-[15px] font-semibold text-black disabled:opacity-50"
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
        </BottomSheet>
      )}

      {/* Edit strictness */}
      {editStrictnessOpen && (
        <BottomSheet title="Mentor strictness" onClose={() => setEditStrictnessOpen(false)}>
          <p className="mb-4 text-center text-[24px] font-bold text-amber-400">
            {tempStrictness} — {STRICTNESS_LABELS[tempStrictness]}
          </p>
          <input
            type="range"
            min={1}
            max={5}
            step={1}
            value={tempStrictness}
            onChange={(e) => setTempStrictness(Number(e.target.value))}
            className="w-full"
          />
          <div className="mt-2 flex justify-between text-[11px] text-[#6B7280]">
            <span>Gentle</span>
            <span>Balanced</span>
            <span>Very strict</span>
          </div>
          <button
            type="button"
            disabled={saving}
            onClick={() => {
              patchProfile({ strictness: tempStrictness })
              setEditStrictnessOpen(false)
            }}
            className="mt-5 w-full rounded-xl bg-amber-400 py-3.5 text-[15px] font-semibold text-black disabled:opacity-50"
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
        </BottomSheet>
      )}
    </div>
  )
}
