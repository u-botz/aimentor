import { auth, currentUser } from '@clerk/nextjs/server'
import { supabaseAdmin } from '@/lib/supabase/admin'

export async function GET() {
  try {
    const { userId } = await auth()
    if (!userId) return new Response('Unauthorized', { status: 401 })

    const { data, error } = await supabaseAdmin
      .from('users')
      .select('onboarded')
      .eq('id', userId)
      .maybeSingle()

    if (error) {
      console.error('Profile fetch error:', error)
      return new Response('DB error', { status: 500 })
    }

    return Response.json({ onboarded: data?.onboarded === true })
  } catch (error) {
    console.error('Profile GET error:', error)
    return new Response('Internal server error', { status: 500 })
  }
}

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

    const profileFields = {
      name: body.name,
      age: body.age,
      role: body.role,
      primary_goal: body.primary_goal,
      non_negotiables: body.non_negotiables,
      strictness: body.strictness,
      communication_style: body.communication_style,
      reminder_time: body.reminder_time,
      onboarded: body.onboarded,
    }

    const { data: updated, error: updateError } = await supabaseAdmin
      .from('users')
      .update(profileFields)
      .eq('id', userId)
      .select('id')
      .maybeSingle()

    if (updateError) {
      console.error('Profile update error:', updateError)
      return new Response('DB error', { status: 500 })
    }

    if (!updated) {
      const clerkUser = await currentUser()
      const email = clerkUser?.emailAddresses[0]?.emailAddress
      const { error: insertError } = await supabaseAdmin.from('users').insert({
        id: userId,
        email,
        ...profileFields,
      })

      if (insertError) {
        console.error('Profile insert error:', insertError)
        return Response.json(
          { error: 'Could not save profile' },
          { status: 500 }
        )
      }
    }

    return Response.json({ success: true, onboarded: body.onboarded })
  } catch (error) {
    console.error('Profile error:', error)
    return new Response('Internal server error', { status: 500 })
  }
}
