import { auth } from '@clerk/nextjs/server'
import { supabaseAdmin } from '@/lib/supabase/admin'

export async function POST(req: Request) {
  try {
    const { userId } = await auth()
    if (!userId) return new Response('Unauthorized', { status: 401 })

    const { sessionId, content } = await req.json()
    if (!sessionId || !content) {
      return new Response('Missing sessionId or content', { status: 400 })
    }

    // Check if opener already saved (idempotency guard)
    const { count } = await supabaseAdmin
      .from('messages')
      .select('*', { count: 'exact', head: true })
      .eq('session_id', sessionId)
      .eq('role', 'assistant')

    if ((count ?? 0) > 0) {
      return Response.json({ saved: false, reason: 'already exists' })
    }

    const { error } = await supabaseAdmin.from('messages').insert({
      session_id: sessionId,
      user_id: userId,
      role: 'assistant',
      content,
    })

    if (error) {
      console.error('[messages/save] insert failed:', error)
      return new Response('Insert failed', { status: 500 })
    }

    return Response.json({ saved: true })
  } catch (err) {
    console.error('[messages/save] error:', err)
    return new Response('Internal server error', { status: 500 })
  }
}
