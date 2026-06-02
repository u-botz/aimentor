import { createClient } from '@supabase/supabase-js'

// Server-only. Never expose service role key to browser.
export const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)
