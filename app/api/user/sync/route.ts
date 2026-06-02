import { auth, currentUser } from '@clerk/nextjs/server'
import { supabaseAdmin } from '@/lib/supabase/admin'

// Called once after signup to create user row in Supabase
export async function POST() {
  try {
    const { userId } = await auth()
    if (!userId) return new Response('Unauthorized', { status: 401 })

    const clerkUser = await currentUser()
    if (!clerkUser) return new Response('User not found', { status: 404 })

    const email = clerkUser.emailAddresses[0]?.emailAddress
    const name =
      `${clerkUser.firstName ?? ''} ${clerkUser.lastName ?? ''}`.trim() ||
      email?.split('@')[0] ||
      'User'

    const { data: existing } = await supabaseAdmin
      .from('users')
      .select('id')
      .eq('id', userId)
      .maybeSingle()

    const { error } = existing
      ? await supabaseAdmin
          .from('users')
          .update({ email, name })
          .eq('id', userId)
      : await supabaseAdmin.from('users').insert({
          id: userId,
          email,
          name,
          onboarded: false,
        })

    if (error) {
      console.error('User sync error:', error)
      return new Response('DB error', { status: 500 })
    }

    return Response.json({ success: true })
  } catch (error) {
    console.error('Sync error:', error)
    return new Response('Internal server error', { status: 500 })
  }
}
