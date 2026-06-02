import webpush from 'web-push'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { istDateString, shiftDateString } from '@/lib/date'

// ── Helpers ──────────────────────────────────────────────────────────────────

function getCurrentTimeIST(): string {
  const formatter = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Kolkata',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
  const parts = formatter.formatToParts(new Date())
  const hour = parts.find((p) => p.type === 'hour')?.value ?? '00'
  const minute = parts.find((p) => p.type === 'minute')?.value ?? '00'
  return `${hour}:${minute}`
}

function isValidCronRequest(req: Request): boolean {
  const secret = process.env.CRON_SECRET
  if (!secret) return false
  if (req.headers.get('x-cron-secret') === secret) return true
  const auth = req.headers.get('authorization')
  return auth === `Bearer ${secret}`
}

type NotificationKind =
  | 'morning'
  | 'debrief'
  | 'streak_broken'
  | 'gone_quiet'
  | 'commitment_due'

interface Notification {
  title: string
  body: string
  url: string
}

// ── Route ─────────────────────────────────────────────────────────────────────

export async function GET(req: Request) {
  try {
    if (!isValidCronRequest(req)) {
      return new Response('Unauthorized', { status: 401 })
    }

    const currentTime = getCurrentTimeIST()
    const todayIST = istDateString()
    const yesterdayIST = shiftDateString(todayIST, -1)
    const cutoff48h = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString()

    webpush.setVapidDetails(
      process.env.VAPID_EMAIL!,
      process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!,
      process.env.VAPID_PRIVATE_KEY!
    )

    // 1. Fetch all users who have a push subscription
    const { data: rows, error: rowsError } = await supabaseAdmin
      .from('push_subscriptions')
      .select(`
        subscription,
        users (
          id,
          reminder_time,
          morning_time
        )
      `)

    if (rowsError) {
      console.error('push_subscriptions query error:', rowsError)
      return new Response('DB error', { status: 500 })
    }

    // 2. For every user with a valid subscription, evaluate triggers
    const fired: { user_id: string; kind: string }[] = []

    for (const row of rows ?? []) {
      const rawUser = row.users
      const user = (Array.isArray(rawUser) ? rawUser[0] : rawUser) as {
        id: string
        reminder_time: string | null
        morning_time: string | null
      } | null

      if (!user?.id || !row.subscription) continue

      const userId = user.id
      const subscription = row.subscription as webpush.PushSubscription

      // Load today's notification_log for this user once
      const { data: sentToday } = await supabaseAdmin
        .from('notification_log')
        .select('kind')
        .eq('user_id', userId)
        .eq('sent_date', todayIST)

      const alreadySent = new Set((sentToday ?? []).map((r: { kind: string }) => r.kind))

      const triggers: Array<{
        kind: NotificationKind
        condition: boolean
        notification: Notification
      }> = [
        // ── TRIGGER A: morning ────────────────────────────────────────────────
        {
          kind: 'morning',
          condition:
            !!user.morning_time && currentTime === user.morning_time,
          notification: {
            title: 'AI Mentor',
            body: "Good morning. What's the one thing that would make today count?",
            url: '/chat?mode=morning',
          },
        },
        // ── TRIGGER B: debrief ────────────────────────────────────────────────
        {
          kind: 'debrief',
          condition:
            !!user.reminder_time && currentTime === user.reminder_time,
          notification: {
            title: 'AI Mentor',
            body: `It's ${currentTime}. How did today actually go?`,
            url: '/chat?mode=debrief',
          },
        },
        // ── TRIGGER C: streak_broken ─────────────────────────────────────────
        // Fires at 09:00 when yesterday has no completed debrief_log row
        {
          kind: 'streak_broken',
          condition: currentTime === '09:00',
          notification: {
            title: 'AI Mentor',
            body: "You didn't check in last night. Your streak is on the line.",
            url: '/chat?mode=debrief',
          },
        },
        // ── TRIGGER D: gone_quiet ────────────────────────────────────────────
        // Fires at 10:00 when user has no session in last 48 h
        {
          kind: 'gone_quiet',
          condition: currentTime === '10:00',
          notification: {
            title: 'AI Mentor',
            body: "You've gone quiet. That's usually when things slip.",
            url: '/chat',
          },
        },
        // ── TRIGGER E: commitment_due ─────────────────────────────────────────
        // Fires at 09:00 when user has an open commitment due today
        {
          kind: 'commitment_due',
          condition: currentTime === '09:00',
          notification: {
            title: 'AI Mentor',
            body: '', // filled in after DB check below
            url: '/chat',
          },
        },
      ]

      for (const trigger of triggers) {
        if (!trigger.condition) continue
        if (alreadySent.has(trigger.kind)) continue

        // ── Extra DB checks for triggers that need them ────────────────────

        if (trigger.kind === 'streak_broken') {
          const { data: yesterdayLog } = await supabaseAdmin
            .from('debrief_logs')
            .select('id')
            .eq('user_id', userId)
            .eq('debrief_date', yesterdayIST)
            .eq('completed', true)
            .maybeSingle()
          if (yesterdayLog) continue // not broken — skip
        }

        if (trigger.kind === 'gone_quiet') {
          const { data: recentSession } = await supabaseAdmin
            .from('sessions')
            .select('created_at')
            .eq('user_id', userId)
            .gt('created_at', cutoff48h)
            .limit(1)
            .maybeSingle()
          if (recentSession) continue // active recently — skip
        }

        if (trigger.kind === 'commitment_due') {
          const { data: dueToday } = await supabaseAdmin
            .from('open_commitments')
            .select('commitment')
            .eq('user_id', userId)
            .eq('status', 'open')
            .eq('due_date', todayIST)
            .limit(1)
            .maybeSingle()
          if (!dueToday) continue // nothing due today — skip
          trigger.notification.body = `Today's the day you said you'd ${dueToday.commitment}. Did you?`
        }

        // ── Send push ────────────────────────────────────────────────────────

        try {
          await webpush.sendNotification(
            subscription,
            JSON.stringify(trigger.notification)
          )
        } catch (err) {
          console.error(`Push failed — user ${userId} kind ${trigger.kind}:`, err)
          continue
        }

        // ── Log to notification_log (upsert so concurrent cron runs are safe)

        await supabaseAdmin.from('notification_log').upsert(
          { user_id: userId, kind: trigger.kind, sent_date: todayIST },
          { onConflict: 'user_id,kind,sent_date', ignoreDuplicates: true }
        )

        fired.push({ user_id: userId, kind: trigger.kind })
      }
    }

    return Response.json({ processed: (rows ?? []).length, fired })
  } catch (error) {
    console.error('Cron notify error:', error)
    return new Response('Internal server error', { status: 500 })
  }
}
