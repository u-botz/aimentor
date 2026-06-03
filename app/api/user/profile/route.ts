import { auth, currentUser } from '@clerk/nextjs/server'
import { supabaseAdmin } from '@/lib/supabase/admin'

export async function GET() {
  try {
    const { userId } = await auth()
    if (!userId) return new Response('Unauthorized', { status: 401 })

    const { data, error } = await supabaseAdmin
      .from('users')
      .select(
        'onboarded, reminder_time, morning_time, name, age, role, primary_goal, non_negotiables, strictness, communication_style'
      )
      .eq('id', userId)
      .maybeSingle()

    if (error) {
      console.error('Profile fetch error:', error)
      return new Response('DB error', { status: 500 })
    }

    return Response.json({
      onboarded: data?.onboarded === true,
      reminder_time: data?.reminder_time ?? null,
      morning_time: data?.morning_time ?? null,
      name: data?.name ?? '',
      age: data?.age ?? null,
      role: data?.role ?? '',
      primary_goal: data?.primary_goal ?? '',
      non_negotiables: data?.non_negotiables ?? [],
      strictness: data?.strictness ?? 3,
      communication_style: data?.communication_style ?? 'Balanced',
    })
  } catch (error) {
    console.error('Profile GET error:', error)
    return new Response('Internal server error', { status: 500 })
  }
}

export async function PATCH(req: Request) {
  try {
    const { userId } = await auth()
    if (!userId) return new Response('Unauthorized', { status: 401 })

    const body = (await req.json()) as Partial<{
      name: string
      age: number
      role: string
      primary_goal: string
      non_negotiables: string[]
      tracked_domains: string[]
      strictness: number
      communication_style: string
      reminder_time: string
      morning_time: string
      onboarded: boolean
    }>

    // Only update the fields actually present in the request, so a profile edit
    // that touches one section never nulls out the others.
    const ALLOWED_FIELDS = [
      'name',
      'age',
      'role',
      'primary_goal',
      'non_negotiables',
      'tracked_domains',
      'strictness',
      'communication_style',
      'reminder_time',
      'morning_time',
      'onboarded',
    ] as const

    const profileFields: Record<string, unknown> = {}
    for (const key of ALLOWED_FIELDS) {
      if (body[key] !== undefined) profileFields[key] = body[key]
    }

    if (Object.keys(profileFields).length === 0) {
      return Response.json({ error: 'No fields to update' }, { status: 400 })
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

    return Response.json({ success: true, onboarded: body.onboarded ?? true })
  } catch (error) {
    console.error('Profile error:', error)
    return new Response('Internal server error', { status: 500 })
  }
}
