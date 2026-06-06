'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useUser } from '@clerk/nextjs'
import {
  Sunrise,
  MessageCircle,
  Moon,
  ChevronRight,
  CheckCircle2,
  Circle,
} from 'lucide-react'
import Link from 'next/link'
import { cn } from '@/lib/utils'
import { supabase } from '@/lib/supabase/client'

// IMPORTANT: Enable realtime for mentor_tasks table in Supabase Dashboard
// → Database → Replication → mentor_tasks → toggle ON.

type Period = 'morning' | 'day' | 'evening'

type Task = {
  id: string
  title: string
  context: string | null
  status: 'open' | 'completed'
  due_date: string | null
  source_mode: string | null
  source_date: string | null
  is_overdue: boolean
}

type DashboardData = {
  streaks: { debrief: number; finance: number }
  timeContext: { period: Period; currentTime: string } | null
  todaysPlan: { top_priority: string; intentions: string } | null
  recentScores: { date: string; score: number }[]
  weeklyAverage: number
  todaysPriority: string | null
  todayScore: number | null
  last7DaysStatus: { date: string; completed: boolean }[]
  openCommitments: { commitment: string; date: string; due_date: string | null }[]
  debriefedToday: boolean
}

const todayIST = () =>
  new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' })

function dueDateLabel(due: string | null): { text: string; color: 'amber' | 'red' | 'muted' } | null {
  if (!due) return null
  const today = todayIST()
  if (due === today) return { text: 'Due today', color: 'amber' }
  if (due < today) {
    const diff = Math.round((Date.parse(today) - Date.parse(due)) / 86400000)
    return { text: `${diff}d overdue`, color: 'red' }
  }
  const diff = Math.round((Date.parse(due) - Date.parse(today)) / 86400000)
  return { text: `${diff}d left`, color: 'muted' }
}

// ─── Skeleton ────────────────────────────────────────────────────────────────

function Skeleton() {
  return (
    <div className="animate-pulse px-5 pt-6">
      {/* Header */}
      <div className="mb-6 flex items-start justify-between">
        <div>
          <div className="mb-2 h-7 w-52 rounded-lg bg-[#1E1E1E]" />
          <div className="h-4 w-36 rounded bg-[#1E1E1E]" />
        </div>
        <div className="h-7 w-14 rounded-full bg-[#1E1E1E]" />
      </div>
      {/* CTA */}
      <div className="mb-4 h-24 rounded-2xl bg-[#1E1E1E]" />
      {/* Stats */}
      <div className="mb-4 grid grid-cols-2 gap-3">
        <div className="h-28 rounded-2xl bg-[#1E1E1E]" />
        <div className="h-28 rounded-2xl bg-[#1E1E1E]" />
      </div>
      {/* Tasks */}
      <div className="mb-4 h-20 rounded-2xl bg-[#1E1E1E]" />
      <div className="h-20 rounded-2xl bg-[#1E1E1E]" />
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function HomePage() {
  const router = useRouter()
  const { user } = useUser()

  const [dash, setDash] = useState<DashboardData | null>(null)
  const [tasks, setTasks] = useState<Task[]>([])
  const [loading, setLoading] = useState(true)

  // Pull-to-refresh state
  const scrollRef = useRef<HTMLDivElement>(null)
  const touchStartY = useRef(0)
  const [isPulling, setIsPulling] = useState(false)
  const [refreshing, setRefreshing] = useState(false)

  const fetchData = useCallback(async () => {
    try {
      const [dashRes, tasksRes] = await Promise.all([
        fetch('/api/dashboard'),
        fetch('/api/tasks?status=open'),
      ])
      const [dashData, tasksData] = await Promise.all([
        dashRes.ok ? dashRes.json() : null,
        tasksRes.ok ? tasksRes.json() : { tasks: [] },
      ])
      if (dashData) setDash(dashData)
      setTasks(tasksData.tasks ?? [])
    } catch (err) {
      console.error('Home fetch error:', err)
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  // ── Supabase realtime — new tasks from the mentor appear on the home preview
  useEffect(() => {
    const userId = user?.id
    if (!userId) return

    const channel = supabase
      .channel('home-page-realtime')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'mentor_tasks',
          filter: `user_id=eq.${userId}`,
        },
        (payload) => {
          const row = payload.new as {
            id: string
            title: string
            context: string | null
            status: string
            due_date: string | null
            source_mode: string | null
            source_date: string | null
          }
          if (row.status !== 'open') return
          const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' })
          const newTask: Task = {
            id: row.id,
            title: row.title,
            context: row.context ?? null,
            status: 'open',
            due_date: row.due_date ?? null,
            source_mode: row.source_mode ?? null,
            source_date: row.source_date ?? null,
            is_overdue: !!row.due_date && row.due_date < today,
          }
          setTasks((prev) => {
            if (prev.some((t) => t.id === newTask.id)) return prev
            return [newTask, ...prev]
          })
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [user?.id])

  // Pull-to-refresh
  const onTouchStart = (e: React.TouchEvent) => {
    touchStartY.current = e.touches[0].clientY
  }
  const onTouchMove = (e: React.TouchEvent) => {
    const el = scrollRef.current
    if (!el || el.scrollTop > 0) return
    const delta = e.touches[0].clientY - touchStartY.current
    if (delta > 60) setIsPulling(true)
  }
  const onTouchEnd = () => {
    if (isPulling) {
      setIsPulling(false)
      setRefreshing(true)
      fetchData()
    }
  }

  // Complete a task (optimistic)
  const completeTask = async (taskId: string) => {
    setTasks((prev) => prev.filter((t) => t.id !== taskId))
    try {
      await fetch(`/api/tasks/${taskId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'completed' }),
      })
    } catch (err) {
      console.error('Complete task error:', err)
      // Re-fetch to restore state
      fetchData()
    }
  }

  if (loading || !dash) return <Skeleton />

  const period: Period = dash.timeContext?.period ?? 'day'
  const name = user?.firstName ?? ''
  const streak = dash.streaks.debrief
  const last7 = dash.last7DaysStatus ?? []
  const openTasks = tasks.filter((t) => t.status === 'open').slice(0, 2)
  const insight = dash.todaysPriority

  // ── Greeting ───────────────────────────────────────────────────────────────
  const greeting =
    period === 'morning'
      ? `Good morning${name ? `, ${name}` : ''}`
      : period === 'evening'
        ? `Good evening${name ? `, ${name}` : ''}`
        : `Good afternoon${name ? `, ${name}` : ''}`

  const subline =
    period === 'morning'
      ? "What's the one thing that matters today?"
      : period === 'day'
        ? dash.todaysPlan?.top_priority || 'No priority set yet'
        : 'Time to close the day.'

  // ── Primary CTA ────────────────────────────────────────────────────────────
  const cta =
    period === 'morning'
      ? {
          title: "Set today's intention",
          subtitle: 'Tell your mentor what matters most today',
          Icon: Sunrise,
          href: '/chat?mode=morning',
          glow: false,
        }
      : period === 'evening'
        ? {
            title: "Start tonight's debrief",
            subtitle: '10 minutes. Close the day right.',
            Icon: Moon,
            href: '/chat?mode=debrief',
            glow: true,
          }
        : {
            title: 'Talk to your mentor',
            subtitle: 'Open chat — ask, think, decide',
            Icon: MessageCircle,
            href: '/chat?mode=open',
            glow: false,
          }

  return (
    <div
      ref={scrollRef}
      className="animate-fade-in min-h-dvh overflow-y-auto bg-[#0A0A0A] text-[#F5F5F5]"
      style={{ paddingBottom: 'calc(96px + env(safe-area-inset-bottom))' }}
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
    >
      {/* Pull-to-refresh indicator */}
      {(isPulling || refreshing) && (
        <div className="flex items-center justify-center py-3 text-xs text-[#6B7280]">
          {refreshing ? 'Refreshing…' : 'Release to refresh'}
        </div>
      )}

      <div className="px-5 pt-6 space-y-4">

        {/* ── 1. HEADER ─────────────────────────────────────────────────── */}
        <header className="flex items-start justify-between">
          <div className="min-w-0 pr-4">
            <h1 className="text-[22px] font-bold leading-tight tracking-tight text-[#F5F5F5]">
              {greeting}
            </h1>
            <p className="mt-1 text-sm text-[#6B7280] leading-snug">
              {subline}
            </p>
          </div>
          {/* Streak badge */}
          <div className="flex shrink-0 items-center gap-1 rounded-full border border-[#2A2A2A] bg-[#141414] px-3 py-1.5">
            <span className="text-base">🔥</span>
            <span className="text-[15px] font-bold text-amber-400">{streak}</span>
          </div>
        </header>

        {/* ── 2. PRIMARY CTA CARD ───────────────────────────────────────── */}
        <button
          type="button"
          onClick={() => router.push(cta.href)}
          className={cn(
            'flex w-full items-center gap-4 rounded-2xl border p-5 text-left transition-all active:scale-[0.98]',
            'bg-[rgba(245,158,11,0.12)] border-[rgba(245,158,11,0.25)]',
            cta.glow && 'shadow-[0_0_40px_rgba(245,158,11,0.18)]'
          )}
        >
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-[rgba(245,158,11,0.15)]">
            <cta.Icon size={26} className="text-amber-400" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[18px] font-bold leading-tight text-[#F5F5F5]">
              {cta.title}
            </p>
            <p className="mt-0.5 text-[13px] text-[#6B7280] leading-snug">
              {cta.subtitle}
            </p>
          </div>
          <ChevronRight size={18} className="shrink-0 text-[#6B7280]" />
        </button>

        {/* ── 3. STATS ROW ──────────────────────────────────────────────── */}
        <div className="grid grid-cols-2 gap-3">

          {/* Streak card */}
          <div className="rounded-2xl border border-[#2A2A2A] bg-[#141414] p-4">
            <div className="flex items-baseline gap-1.5">
              <span className="text-[28px] font-bold leading-none text-amber-400">
                {streak}
              </span>
              <span className="text-[12px] text-[#6B7280]">day streak</span>
            </div>
            {/* 7-dot tracker */}
            <div className="mt-3 flex items-center gap-1">
              {last7.map((day, i) => (
                <span
                  key={i}
                  className={cn(
                    'h-[6px] w-[6px] rounded-full',
                    day.completed ? 'bg-amber-400' : 'bg-[#2A2A2A]'
                  )}
                />
              ))}
            </div>
          </div>

          {/* Score card */}
          <div className="rounded-2xl border border-[#2A2A2A] bg-[#141414] p-4">
            {dash.debriefedToday && dash.todayScore != null ? (
              <>
                <div className="flex items-baseline gap-1.5">
                  <span className="text-[28px] font-bold leading-none text-amber-400">
                    {dash.todayScore}
                  </span>
                  <span className="text-[12px] text-[#6B7280]">/ 10</span>
                </div>
                <p className="mt-1 text-[12px] text-[#6B7280]">today's score</p>
              </>
            ) : (
              <>
                <span className="text-[28px] font-bold leading-none text-[#2A2A2A]">
                  —
                </span>
                <p className="mt-1 text-[12px] text-[#6B7280]">no debrief yet</p>
              </>
            )}
          </div>
        </div>

        {/* ── 4. OPEN TASKS PREVIEW ─────────────────────────────────────── */}
        {openTasks.length > 0 && (
          <section>
            <div className="mb-2.5 flex items-center justify-between">
              <span className="text-[14px] font-semibold text-[#F5F5F5]">
                Open tasks
              </span>
              <Link
                href="/tasks"
                className="text-[13px] text-amber-400 hover:text-amber-300"
              >
                See all →
              </Link>
            </div>
            <div className="space-y-2.5">
              {openTasks.map((task) => {
                const dueInfo = dueDateLabel(task.due_date)
                const isOverdue = task.is_overdue
                return (
                  <div
                    key={task.id}
                    className={cn(
                      'rounded-xl border border-[#2A2A2A] bg-[#141414] p-[14px_16px]',
                      'border-l-[3px]',
                      isOverdue ? 'border-l-[#EF4444]' : 'border-l-amber-400'
                    )}
                  >
                    <p className="text-[15px] font-semibold leading-tight text-[#F5F5F5]">
                      {task.title}
                    </p>
                    {task.context && (
                      <p className="mt-0.5 truncate text-[13px] text-[#6B7280]">
                        {task.context}
                      </p>
                    )}
                    <div className="mt-2.5 flex items-center justify-between">
                      {dueInfo ? (
                        <span
                          className={cn(
                            'rounded-full px-2.5 py-1 text-[12px] font-medium',
                            dueInfo.color === 'red'
                              ? 'bg-[rgba(239,68,68,0.15)] text-[#EF4444]'
                              : dueInfo.color === 'amber'
                                ? 'bg-[rgba(245,158,11,0.15)] text-amber-400'
                                : 'text-[#6B7280]'
                          )}
                        >
                          {dueInfo.text}
                        </span>
                      ) : (
                        <span />
                      )}
                      <button
                        type="button"
                        onClick={() => completeTask(task.id)}
                        className="flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-[12px] font-medium text-amber-400 hover:text-amber-300 transition-colors"
                      >
                        <Circle size={14} />
                        Mark complete
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          </section>
        )}

        {/* ── 5. RECENT INSIGHT ─────────────────────────────────────────── */}
        {insight && (
          <div
            className="rounded-xl border border-[#2A2A2A] bg-transparent p-[14px_16px]"
            style={{ borderLeft: '3px solid #0D9488' }}
          >
            <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.5px] text-[#0D9488]">
              Your mentor noticed
            </p>
            <p className="text-[14px] italic leading-relaxed text-[#6B7280]">
              {insight}
            </p>
          </div>
        )}

      </div>
    </div>
  )
}
