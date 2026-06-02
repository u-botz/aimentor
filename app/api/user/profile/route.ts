import { auth } from '@clerk/nextjs/server'
import { supabaseAdmin } from '@/lib/supabase/admin'

export async function PATCH(req: Request) {
  try {
    const { userId } = await auth()
    if (!userId) return new Response('Unauthorized', { status: 401 })

    const body = await req.json() as {
      name: string
      age: number
      role: string
      primary_goal: string
      non_negotiables: string[]
      strictness: number
      communication_style: string
      reminder_time: string
      onboarded: boolean
    }

    const { error } = await supabaseAdmin
      .from('users')
      .update({
        name: body.name,
        age: body.age,
        role: body.role,
        primary_goal: body.primary_goal,
        non_negotiables: body.non_negotiables,
        strictness: body.strictness,
        communication_style: body.communication_style,
        reminder_time: body.reminder_time,
        onboarded: body.onboarded,
      })
      .eq('id', userId)

    if (error) {
      console.error('Profile update error:', error)
      return new Response('DB error', { status: 500 })
    }

    return Response.json({ success: true })
  } catch (error) {
    console.error('Profile error:', error)
    return new Response('Internal server error', { status: 500 })
  }
}
