import { auth } from '@clerk/nextjs/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { runSessionExtraction } from '@/app/api/session/extract/route'

async function closeAndExtractAbandonedSessions(userId: string) {
  const { data: abandoned, error } = await supabaseAdmin
    .from('sessions')
    .select('id, mode')
    .eq('user_id', userId)
    .eq('status', 'active')
    .is('closed_at', null)

  if (error) {
    console.error('Abandoned sessions lookup error:', error)
    return
  }

  const now = new Date().toISOString()

  for (const session of abandoned ?? []) {
    await supabaseAdmin
      .from('sessions')
      .update({ status: 'closed', closed_at: now })
      .eq('id', session.id)
      .eq('user_id', userId)

    if (session.mode !== 'debrief') continue

    const { data: messages } = await supabaseAdmin
      .from('messages')
      .select('role, content')
      .eq('session_id', session.id)
      .order('created_at', { ascending: true })

    if (!messages?.length) continue

    try {
      await runSessionExtraction(
        userId,
        session.id,
        messages as { role: 'user' | 'assistant'; content: string }[]
      )
    } catch (err) {
      console.error('Abandoned session extraction failed:', session.id, err)
    }
  }
}

export async function POST(req: Request) {
  try {
    const { userId } = await auth()
    if (!userId) return new Response('Unauthorized', { status: 401 })

    const { mode } = await req.json() as { mode: 'open_chat' | 'debrief' }

    await closeAndExtractAbandonedSessions(userId)

    const sessionData: {
      user_id: string
      mode: string
      debrief_date?: string
    } = {
      user_id: userId,
      mode,
    }

    // For debrief, tag with today's date
    if (mode === 'debrief') {
      sessionData.debrief_date = new Date().toISOString().split('T')[0]
    }

    const { data, error } = await supabaseAdmin
      .from('sessions')
      .insert(sessionData)
      .select('id')
      .single()

    if (error) {
      console.error('Session creation error:', error)
      return new Response('DB error', { status: 500 })
    }

    return Response.json({ sessionId: data.id })
  } catch (error) {
    console.error('Session error:', error)
    return new Response('Internal server error', { status: 500 })
  }
}
