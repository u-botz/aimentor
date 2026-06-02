import { auth } from '@clerk/nextjs/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { istDateString, shiftDateString } from '@/lib/date'

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
      .select('commitment, made_on')
      .eq('user_id', userId)
      .eq('status', 'open')
      .order('made_on', { ascending: false })

    if (commitsError) throw commitsError

    const openCommitments = commitments?.map(c => ({
      commitment: c.commitment,
      date: c.made_on
    })) || []

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
    let hStreak = 0
    let cStreak = 0

    if (validLogs.length > 0) {
      const mostRecentDate = validLogs[0].debrief_date
      // Start counting streak only if the most recent log is from today or yesterday
      if (mostRecentDate === todayStr || mostRecentDate === yesterdayStr) {
        let cursorDateStr: string = mostRecentDate
        let hBroken = false
        let cBroken = false
        let logIndex = 0

        while (logIndex < validLogs.length) {
          const targetDateStr = cursorDateStr
          const log = validLogs[logIndex]

          if (log.debrief_date === targetDateStr) {
            dStreak++

            if (!hBroken && (log.hydration_litres ?? 0) >= 2.0) {
              hStreak++
            } else {
              hBroken = true
            }

            if (!cBroken && !log.dairy_violation && !log.finance_violation) {
              cStreak++
            } else {
              cBroken = true
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

    return Response.json({
      streaks: {
        debrief: dStreak,
        hydration: hStreak,
        clean: cStreak
      },
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
