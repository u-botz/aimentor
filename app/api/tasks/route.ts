import { auth } from '@clerk/nextjs/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { istDateString } from '@/lib/date'

export async function GET(req: Request) {
  try {
    const { userId } = await auth()
    if (!userId) return new Response('Unauthorized', { status: 401 })

    const url = new URL(req.url)
    const statusFilter = url.searchParams.get('status')

    let query = supabaseAdmin
      .from('mentor_tasks')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })

    if (statusFilter && statusFilter !== 'all') {
      query = query.eq('status', statusFilter)
    }

    const { data, error } = await query
    if (error) throw error

    const today = istDateString()

    const tasks = (data ?? []).map((task) => ({
      id: task.id,
      title: task.title,
      context: task.context ?? null,
      status: task.status as 'open' | 'completed',
      due_date: task.due_date ?? null,
      source_mode: task.source_mode ?? null,
      source_date: task.source_date ?? null,
      created_at: task.created_at,
      completed_at: task.completed_at ?? null,
      is_overdue:
        task.status === 'open' &&
        !!task.due_date &&
        task.due_date < today,
    }))

    return Response.json({ tasks })
  } catch (err) {
    console.error('Tasks GET error:', err)
    return new Response('Internal server error', { status: 500 })
  }
}

export async function POST(req: Request) {
  try {
    const { userId } = await auth()
    if (!userId) return new Response('Unauthorized', { status: 401 })

    const body = (await req.json()) as {
      title: string
      context?: string
      due_date?: string
      source_session_id?: string
      source_mode?: string
      source_date?: string
    }

    if (!body.title?.trim()) {
      return Response.json({ error: 'Title required' }, { status: 400 })
    }

    const { data, error } = await supabaseAdmin
      .from('mentor_tasks')
      .insert({
        user_id: userId,
        title: body.title.trim(),
        context: body.context?.trim() ?? null,
        due_date: body.due_date ?? null,
        source_session_id: body.source_session_id ?? null,
        source_mode: body.source_mode ?? null,
        source_date: body.source_date ?? null,
      })
      .select()
      .single()

    if (error) throw error

    return Response.json({ task: data }, { status: 201 })
  } catch (err) {
    console.error('Tasks POST error:', err)
    return new Response('Internal server error', { status: 500 })
  }
}
