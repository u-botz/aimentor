import { auth } from '@clerk/nextjs/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { istDateString, shiftDateString } from '@/lib/date'

function getCurrentTimeIST(): string {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Kolkata',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(new Date())
  const hour = parts.find((p) => p.type === 'hour')?.value ?? '00'
  const minute = parts.find((p) => p.type === 'minute')?.value ?? '00'
  return `${hour}:${minute}`
}

export async function GET(req: Request) {
  try {
    const { userId } = await auth()
    if (!userId) return new Response('Unauthorized', { status: 401 })

    // Fetch all debrief logs
    const { data: logs, error: logsError } = await supabaseAdmin
      .from('debrief_logs')
      .select('*')
      .eq('user_id', userId)
      .order('debrief_date', { ascending: false })

    if (logsError) throw logsError

    // Fetch open commitments
    const { data: commitments, error: commitsError } = await supabaseAdmin
      .from('open_commitments')
      .select('commitment, made_on, due_date')
      .eq('user_id', userId)
      .eq('status', 'open')
      .order('made_on', { ascending: false })

    if (commitsError) throw commitsError

    const openCommitments = commitments?.map(c => ({
      commitment: c.commitment,
      date: c.made_on,
      due_date: c.due_date ?? null
    })) || []

    // Fetch the user's check-in times for time-of-day context
    const { data: userRow } = await supabaseAdmin
      .from('users')
      .select('reminder_time, morning_time')
      .eq('id', userId)
      .maybeSingle()

    // Fetch today's morning-set plan (if any)
    const todayPlanDate = istDateString()
    const { data: planRow } = await supabaseAdmin
      .from('daily_plans')
      .select('top_priority, intentions')
      .eq('user_id', userId)
      .eq('plan_date', todayPlanDate)
      .maybeSingle()

    const todaysPlan = planRow
      ? {
          top_priority: planRow.top_priority ?? '',
          intentions: planRow.intentions ?? '',
        }
      : null

    const validLogs = logs?.filter(log => log.completed) || []

    let longestStreak = 0
    let currentLongest = 0
    let prevDateStr: string | null = null

    for (const log of validLogs) {
      if (!prevDateStr) {
        currentLongest = 1
      } else {
        const expectedDateStr = shiftDateString(prevDateStr, -1)

        if (log.debrief_date === expectedDateStr) {
          currentLongest++
        } else if (log.debrief_date !== prevDateStr) {
          currentLongest = 1
        }
      }
      prevDateStr = log.debrief_date
      if (currentLongest > longestStreak) {
        longestStreak = currentLongest
      }
    }

    const todayStr = istDateString()
    const yesterdayStr = shiftDateString(todayStr, -1)

    let dStreak = 0
    let financeStreak = 0

    if (validLogs.length > 0) {
      const mostRecentDate = validLogs[0].debrief_date
      // Start counting streak only if the most recent log is from today or yesterday
      if (mostRecentDate === todayStr || mostRecentDate === yesterdayStr) {
        let cursorDateStr: string = mostRecentDate
        let financeBroken = false
        let logIndex = 0

        while (logIndex < validLogs.length) {
          const targetDateStr = cursorDateStr
          const log = validLogs[logIndex]

          if (log.debrief_date === targetDateStr) {
            dStreak++

            // Finance streak: a logged day with no finance violation (false/null).
            // Stops at the first day with finance_violation = true.
            if (!financeBroken && !log.finance_violation) {
              financeStreak++
            } else {
              financeBroken = true
            }

            cursorDateStr = shiftDateString(cursorDateStr, -1)
            logIndex++

            // Skip duplicates if any
            while (logIndex < validLogs.length && validLogs[logIndex].debrief_date === targetDateStr) {
               logIndex++
            }
          } else if (log.debrief_date > targetDateStr) {
            // Future log relative to cursor, skip
            logIndex++
          } else {
            // Gap found
            break
          }
        }
      }
    }

    const debriefedToday =
      validLogs.length > 0 && validLogs[0].debrief_date === todayStr

    const todaysPriority = validLogs.length > 0 ? validLogs[0].tomorrow_priority : null

    const last7DaysLogs = validLogs.slice(0, 7).reverse()
    const recentScores = last7DaysLogs.map(log => ({
      date: log.debrief_date,
      score: log.score_overall ?? 0
    }))

    // Average only days that actually produced a score, so a debrief logged
    // without an inferred score doesn't drag the average down to zero.
    const scoredLogs = last7DaysLogs.filter(log => log.score_overall != null)
    const weeklyAverage = scoredLogs.length > 0
      ? Math.round((scoredLogs.reduce((acc, log) => acc + (log.score_overall ?? 0), 0) / scoredLogs.length) * 10) / 10
      : 0

    // Time-of-day context (IST) for the frontend to pick the right state
    const currentTime = getCurrentTimeIST()
    const reminderTime = userRow?.reminder_time ?? null
    let period: 'morning' | 'day' | 'evening'
    if (currentTime < '12:00') {
      period = 'morning'
    } else if (reminderTime && currentTime >= reminderTime) {
      period = 'evening'
    } else {
      period = 'day'
    }

    return Response.json({
      streaks: {
        debrief: dStreak,
        finance: financeStreak
      },
      timeContext: {
        period,
        currentTime
      },
      todaysPlan,
      recentScores,
      weeklyAverage,
      todaysPriority,
      openCommitments,
      totalDebriefs: validLogs.length,
      longestStreak,
      debriefedToday
    })

  } catch (error) {
    console.error('Dashboard API Error:', error)
    return new Response('Internal server error', { status: 500 })
  }
}
