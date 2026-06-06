import { auth } from '@clerk/nextjs/server'
import { supabaseAdmin } from '@/lib/supabase/admin'

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { userId } = await auth()
    if (!userId) return new Response('Unauthorized', { status: 401 })

    const { id } = await params
    const body = (await req.json()) as { status?: string }

    if (!body.status) {
      return Response.json({ error: 'Status required' }, { status: 400 })
    }

    const update: Record<string, unknown> = { status: body.status }
    if (body.status === 'completed') {
      update.completed_at = new Date().toISOString()
    }

    const { data, error } = await supabaseAdmin
      .from('mentor_tasks')
      .update(update)
      .eq('id', id)
      .eq('user_id', userId)
      .select()
      .single()

    if (error) throw error
    if (!data) return Response.json({ error: 'Not found' }, { status: 404 })

    return Response.json({ task: data })
  } catch (err) {
    console.error('Task PATCH error:', err)
    return new Response('Internal server error', { status: 500 })
  }
}
