import { auth } from '@clerk/nextjs/server'
import { supabaseAdmin } from '@/lib/supabase/admin'

export async function POST(req: Request) {
  try {
    const { userId } = await auth()
    if (!userId) return new Response('Unauthorized', { status: 401 })

    const { subscription } = (await req.json()) as {
      subscription: PushSubscriptionJSON
    }

    if (!subscription?.endpoint) {
      return new Response('Invalid subscription', { status: 400 })
    }

    const { error } = await supabaseAdmin
      .from('push_subscriptions')
      .upsert(
        { user_id: userId, subscription },
        { onConflict: 'user_id' }
      )

    if (error) {
      console.error('Push subscription upsert error:', error)
      return new Response('DB error', { status: 500 })
    }

    return Response.json({ success: true })
  } catch (error) {
    console.error('Subscribe error:', error)
    return new Response('Internal server error', { status: 500 })
  }
}
