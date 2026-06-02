import { auth } from '@clerk/nextjs/server'
import { supabaseAdmin } from '@/lib/supabase/admin'

export async function POST(req: Request) {
  try {
    const { userId } = await auth()
    if (!userId) return new Response('Unauthorized', { status: 401 })

    const { sessionId } = (await req.json()) as { sessionId: string }
    if (!sessionId) return new Response('Missing sessionId', { status: 400 })

    const { error } = await supabaseAdmin
      .from('sessions')
      .update({
        status: 'closed',
        closed_at: new Date().toISOString(),
      })
      .eq('id', sessionId)
      .eq('user_id', userId)

    if (error) {
      console.error('Session close error:', error)
      return new Response('DB error', { status: 500 })
    }

    return Response.json({ success: true })
  } catch (error) {
    console.error('Session close error:', error)
    return new Response('Internal server error', { status: 500 })
  }
}
