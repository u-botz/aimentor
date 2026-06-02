import { auth } from '@clerk/nextjs/server'
import { supabaseAdmin } from '@/lib/supabase/admin'

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { userId } = await auth()
    if (!userId) return new Response('Unauthorized', { status: 401 })

    const { id } = await params

    // Verify session belongs to this user
    const { data: session, error: sessionError } = await supabaseAdmin
      .from('sessions')
      .select('id')
      .eq('id', id)
      .eq('user_id', userId)
      .single()

    if (sessionError || !session) {
      return new Response('Not found', { status: 404 })
    }

    const { data: messages, error: messagesError } = await supabaseAdmin
      .from('messages')
      .select('role, content, created_at')
      .eq('session_id', id)
      .order('created_at', { ascending: true })

    if (messagesError) {
      console.error('Messages fetch error:', messagesError)
      return new Response('DB error', { status: 500 })
    }

    return Response.json(messages ?? [])
  } catch (error) {
    console.error('Messages route error:', error)
    return new Response('Internal server error', { status: 500 })
  }
}
