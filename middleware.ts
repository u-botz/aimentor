import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/admin'

const isPublicRoute = createRouteMatcher([
  '/',
  '/sign-in(.*)',
  '/sign-up(.*)',
  // PWA manifest must be publicly fetchable. It ends in `.json`, which the
  // config matcher does NOT exclude (that exclusion is `webmanifest` only), so
  // without this Clerk redirects the manifest request to sign-in and Chrome
  // marks the app "not installable" on Android/desktop.
  '/manifest.json',
])

const isOnboardingExempt = createRouteMatcher([
  '/onboarding',
  '/api/user/sync',
  '/api/user/profile',
])

export default clerkMiddleware(async (auth, request) => {
  // Signed-in users skip the marketing landing page and go straight to the app.
  // This also covers the PWA launch, whose start_url is "/".
  if (request.nextUrl.pathname === '/') {
    const { userId } = await auth()
    if (userId) {
      return NextResponse.redirect(new URL('/dashboard', request.url))
    }
    return // anonymous visitor → show the landing page
  }

  if (isPublicRoute(request)) return

  const { userId } = await auth.protect()

  if (isOnboardingExempt(request)) return

  const { data: user } = await supabaseAdmin
    .from('users')
    .select('onboarded')
    .eq('id', userId)
    .maybeSingle()

  if (user?.onboarded) return

  if (request.nextUrl.pathname.startsWith('/api/')) {
    return NextResponse.json(
      { error: 'Onboarding required' },
      { status: 403 }
    )
  }

  return NextResponse.redirect(new URL('/onboarding', request.url))
})

export const config = {
  matcher: [
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
    '/(api|trpc)(.*)',
  ],
}
