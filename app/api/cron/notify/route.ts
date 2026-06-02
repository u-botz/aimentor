import webpush from 'web-push'
import { supabaseAdmin } from '@/lib/supabase/admin'

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

export async function GET(req: Request) {
  try {
    if (!isValidCronRequest(req)) {
      return new Response('Unauthorized', { status: 401 })
    }

    const currentTime = getCurrentTimeIST()

    const { data: users, error: usersError } = await supabaseAdmin
      .from('users')
      .select('id')
      .eq('reminder_time', currentTime)

    if (usersError) {
      console.error('Users query error:', usersError)
      return new Response('DB error', { status: 500 })
    }

    const title = 'AI Mentor'
    const body = `It's ${currentTime}. How did today actually go?`
    const url = '/chat?mode=debrief'

    webpush.setVapidDetails(
      process.env.VAPID_EMAIL!,
      process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!,
      process.env.VAPID_PRIVATE_KEY!
    )

    let notified = 0

    for (const user of users ?? []) {
      const { data: subRow } = await supabaseAdmin
        .from('push_subscriptions')
        .select('subscription')
        .eq('user_id', user.id)
        .single()

      if (!subRow?.subscription) continue

      try {
        await webpush.sendNotification(
          subRow.subscription as webpush.PushSubscription,
          JSON.stringify({ title, body, url })
        )
        notified++
      } catch (err) {
        console.error('Push failed for user:', user.id, err)
      }
    }

    return Response.json({ success: true, notified })
  } catch (error) {
    console.error('Cron notify error:', error)
    return new Response('Internal server error', { status: 500 })
  }
}
