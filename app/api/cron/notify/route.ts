import webpush from 'web-push'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { istDateString, shiftDateString } from '@/lib/date'
import { generateProactiveMessage } from '@/lib/mentor-voice'

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

type CandidateUser = {
  id: string
  name: string | null
  reminder_time: string | null
  morning_time: string | null
  morning_enabled: boolean | null
}

function urlForKind(kind: NotificationKind): string {
  if (kind === 'morning') return '/chat?mode=morning'
  if (kind === 'debrief') return '/chat?mode=debrief'
  return '/chat'
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
    const cutoff48hMs = Date.now() - 48 * 60 * 60 * 1000

    webpush.setVapidDetails(
      process.env.VAPID_EMAIL!,
      process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!,
      process.env.VAPID_PRIVATE_KEY!
    )

    // 1. Fetch all users that have a push subscription (join users + push_subscriptions).
    const { data: rows, error: rowsError } = await supabaseAdmin
      .from('push_subscriptions')
      .select(`
        subscription,
        users (
          id,
          name,
          reminder_time,
          morning_time,
          morning_enabled
        )
      `)

    if (rowsError) {
      console.error('push_subscriptions query error:', rowsError)
      return new Response('DB error', { status: 500 })
    }

    // Dedupe to one subscription per user so multiple devices don't double-fire.
    const candidates = new Map<
      string,
      { user: CandidateUser; subscription: webpush.PushSubscription }
    >()

    for (const row of rows ?? []) {
      const rawUser = row.users
      const user = (Array.isArray(rawUser) ? rawUser[0] : rawUser) as
        | CandidateUser
        | null
      if (!user?.id || !row.subscription) continue
      if (!candidates.has(user.id)) {
        candidates.set(user.id, {
          user,
          subscription: row.subscription as webpush.PushSubscription,
        })
      }
    }

    let sent = 0

    // 2 + 3 + 4. Evaluate triggers per user.
    for (const { user, subscription } of candidates.values()) {
      const userId = user.id
      try {
        // Load today's already-sent kinds for this user once.
        const { data: sentToday } = await supabaseAdmin
          .from('notification_log')
          .select('kind')
          .eq('user_id', userId)
          .eq('sent_date', todayIST)

        const alreadySent = new Set(
          (sentToday ?? []).map((r: { kind: string }) => r.kind)
        )
        const notSent = (kind: NotificationKind) => !alreadySent.has(kind)

        // The notifications we'll actually send this run, with their context.
        const toSend: { kind: NotificationKind; context: string }[] = []

        // ── Exact-time triggers (independent) ────────────────────────────────
        if (
          user.morning_enabled === true &&
          currentTime === user.morning_time &&
          notSent('morning')
        ) {
          toSend.push({ kind: 'morning', context: 'start of day' })
        }

        if (currentTime === user.reminder_time && notSent('debrief')) {
          toSend.push({
            kind: 'debrief',
            context: `end of day check-in, current time ${currentTime}`,
          })
        }

        // ── Non-time-based triggers (capped to the single highest priority) ──
        // Priority: commitment_due > streak_broken > gone_quiet.
        let commitmentDue: { text: string } | null = null
        let streakBroken = false
        let goneQuiet = false

        if (currentTime === '09:00') {
          // commitment_due — at least one open commitment due today.
          if (notSent('commitment_due')) {
            const { data: dueToday } = await supabaseAdmin
              .from('open_commitments')
              .select('commitment')
              .eq('user_id', userId)
              .eq('status', 'open')
              .eq('due_date', todayIST)
              .order('made_on', { ascending: true })
              .limit(1)
              .maybeSingle()
            if (dueToday?.commitment) {
              commitmentDue = { text: dueToday.commitment }
            }
          }

          // streak_broken — no debrief_logs row for yesterday.
          if (notSent('streak_broken')) {
            const { data: yesterdayLog } = await supabaseAdmin
              .from('debrief_logs')
              .select('completed, deferred_reason')
              .eq('user_id', userId)
              .eq('debrief_date', yesterdayIST)
              .maybeSingle()

            // Missed only if: no row at all, OR a row that was neither completed nor deferred.
            streakBroken =
              !yesterdayLog ||
              (!yesterdayLog.completed && !yesterdayLog.deferred_reason)
          }
        }

        if (currentTime === '10:00' && notSent('gone_quiet')) {
          const { data: latestSession } = await supabaseAdmin
            .from('sessions')
            .select('created_at')
            .eq('user_id', userId)
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle()
          goneQuiet =
            !latestSession ||
            new Date(latestSession.created_at).getTime() < cutoff48hMs
        }

        if (commitmentDue) {
          toSend.push({
            kind: 'commitment_due',
            context: `committed to: ${commitmentDue.text}, due today`,
          })
        } else if (streakBroken) {
          toSend.push({
            kind: 'streak_broken',
            context: "missed last night's debrief",
          })
        } else if (goneQuiet) {
          toSend.push({
            kind: 'gone_quiet',
            context: 'no activity for over 2 days',
          })
        }

        // ── Generate + send + log for each firing trigger ────────────────────
        for (const { kind, context } of toSend) {
          try {
            const body = await generateProactiveMessage({
              name: user.name ?? '',
              kind,
              context,
            })

            await webpush.sendNotification(
              subscription,
              JSON.stringify({
                title: 'AI Mentor',
                body,
                url: urlForKind(kind),
              })
            )

            // Insert with onConflict-ignore so a racing duplicate run is harmless.
            await supabaseAdmin.from('notification_log').upsert(
              { user_id: userId, kind, sent_date: todayIST },
              { onConflict: 'user_id,kind,sent_date', ignoreDuplicates: true }
            )

            sent += 1
          } catch (err) {
            console.error(
              `Notify failed — user ${userId} kind ${kind}:`,
              err
            )
          }
        }
      } catch (err) {
        console.error(`Notify failed — user ${userId}:`, err)
      }
    }

    return Response.json({ success: true, sent, checked: candidates.size })
  } catch (error) {
    console.error('Cron notify error:', error)
    return new Response('Internal server error', { status: 500 })
  }
}
