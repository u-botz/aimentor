import { createClient } from '@supabase/supabase-js'
import { auth } from '@clerk/nextjs/server'

// Creates a Supabase client authenticated with the user's Clerk JWT.
// Use this in API routes so RLS policies work correctly.
export async function createAuthClient() {
  const { getToken } = await auth()
  const token = await getToken({ template: 'supabase' })

  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      global: {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      },
    }
  )
}
