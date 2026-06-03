import { auth } from '@clerk/nextjs/server'
import webpush from 'web-push'
import { supabaseAdmin } from '@/lib/supabase/admin'

export async function POST(req: Request) {
  try {
    const cronSecret = req.headers.get('x-cron-secret')
    const isCron = cronSecret === process.env.CRON_SECRET

    const { userId, title, body, url } = (await req.json()) as {
      userId: string
      title: string
      body: string
      url: string
    }

    if (!userId || !title || !body || !url) {
      return new Response('Missing fields', { status: 400 })
    }

    if (!isCron) {
      const { userId: authUserId } = await auth()
      if (!authUserId) return new Response('Unauthorized', { status: 401 })
      if (authUserId !== userId) return new Response('Forbidden', { status: 403 })
    } else if (!process.env.CRON_SECRET) {
      return new Response('Unauthorized', { status: 401 })
    }

    const { data: row, error } = await supabaseAdmin
      .from('push_subscriptions')
      .select('subscription')
      .eq('user_id', userId)
      .maybeSingle()

    if (error || !row?.subscription) {
      return new Response('Subscription not found', { status: 404 })
    }

    webpush.setVapidDetails(
      process.env.VAPID_EMAIL!,
      process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!,
      process.env.VAPID_PRIVATE_KEY!
    )

    try {
      await webpush.sendNotification(
        row.subscription as webpush.PushSubscription,
        JSON.stringify({ title, body, url })
      )
    } catch (err) {
      // Clean up an expired/invalid subscription so it isn't retried.
      const statusCode = (err as { statusCode?: number })?.statusCode
      if (statusCode === 404 || statusCode === 410) {
        await supabaseAdmin
          .from('push_subscriptions')
          .delete()
          .eq('user_id', userId)
        return new Response('Subscription expired', { status: 410 })
      }
      throw err
    }

    return Response.json({ success: true })
  } catch (error) {
    console.error('Send notification error:', error)
    return new Response('Internal server error', { status: 500 })
  }
}
