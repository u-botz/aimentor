import { auth } from '@clerk/nextjs/server'
import { supabaseAdmin } from '@/lib/supabase/admin'

export async function GET() {
  try {
    const { userId } = await auth()
    if (!userId) return new Response('Unauthorized', { status: 401 })

    // Fetch sessions with the first user message for each
    const { data: sessions, error } = await supabaseAdmin
      .from('sessions')
      .select(`
        id,
        mode,
        created_at,
        status,
        debrief_date,
        messages (
          content,
          role,
          created_at
        )
      `)
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(20)

    if (error) {
      console.error('Sessions fetch error:', error)
      return new Response('DB error', { status: 500 })
    }

    const result = (sessions ?? []).map((session) => {
      const msgs = (session.messages ?? []) as {
        content: string
        role: string
        created_at: string
      }[]
      const sorted = msgs.sort(
        (a, b) =>
          new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
      )
      const firstUserMsg = sorted.find((m) => m.role === 'user')

      return {
        id: session.id,
        mode: session.mode as 'open_chat' | 'debrief',
        created_at: session.created_at,
        status: session.status as string | null,
        debrief_date: session.debrief_date as string | null,
        first_message: firstUserMsg?.content ?? null,
      }
    })

    return Response.json(result)
  } catch (error) {
    console.error('Sessions route error:', error)
    return new Response('Internal server error', { status: 500 })
  }
}
