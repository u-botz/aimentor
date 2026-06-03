import { auth } from '@clerk/nextjs/server'
import { supabaseAdmin } from '@/lib/supabase/admin'

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { userId } = await auth()
    if (!userId) return new Response('Unauthorized', { status: 401 })

    const { id } = await params

    // Delete messages first (in case there is no cascade)
    await supabaseAdmin.from('messages').delete().eq('session_id', id)

    const { error } = await supabaseAdmin
      .from('sessions')
      .delete()
      .eq('id', id)
      .eq('user_id', userId)

    if (error) {
      console.error('Session delete error:', error)
      return new Response('DB error', { status: 500 })
    }

    return new Response(null, { status: 204 })
  } catch (error) {
    console.error('Session delete error:', error)
    return new Response('Internal server error', { status: 500 })
  }
}
