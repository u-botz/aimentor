'use client'

import { useCallback, useEffect, useState } from 'react'
import { CheckCircle2 } from 'lucide-react'
import { cn } from '@/lib/utils'

type Task = {
  id: string
  title: string
  context: string | null
  status: 'open' | 'completed'
  due_date: string | null
  source_mode: string | null
  source_date: string | null
  is_overdue: boolean
  completed_at: string | null
}

type Filter = 'all' | 'open' | 'overdue' | 'completed'

const FILTERS: { label: string; value: Filter }[] = [
  { label: 'All',       value: 'all' },
  { label: 'Open',      value: 'open' },
  { label: 'Overdue',   value: 'overdue' },
  { label: 'Completed', value: 'completed' },
]

const todayIST = () =>
  new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' })

function dueDateChip(due: string | null, isOverdue: boolean) {
  if (!due) return null
  const today = todayIST()
  if (isOverdue) {
    const diff = Math.round((Date.parse(today) - Date.parse(due)) / 86400000)
    return { text: `${diff}d overdue`, style: 'red' as const }
  }
  if (due === today) return { text: 'Due today', style: 'amber' as const }
  const diff = Math.round((Date.parse(due) - Date.parse(today)) / 86400000)
  return { text: `${diff}d left`, style: 'muted' as const }
}

function sourceModeLabel(mode: string | null) {
  if (mode === 'debrief') return 'Nightly Debrief'
  if (mode === 'morning') return 'Morning Check-in'
  if (mode === 'open_chat') return 'Open Chat'
  return 'Chat'
}

function formatCompletedAt(ts: string | null) {
  if (!ts) return null
  return new Date(ts).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    timeZone: 'Asia/Kolkata',
  })
}

// ─── Individual task card ─────────────────────────────────────────────────────

function TaskCard({
  task,
  onComplete,
}: {
  task: Task
  onComplete: (id: string) => void
}) {
  const [completing, setCompleting] = useState(false)
  const chip = dueDateChip(task.due_date, task.is_overdue)
  const isDone = task.status === 'completed'

  const handleComplete = () => {
    setCompleting(true)
    setTimeout(() => onComplete(task.id), 350)
  }

  if (isDone) {
    const completedText = formatCompletedAt(task.completed_at)
    return (
      <div
        className="rounded-xl border border-[#2A2A2A] bg-[#141414]/60 p-4"
        style={{ borderLeft: '3px solid #10B981' }}
      >
        <p className="text-[15px] font-semibold leading-tight text-[#6B7280] line-through">
          {task.title}
        </p>
        {completedText && (
          <p className="mt-1 text-[12px] text-[#6B7280]/60">
            Completed {completedText}
          </p>
        )}
      </div>
    )
  }

  return (
    <div
      className={cn(
        'rounded-xl border border-[#2A2A2A] bg-[#141414] p-4 transition-all duration-300',
        task.is_overdue ? 'border-l-[3px] border-l-[#EF4444]' : 'border-l-[3px] border-l-amber-400',
        completing && 'border-l-[#10B981] opacity-40 scale-[0.98]'
      )}
    >
      {/* Title */}
      <p className="text-[15px] font-semibold leading-snug text-[#F5F5F5]">
        {task.title}
      </p>

      {/* Context */}
      {task.context && (
        <p className="mt-1 text-[13px] leading-snug text-[#6B7280]">
          {task.context}
        </p>
      )}

      {/* Chips + action row */}
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-1.5">
          {/* Due chip */}
          {chip && (
            <span
              className={cn(
                'rounded-full px-2.5 py-1 text-[11px] font-medium',
                chip.style === 'red'
                  ? 'bg-[rgba(239,68,68,0.12)] text-[#EF4444]'
                  : chip.style === 'amber'
                    ? 'bg-[rgba(245,158,11,0.12)] text-amber-400'
                    : 'text-[#6B7280]'
              )}
            >
              {chip.text}
            </span>
          )}

          {/* Source chip */}
          {task.source_mode && (
            <span className="text-[11px] text-[#6B7280]/60">
              From: {sourceModeLabel(task.source_mode)}
              {task.source_date
                ? ` · ${new Date(task.source_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`
                : ''}
            </span>
          )}
        </div>

        {/* Complete button */}
        <button
          type="button"
          onClick={handleComplete}
          disabled={completing}
          className={cn(
            'flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[12px] font-medium',
            'border border-[#2A2A2A] text-[#6B7280] transition-all',
            'hover:border-amber-400/40 hover:text-amber-400',
            completing && 'border-[#10B981]/40 text-[#10B981]'
          )}
        >
          <CheckCircle2
            size={14}
            className={completing ? 'text-[#10B981]' : 'text-[#6B7280]'}
          />
          {completing ? 'Done!' : 'Complete'}
        </button>
      </div>
    </div>
  )
}

// ─── Empty state ──────────────────────────────────────────────────────────────

function EmptyState({ filter }: { filter: Filter }) {
  if (filter === 'completed') {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <CheckCircle2 size={40} className="mb-3 text-[#2A2A2A]" />
        <p className="text-[15px] font-medium text-[#6B7280]">Nothing completed yet.</p>
        <p className="mt-1 text-[13px] text-[#6B7280]/60">
          Complete your first task to see it here.
        </p>
      </div>
    )
  }
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <CheckCircle2 size={40} className="mb-3 text-[#2A2A2A]" />
      <p className="text-[15px] font-medium text-[#6B7280]">All clear</p>
      <p className="mt-1.5 text-[13px] leading-relaxed text-[#6B7280]/60 max-w-[240px]">
        No open tasks. Your mentor will assign one when you need it.
      </p>
    </div>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function TasksPage() {
  const [allTasks, setAllTasks] = useState<Task[]>([])
  const [filter, setFilter] = useState<Filter>('open')
  const [loading, setLoading] = useState(true)

  const fetchTasks = useCallback(async () => {
    try {
      const res = await fetch('/api/tasks')
      if (!res.ok) return
      const data = await res.json()
      setAllTasks(data.tasks ?? [])
    } catch (err) {
      console.error('Tasks fetch error:', err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchTasks()
  }, [fetchTasks])

  const handleComplete = async (taskId: string) => {
    // Optimistic update
    setAllTasks((prev) =>
      prev.map((t) =>
        t.id === taskId
          ? { ...t, status: 'completed', completed_at: new Date().toISOString() }
          : t
      )
    )
    try {
      await fetch(`/api/tasks/${taskId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'completed' }),
      })
    } catch (err) {
      console.error('Complete task error:', err)
      fetchTasks()
    }
  }

  const today = todayIST()
  const openTasks    = allTasks.filter((t) => t.status === 'open' && !t.is_overdue)
  const overdueTasks = allTasks.filter((t) => t.status === 'open' && t.is_overdue)
  const completedTasks = allTasks.filter((t) => t.status === 'completed')

  const openCount    = openTasks.length + overdueTasks.length
  const overdueCount = overdueTasks.length

  const filteredTasks: Task[] = (() => {
    switch (filter) {
      case 'open':      return [...overdueTasks, ...openTasks]
      case 'overdue':   return overdueTasks
      case 'completed': return completedTasks
      default:          return [...overdueTasks, ...openTasks, ...completedTasks]
    }
  })()

  return (
    <div
      className="animate-fade-in min-h-dvh bg-[#0A0A0A] text-[#F5F5F5]"
      style={{ paddingBottom: 'calc(96px + env(safe-area-inset-bottom))' }}
    >
      <div className="px-5 pt-6">

        {/* ── Header ──────────────────────────────────────────────────── */}
        <div className="mb-4">
          <h1 className="text-[24px] font-bold tracking-tight text-[#F5F5F5]">Tasks</h1>
          {!loading && (
            <p className="mt-0.5 text-[14px] text-[#6B7280]">
              {openCount === 0
                ? 'No open tasks'
                : `${openCount} open${overdueCount > 0 ? ` · ${overdueCount} overdue` : ''}`}
            </p>
          )}
        </div>

        {/* ── Filter tabs ──────────────────────────────────────────────── */}
        <div className="mb-5 flex gap-0 border-b border-[#2A2A2A]">
          {FILTERS.map(({ label, value }) => (
            <button
              key={value}
              type="button"
              onClick={() => setFilter(value)}
              className={cn(
                'px-4 pb-2.5 pt-0.5 text-[14px] font-medium transition-colors',
                filter === value
                  ? 'border-b-2 border-amber-400 text-amber-400'
                  : 'border-b-2 border-transparent text-[#6B7280] hover:text-[#F5F5F5]'
              )}
            >
              {label}
              {value === 'overdue' && overdueCount > 0 && (
                <span className="ml-1.5 rounded-full bg-[rgba(239,68,68,0.15)] px-1.5 py-0.5 text-[10px] font-bold text-[#EF4444]">
                  {overdueCount}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* ── Task list ────────────────────────────────────────────────── */}
        {loading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-20 animate-pulse rounded-xl bg-[#141414]" />
            ))}
          </div>
        ) : filteredTasks.length === 0 ? (
          <EmptyState filter={filter} />
        ) : (
          <div className="space-y-2.5">
            {filteredTasks.map((task) => (
              <TaskCard
                key={task.id}
                task={task}
                onComplete={handleComplete}
              />
            ))}
          </div>
        )}

      </div>
    </div>
  )
}
