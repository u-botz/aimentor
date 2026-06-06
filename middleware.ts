import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/admin'

const isPublicRoute = createRouteMatcher([
  '/',
  '/sign-in(.*)',
  '/sign-up(.*)',
  '/manifest.json',
])

const isOnboardingExempt = createRouteMatcher([
  '/onboarding',
  '/api/user/sync',
  '/api/user/profile',
])

export default clerkMiddleware(async (auth, request) => {
  const { pathname } = request.nextUrl

  // Signed-in users skip the landing page → go to /home
  if (pathname === '/') {
    const { userId } = await auth()
    if (userId) {
      return NextResponse.redirect(new URL('/home', request.url))
    }
    return
  }

  // /dashboard → /home redirect (backwards compat for any saved links)
  if (pathname === '/dashboard') {
    const { userId } = await auth()
    if (userId) {
      return NextResponse.redirect(new URL('/home', request.url))
    }
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
    return NextResponse.json({ error: 'Onboarding required' }, { status: 403 })
  }

  return NextResponse.redirect(new URL('/onboarding', request.url))
})

export const config = {
  matcher: [
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
    '/(api|trpc)(.*)',
  ],
}
