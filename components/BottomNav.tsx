'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useUser } from '@clerk/nextjs'
import { Home, MessageCircle, CheckSquare, User } from 'lucide-react'
import { useEffect, useState } from 'react'
import { cn } from '@/lib/utils'

const HIDDEN_ROUTES = new Set(['/', '/onboarding'])

type Tab = {
  label: string
  icon: React.ElementType
  href: string
  match: string[]
  badge?: boolean
}

const TABS: Tab[] = [
  { label: 'Home',    icon: Home,          href: '/home',    match: ['/home', '/dashboard'] },
  { label: 'Chat',   icon: MessageCircle, href: '/chat',    match: ['/chat'] },
  { label: 'Tasks',  icon: CheckSquare,   href: '/tasks',   match: ['/tasks'], badge: true },
  { label: 'Profile', icon: User,         href: '/profile', match: ['/profile'] },
]

export function BottomNav() {
  const pathname = usePathname()
  const { isSignedIn, isLoaded } = useUser()
  const [openCount, setOpenCount] = useState(0)

  // Fetch open task count (refetch on route change so badge stays fresh)
  useEffect(() => {
    if (!isSignedIn) return
    fetch('/api/tasks?status=open')
      .then((r) => (r.ok ? r.json() : { tasks: [] }))
      .then((d) => setOpenCount(d.tasks?.length ?? 0))
      .catch(() => {})
  }, [isSignedIn, pathname])

  // Determine whether nav should be visible
  const shouldHide =
    !isLoaded ||
    !isSignedIn ||
    HIDDEN_ROUTES.has(pathname) ||
    pathname?.startsWith('/sign-in') ||
    pathname?.startsWith('/sign-up')

  if (shouldHide) return null

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-50 border-t border-[#2A2A2A] bg-[#0A0A0A]"
      style={{
        height: 'calc(64px + env(safe-area-inset-bottom))',
        paddingBottom: 'env(safe-area-inset-bottom)',
      }}
    >
      <div className="flex h-16 items-stretch">
        {TABS.map(({ label, icon: Icon, href, match, badge }) => {
          const isActive = match.some(
            (m) => pathname === m || pathname?.startsWith(m + '/')
          )
          const count = badge ? openCount : 0

          return (
            <Link
              key={href}
              href={href}
              className="relative flex flex-1 flex-col items-center justify-center gap-[3px] py-2"
            >
              {/* Icon + badge */}
              <div className="relative">
                <Icon
                  size={24}
                  strokeWidth={isActive ? 2.5 : 1.5}
                  className={cn(
                    'transition-colors',
                    isActive ? 'text-amber-400' : 'text-[#6B7280]'
                  )}
                />
                {count > 0 && (
                  <span className="absolute -right-1.5 -top-1 flex min-w-[16px] items-center justify-center rounded-full bg-amber-400 px-[3px] py-px text-[9px] font-bold leading-none text-black">
                    {count > 99 ? '99+' : count}
                  </span>
                )}
              </div>

              {/* Label */}
              <span
                className={cn(
                  'text-[11px] font-medium leading-none transition-colors',
                  isActive ? 'text-amber-400' : 'text-[#6B7280]'
                )}
              >
                {label}
              </span>

              {/* Active indicator dot */}
              {isActive && (
                <span className="absolute bottom-1.5 h-[3px] w-[3px] rounded-full bg-amber-400" />
              )}
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
