'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useUser } from '@clerk/nextjs'
import { Sunrise, MessageCircle, Moon, Flame, Wallet, User } from 'lucide-react'
import { cn } from '@/lib/utils'
import { AppShell } from '@/components/AppShell'

type Period = 'morning' | 'day' | 'evening'

type DashboardData = {
  streaks: {
    debrief: number
    finance: number
  }
  timeContext?: {
    period: Period
    currentTime: string
  }
  todaysPlan: { top_priority: string; intentions: string } | null
  recentScores: { date: string; score: number }[]
  weeklyAverage: number
  todaysPriority: string | null
  openCommitments: { commitment: string; date: string; due_date: string | null }[]
  totalDebriefs: number
  longestStreak: number
  debriefedToday: boolean
}

const todayISTDate = () =>
  new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' })

const dayLabel = (dateStr: string) =>
  new Date(dateStr).toLocaleDateString('en-US', { weekday: 'short' })

// Status text + tone for a commitment based on its due_date relative to today (IST).
function commitmentStatus(
  dueDate: string | null,
  today: string
): { text: string; warn: boolean } | null {
  if (!dueDate) return null
  if (dueDate === today) return { text: 'due today', warn: true }
  const diffDays = Math.round(
    (Date.parse(dueDate) - Date.parse(today)) / 86_400_000
  )
  if (diffDays > 0) {
    return { text: `${diffDays} ${diffDays === 1 ? 'day' : 'days'} left`, warn: false }
  }
  // Past due — beyond the three cases in the spec, but surfacing it is the
  // obviously-correct behavior for an open, overdue commitment.
  return { text: 'overdue', warn: true }
}

export default function DashboardPage() {
  const router = useRouter()
  const { user } = useUser()
  const [data, setData] = useState<DashboardData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/dashboard')
      .then((res) => res.json())
      .then((d) => {
        setData(d)
        setLoading(false)
      })
      .catch((err) => {
        console.error(err)
        setLoading(false)
      })
  }, [])

  if (loading || !data) {
    return (
      <AppShell>
        <div className="mx-auto w-full max-w-[420px] flex-1 p-5 animate-pulse">
          <div className="h-8 w-1/2 bg-zinc-800 rounded mb-6 mt-2"></div>
          <div className="h-12 bg-zinc-900/50 rounded-xl border border-zinc-800 mb-6"></div>
          <div className="grid grid-cols-2 gap-3 mb-6">
            <div className="h-20 bg-zinc-900/50 rounded-xl"></div>
            <div className="h-20 bg-zinc-900/50 rounded-xl"></div>
          </div>
          <div className="h-40 bg-zinc-900/50 rounded-xl border border-zinc-800 mb-6"></div>
          <div className="h-24 bg-zinc-900/50 rounded-xl border border-zinc-800 mb-4"></div>
          <div className="h-32 bg-zinc-900/50 rounded-xl border border-zinc-800"></div>
        </div>
      </AppShell>
    )
  }

  const {
    streaks,
    timeContext,
    todaysPlan,
    recentScores,
    weeklyAverage,
    todaysPriority,
    openCommitments,
    debriefedToday,
  } = data

  const period: Period = timeContext?.period ?? 'day'
  const currentTime = timeContext?.currentTime ?? ''
  const name = user?.firstName ?? ''
  const today = todayISTDate()

  // ── Header (time-aware) ────────────────────────────────────────────────────
  const greeting =
    period === 'morning'
      ? `Good morning${name ? `, ${name}` : ''}`
      : period === 'evening'
        ? `Good evening${name ? `, ${name}` : ''}`
        : `Good afternoon${name ? `, ${name}` : ''}`

  const resolvedPriority = todaysPlan?.top_priority || todaysPriority || ''

  const momentLine =
    period === 'morning'
      ? "Set today's intention"
      : period === 'evening'
        ? "Tonight's the debrief"
        : resolvedPriority || 'No priority set yet'

  // ── Context line ───────────────────────────────────────────────────────────
  const contextLine =
    period === 'morning'
      ? `${currentTime} · A fresh day`
      : todaysPlan?.top_priority
        ? `${currentTime} · You set "${todaysPlan.top_priority}" this morning`
        : currentTime

  // ── Primary action (time-aware) ─────────────────────────────────────────────
  const primary =
    period === 'morning'
      ? {
          label: "Set today's intention",
          Icon: Sunrise,
          onClick: () => router.push('/chat?mode=morning'),
        }
      : period === 'evening'
        ? {
            label: "Start tonight's debrief",
            Icon: Moon,
            onClick: () =>
              router.push(debriefedToday ? '/chat' : '/chat?mode=debrief'),
          }
        : {
            label: 'Talk to your mentor',
            Icon: MessageCircle,
            onClick: () => router.push('/chat'),
          }

  const priorityCardText =
    todaysPlan?.top_priority ||
    todaysPriority ||
    (period === 'morning'
      ? 'Not set yet — start your morning'
      : "Complete tonight's debrief to set one")

  return (
    <AppShell>
      <div className="mx-auto flex w-full max-w-[420px] flex-1 flex-col gap-5 p-5">
        {/* 1. Header */}
        <header className="flex items-start justify-between gap-3 pl-8 md:pl-0">
          <div className="min-w-0">
            <h1 className="truncate text-xl font-semibold tracking-tight text-zinc-100">
              {greeting}
            </h1>
            <p className="mt-0.5 truncate text-sm text-zinc-400">{momentLine}</p>
          </div>
          <button
            type="button"
            onClick={() => router.push('/profile')}
            aria-label="Profile"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-zinc-800 text-zinc-400 transition-colors hover:border-zinc-700 hover:text-zinc-200"
          >
            <User className="h-4 w-4" />
          </button>
        </header>

        {/* 2. Context line */}
        {contextLine && (
          <p className="-mt-2 text-xs text-zinc-500">{contextLine}</p>
        )}

        {/* 3. Primary action */}
        <button
          type="button"
          onClick={primary.onClick}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#2E5BFF] py-3.5 text-sm font-medium text-white shadow-md transition-all hover:bg-[#2548d4] hover:shadow-lg focus:outline-none focus:ring-2 focus:ring-[#2E5BFF]/50"
        >
          <primary.Icon className="h-4 w-4" />
          {primary.label}
        </button>

        {/* 4. Streak tiles */}
        <div className="grid grid-cols-2 gap-3">
          <div className="flex items-center gap-3 rounded-xl bg-zinc-900/60 p-4">
            <Flame className="h-5 w-5 shrink-0 text-orange-400" />
            <div className="min-w-0">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
                debrief
              </p>
              <p className="text-sm font-medium text-zinc-100">
                {streaks.debrief} {streaks.debrief === 1 ? 'day' : 'days'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3 rounded-xl bg-zinc-900/60 p-4">
            <Wallet className="h-5 w-5 shrink-0 text-emerald-400" />
            <div className="min-w-0">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
                under budget
              </p>
              <p className="text-sm font-medium text-zinc-100">
                {streaks.finance} {streaks.finance === 1 ? 'day' : 'days'}
              </p>
            </div>
          </div>
        </div>

        {/* 5. Weekly score card */}
        <div className="rounded-xl border border-zinc-800/60 bg-zinc-900/40 p-5">
          <div className="mb-5 flex items-baseline justify-between">
            <h2 className="text-sm font-medium text-zinc-300">This week</h2>
            <span className="text-2xl font-semibold text-zinc-100">
              {weeklyAverage.toFixed(1)}
            </span>
          </div>
          {recentScores.length > 0 ? (
            <div className="flex h-24 items-end justify-between gap-2">
              {recentScores.map((item, i) => {
                const muted = item.score <= 0
                return (
                  <div
                    key={i}
                    className="flex h-full w-full flex-col items-center justify-end gap-2"
                  >
                    <div className="flex h-full w-full items-end rounded-t-md bg-[#1a1a2e]">
                      <div
                        className={cn(
                          'w-full rounded-t-md transition-all',
                          muted ? 'bg-zinc-700' : 'bg-[#2E5BFF]'
                        )}
                        style={{
                          height: `${(item.score / 10) * 100}%`,
                          minHeight: muted ? '2px' : '4px',
                        }}
                      />
                    </div>
                    <span className="text-[10px] font-medium text-zinc-500">
                      {dayLabel(item.date)}
                    </span>
                  </div>
                )
              })}
            </div>
          ) : (
            <div className="flex h-24 items-center justify-center text-sm text-zinc-500">
              No scores yet
            </div>
          )}
        </div>

        {/* 6. Today's priority card */}
        <div className="rounded-xl border border-zinc-800/60 bg-zinc-900/40 p-4">
          <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
            today&apos;s priority
          </p>
          <p className="text-sm font-medium leading-relaxed text-zinc-200">
            {priorityCardText}
          </p>
        </div>

        {/* 7. Open commitments card */}
        <div className="rounded-xl border border-zinc-800/60 bg-zinc-900/40 p-4">
          <p className="mb-3 text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
            open commitments
          </p>
          {openCommitments.length > 0 ? (
            <ul className="space-y-3">
              {openCommitments.map((c, i) => {
                const status = commitmentStatus(c.due_date, today)
                return (
                  <li key={i} className="flex items-start justify-between gap-3">
                    <span className="text-sm leading-snug text-zinc-200">
                      {c.commitment}
                    </span>
                    {status && (
                      <span
                        className={cn(
                          'shrink-0 whitespace-nowrap text-[11px] font-medium',
                          status.warn
                            ? 'rounded-full bg-amber-500/15 px-2 py-0.5 text-amber-400'
                            : 'mt-0.5 text-zinc-500'
                        )}
                      >
                        {status.text}
                      </span>
                    )}
                  </li>
                )
              })}
            </ul>
          ) : (
            <p className="text-sm text-zinc-500">No open commitments.</p>
          )}
        </div>
      </div>
    </AppShell>
  )
}
