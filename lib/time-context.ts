/**
 * Rich temporal context for the AI Mentor.
 *
 * buildTimeContext   — queries Supabase and returns a structured TimeContext.
 * formatTimeContextForPrompt — serialises that object into the prompt block
 *                              the mentor reads before anything else.
 *
 * All time arithmetic is done in IST (Asia/Kolkata, UTC+5:30).
 * "Today" always means the current IST calendar day.
 */

import { supabaseAdmin } from '@/lib/supabase/admin'
import { istDateString, shiftDateString } from '@/lib/date'

// ─── Public types ─────────────────────────────────────────────────────────────

export type TimeOfDay = 'morning' | 'afternoon' | 'evening' | 'late_night'
export type SessionWindow = 'pre_debrief' | 'debrief_window' | 'post_debrief'

export type TimeContext = {
  // ── Raw time ──────────────────────────────────────────────────────────────
  timeString: string       // "HH:MM" in IST
  dateString: string       // "YYYY-MM-DD" in IST
  dayOfWeek: string        // "Monday", "Tuesday", …
  displayDate: string      // "Thursday, 5 June 2026"
  reminderTimeUsed: string // the user's reminder time, or "21:00" as default

  // ── Derived time state ────────────────────────────────────────────────────
  timeOfDay: TimeOfDay
  sessionWindow: SessionWindow
  isWeekStart: boolean     // Monday morning
  isWeekEnd: boolean       // Friday evening OR Sunday

  // ── Debrief / morning state ───────────────────────────────────────────────
  debriefDoneToday: boolean
  morningPrioritySet: boolean
  hoursSinceLastSession: number | null  // null = no sessions yet
  lastSessionType: 'debrief' | 'open_chat' | 'morning' | null
  daysSinceLastDebrief: number          // 999 = never debriefed
  currentStreak: number                 // consecutive completed debrief days

  // ── Tasks & commitments ───────────────────────────────────────────────────
  tasksDueToday: number
  tasksDueNow: number        // tasks due today (no due_time col → same as tasksDueToday)
  overdueTasksCount: number  // due_date < today AND status = 'open'
  overdueCommitments: number // status = 'open' AND made_on < today − 3 days
}

// ─── Private helpers ──────────────────────────────────────────────────────────

const DEFAULT_REMINDER = '21:00'

/** "HH:MM" → total minutes since midnight */
function toMinutes(t: string): number {
  const [h = 0, m = 0] = t.split(':').map(Number)
  return h * 60 + m
}

/** Whole IST calendar days between two YYYY-MM-DD strings. */
function istDaysBetween(from: string, to: string): number {
  const a = Date.parse(`${from}T00:00:00Z`)
  const b = Date.parse(`${to}T00:00:00Z`)
  if (Number.isNaN(a) || Number.isNaN(b)) return 0
  return Math.max(0, Math.round((b - a) / 86_400_000))
}

function computeTimeOfDay(currentMins: number, reminderMins: number): TimeOfDay {
  if (currentMins < 12 * 60) return 'morning'
  if (currentMins < 17 * 60) return 'afternoon'
  if (currentMins < reminderMins) return 'evening'
  return 'late_night'
}

function computeSessionWindow(currentMins: number, reminderMins: number): SessionWindow {
  const diff = currentMins - reminderMins
  if (diff < -60) return 'pre_debrief'
  if (diff > 60) return 'post_debrief'
  return 'debrief_window'
}

/**
 * Computes the running debrief streak ending on today (or yesterday).
 * Logs must already be filtered to completed = true, ordered newest-first.
 */
function computeStreak(
  completedLogs: { debrief_date: string }[],
  todayStr: string
): number {
  const yesterdayStr = shiftDateString(todayStr, -1)
  const doneSet = new Set(completedLogs.map((l) => l.debrief_date))

  // Streak is broken if neither today nor yesterday is in the set
  if (!doneSet.has(todayStr) && !doneSet.has(yesterdayStr)) return 0

  let streak = 0
  let cursor = doneSet.has(todayStr) ? todayStr : yesterdayStr
  while (doneSet.has(cursor)) {
    streak++
    cursor = shiftDateString(cursor, -1)
  }
  return streak
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Fetches all temporal signals from the DB and returns a fully typed
 * TimeContext.  All DB calls run in parallel via Promise.all.
 */
export async function buildTimeContext(
  userId: string,
  userReminderTime?: string | null
): Promise<TimeContext> {
  const now = new Date()

  // ── IST clock ──────────────────────────────────────────────────────────────
  const timeParts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Kolkata',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(now)

  const istHour   = parseInt(timeParts.find((p) => p.type === 'hour')?.value   ?? '0', 10)
  const istMinute = parseInt(timeParts.find((p) => p.type === 'minute')?.value ?? '0', 10)
  const currentMins = istHour * 60 + istMinute
  const timeString  = `${String(istHour).padStart(2, '0')}:${String(istMinute).padStart(2, '0')}`
  const dateString  = istDateString(now)

  // ── Human-readable date ────────────────────────────────────────────────────
  const dayOfWeek = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Kolkata', weekday: 'long',
  }).format(now)

  const dayNum   = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Kolkata', day: 'numeric'  }).format(now)
  const month    = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Kolkata', month: 'long'   }).format(now)
  const year     = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Kolkata', year: 'numeric' }).format(now)
  const displayDate = `${dayOfWeek}, ${dayNum} ${month} ${year}`

  // ── Computed time state ────────────────────────────────────────────────────
  const reminderTimeUsed = userReminderTime ?? DEFAULT_REMINDER
  const reminderMins     = toMinutes(reminderTimeUsed)
  const timeOfDay        = computeTimeOfDay(currentMins, reminderMins)
  const sessionWindow    = computeSessionWindow(currentMins, reminderMins)
  const isWeekStart = dayOfWeek === 'Monday' && timeOfDay === 'morning'
  const isWeekEnd   = (dayOfWeek === 'Friday' && (timeOfDay === 'evening' || timeOfDay === 'late_night'))
                   || dayOfWeek === 'Sunday'

  // ── Parallel DB queries ────────────────────────────────────────────────────
  const todayStr      = dateString
  const thirtyAgo     = shiftDateString(todayStr, -30)
  const threeDaysAgo  = shiftDateString(todayStr, -3)

  const [
    debriefLogsRes,
    morningPlanRes,
    lastSessionRes,
    overdueCommitmentsRes,
    openTasksRes,
  ] = await Promise.all([
    // Completed debrief logs — last 30 days (sufficient for any real streak)
    supabaseAdmin
      .from('debrief_logs')
      .select('debrief_date')
      .eq('user_id', userId)
      .eq('completed', true)
      .gte('debrief_date', thirtyAgo)
      .order('debrief_date', { ascending: false }),

    // Did the user set a morning priority today?
    supabaseAdmin
      .from('daily_plans')
      .select('plan_date')
      .eq('user_id', userId)
      .eq('plan_date', todayStr)
      .maybeSingle(),

    // Most recent session of any type / status
    supabaseAdmin
      .from('sessions')
      .select('mode, created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),

    // Open commitments that have had no update in 3+ days
    supabaseAdmin
      .from('open_commitments')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('status', 'open')
      .lt('made_on', threeDaysAgo),

    // All open tasks — filter for due-today / overdue in code
    supabaseAdmin
      .from('mentor_tasks')
      .select('due_date')
      .eq('user_id', userId)
      .eq('status', 'open'),
  ])

  // ── Debrief state ──────────────────────────────────────────────────────────
  const debriefLogs      = debriefLogsRes.data ?? []
  const debriefDoneToday = debriefLogs.some((l) => l.debrief_date === todayStr)
  const currentStreak    = computeStreak(debriefLogs, todayStr)
  const lastDebriefDate  = debriefLogs[0]?.debrief_date ?? null
  const daysSinceLastDebrief = lastDebriefDate
    ? istDaysBetween(lastDebriefDate, todayStr)
    : 999

  // ── Morning priority ───────────────────────────────────────────────────────
  const morningPrioritySet = !!morningPlanRes.data

  // ── Last session ───────────────────────────────────────────────────────────
  const lastSess = lastSessionRes.data
  const hoursSinceLastSession = lastSess
    ? Math.round((now.getTime() - new Date(lastSess.created_at).getTime()) / 3_600_000)
    : null
  const lastSessionType = lastSess
    ? (lastSess.mode as 'debrief' | 'open_chat' | 'morning')
    : null

  // ── Tasks ──────────────────────────────────────────────────────────────────
  const openTasks        = openTasksRes.data ?? []
  const tasksDueToday    = openTasks.filter((t) => t.due_date === todayStr).length
  const overdueTasksCount = openTasks.filter((t) => !!t.due_date && t.due_date < todayStr).length
  // No due_time column in current schema — treat all due-today tasks as due now
  const tasksDueNow      = tasksDueToday

  // ── Overdue commitments ────────────────────────────────────────────────────
  const overdueCommitments = overdueCommitmentsRes.count ?? 0

  return {
    timeString,
    dateString,
    dayOfWeek,
    displayDate,
    reminderTimeUsed,
    timeOfDay,
    sessionWindow,
    isWeekStart,
    isWeekEnd,
    debriefDoneToday,
    morningPrioritySet,
    hoursSinceLastSession,
    lastSessionType,
    daysSinceLastDebrief,
    currentStreak,
    tasksDueToday,
    tasksDueNow,
    overdueTasksCount,
    overdueCommitments,
  }
}

/**
 * Converts a TimeContext into the formatted prompt block that is injected
 * as the first section of Block 3 (before memory and mode instructions).
 */
export function formatTimeContextForPrompt(ctx: TimeContext): string {
  const lines: string[] = []

  lines.push('## TIME & CONTEXT RIGHT NOW')
  lines.push('')
  lines.push(`It is ${ctx.timeString} on ${ctx.displayDate}.`)

  // ── Debrief / morning status ───────────────────────────────────────────────
  if (ctx.debriefDoneToday) {
    lines.push("Tonight's debrief is complete. The day is closed.")
  } else if (ctx.timeOfDay === 'late_night') {
    lines.push(
      `The debrief window opened at ${ctx.reminderTimeUsed}. Tonight's debrief has not happened.`
    )
  }

  if (
    !ctx.morningPrioritySet &&
    ctx.timeOfDay === 'morning' &&
    ctx.timeString >= '09:00'
  ) {
    lines.push('No morning intention set yet today.')
  }

  lines.push('')

  // ── Last session ───────────────────────────────────────────────────────────
  if (ctx.hoursSinceLastSession === null) {
    lines.push('Last session: none (first session).')
  } else {
    const modeLabel =
      ctx.lastSessionType === 'debrief' ? 'Nightly Debrief'
      : ctx.lastSessionType === 'morning' ? 'Morning Check-in'
      : 'Open Chat'

    if (ctx.hoursSinceLastSession < 1) {
      lines.push(`Last session: ${modeLabel}, just now.`)
    } else if (ctx.hoursSinceLastSession < 24) {
      const h = ctx.hoursSinceLastSession
      lines.push(`Last session: ${modeLabel}, ${h} hour${h === 1 ? '' : 's'} ago.`)
    } else {
      const d = Math.floor(ctx.hoursSinceLastSession / 24)
      lines.push(`Last session: ${modeLabel}, ${d} day${d === 1 ? '' : 's'} ago.`)
      lines.push(`No session in ${ctx.hoursSinceLastSession} hours.`)
    }
  }

  // ── Tasks & commitments ────────────────────────────────────────────────────
  if (ctx.tasksDueToday > 0) {
    lines.push(`Open tasks due today: ${ctx.tasksDueToday}.`)
  }
  if (ctx.overdueTasksCount > 0) {
    lines.push(`Overdue tasks: ${ctx.overdueTasksCount}.`)
  }
  if (ctx.overdueCommitments > 0) {
    lines.push(`Commitments with no update in 3+ days: ${ctx.overdueCommitments}.`)
  }

  // ── Week markers ───────────────────────────────────────────────────────────
  if (ctx.isWeekStart) {
    lines.push('It is Monday morning — the week is opening.')
  } else if (ctx.isWeekEnd) {
    lines.push('The week is closing.')
  }

  lines.push('')
  lines.push(
    `Current streak: ${ctx.currentStreak} day${ctx.currentStreak === 1 ? '' : 's'}.`
  )

  return lines.join('\n')
}
