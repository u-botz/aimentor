'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { useUser, UserButton } from '@clerk/nextjs'
import {
  Sparkles,
  Moon,
  MessageCircle,
  LayoutDashboard,
  User,
} from 'lucide-react'
import { cn } from '@/lib/utils'

export type SessionMode = 'open_chat' | 'debrief' | 'morning'

export type SessionSummary = {
  id: string
  mode: SessionMode
  created_at: string
  status: string | null
  debrief_date: string | null
  first_message: string | null
}

type AppSidebarProps = {
  /** Controls the off-canvas drawer on mobile. On md+ the sidebar is always shown. */
  open: boolean
  onClose: () => void
  /**
   * Interactive (chat) mode — when these are supplied the sidebar drives the
   * chat page's in-place state. When omitted, the sidebar runs in navigation
   * mode: it fetches its own sessions and routes to /chat on interaction.
   */
  sessions?: SessionSummary[]
  activeSessionId?: string
  onSelectSession?: (s: SessionSummary) => void
  onNewChat?: () => void
  hasDebriefedToday?: boolean
  isDebriefTime?: boolean
}

const getTodayISTDate = () =>
  new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' })

const isPastReminderTime = (reminderTime: string) => {
  const [h, m] = reminderTime.split(':').map(Number)
  const now = new Date()
  const ist = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }))
  return ist.getHours() * 60 + ist.getMinutes() >= h * 60 + m
}

function relativeDate(dateStr: string): string {
  const date = new Date(dateStr)
  const now = new Date()
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const yesterdayStart = new Date(todayStart)
  yesterdayStart.setDate(todayStart.getDate() - 1)
  if (date >= todayStart) return 'Today'
  if (date >= yesterdayStart) return 'Yesterday'
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

export function AppSidebar({
  open,
  onClose,
  sessions: sessionsProp,
  activeSessionId,
  onSelectSession,
  onNewChat,
  hasDebriefedToday: debriefedProp,
  isDebriefTime: debriefTimeProp,
}: AppSidebarProps) {
  const router = useRouter()
  const pathname = usePathname()
  const { isLoaded, user } = useUser()

  const interactive = typeof onSelectSession === 'function'

  // ── Navigation mode: fetch our own sessions + debrief state ──
  const [navSessions, setNavSessions] = useState<SessionSummary[]>([])
  const [navDebriefed, setNavDebriefed] = useState(false)
  const [navDebriefTime, setNavDebriefTime] = useState(false)

  useEffect(() => {
    if (interactive) return
    let cancelled = false
    ;(async () => {
      try {
        const [sessionsRes, profileRes] = await Promise.all([
          fetch('/api/sessions'),
          fetch('/api/user/profile'),
        ])
        if (!cancelled && sessionsRes.ok) {
          const data = (await sessionsRes.json()) as SessionSummary[]
          setNavSessions(data)
          const today = getTodayISTDate()
          setNavDebriefed(
            data.some(
              (s) =>
                s.mode === 'debrief' &&
                s.status === 'closed' &&
                s.debrief_date === today
            )
          )
        }
        if (!cancelled && profileRes.ok) {
          const p = (await profileRes.json()) as { reminder_time?: string | null }
          if (p.reminder_time) setNavDebriefTime(isPastReminderTime(p.reminder_time))
        }
      } catch (err) {
        console.error('Sidebar load error:', err)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [interactive])

  const sessions = sessionsProp ?? navSessions
  const hasDebriefedToday = debriefedProp ?? navDebriefed
  const isDebriefTime = debriefTimeProp ?? navDebriefTime

  const handleCTA = useCallback(() => {
    if (onNewChat) {
      onNewChat()
      return
    }
    onClose()
    router.push('/chat')
  }, [onNewChat, onClose, router])

  const handleSelect = useCallback(
    (s: SessionSummary) => {
      if (onSelectSession) {
        onSelectSession(s)
        return
      }
      onClose()
      router.push(`/chat?session=${s.id}`)
    },
    [onSelectSession, onClose, router]
  )

  const navTo = (path: string) => {
    onClose()
    router.push(path)
  }

  return (
    <>
      {/* Mobile overlay */}
      {open && (
        <div
          className="fixed inset-0 z-20 bg-black/50 md:hidden"
          onClick={onClose}
        />
      )}

      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-30 flex w-[260px] flex-col bg-[#111118]',
          'border-r border-zinc-800/60 transition-transform duration-200',
          'md:relative md:translate-x-0',
          open ? 'translate-x-0' : '-translate-x-full'
        )}
      >
        {/* Top */}
        <div className="shrink-0 px-4 pt-4 pb-3 border-b border-zinc-800/40">
          <div className="flex items-center gap-2 mb-4">
            <Sparkles className="h-4 w-4 text-[#2E5BFF]" />
            <span className="text-sm font-semibold tracking-tight">AI Mentor</span>
          </div>
          <button
            type="button"
            onClick={handleCTA}
            className={cn(
              'w-full rounded-lg px-3 py-2 text-xs font-medium transition-colors',
              hasDebriefedToday
                ? 'bg-zinc-800/80 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-300'
                : 'bg-[#2E5BFF] text-white hover:bg-[#2548d4]'
            )}
          >
            {hasDebriefedToday
              ? '✓ Debrief Done'
              : isDebriefTime
                ? "Start Tonight's Debrief"
                : 'Talk to Your Mentor'}
          </button>
        </div>

        {/* Sessions */}
        <div className="flex-1 overflow-y-auto py-3">
          {sessions.length > 0 && (
            <p className="px-4 pb-2 text-[10px] font-medium uppercase tracking-wider text-zinc-600">
              Recent
            </p>
          )}
          <ul className="flex flex-col gap-0.5 px-2">
            {sessions.map((s) => {
              const isActive = s.id === activeSessionId
              const title = s.first_message
                ? s.first_message.slice(0, 40) +
                  (s.first_message.length > 40 ? '…' : '')
                : 'New conversation'
              return (
                <li key={s.id}>
                  <button
                    type="button"
                    onClick={() => handleSelect(s)}
                    className={cn(
                      'w-full rounded-lg px-3 py-2.5 text-left transition-colors border-l-2',
                      isActive
                        ? 'border-[#2E5BFF] bg-[#1a1a2e] text-zinc-100'
                        : 'border-transparent text-zinc-400 hover:bg-zinc-800/50 hover:text-zinc-200'
                    )}
                  >
                    <div className="flex items-center gap-2 mb-0.5">
                      {s.mode === 'debrief' ? (
                        <Moon className="h-3 w-3 shrink-0 text-zinc-500" />
                      ) : (
                        <MessageCircle className="h-3 w-3 shrink-0 text-zinc-500" />
                      )}
                      <span className="truncate text-xs font-medium leading-tight">
                        {title}
                      </span>
                    </div>
                    <p className="pl-5 text-[10px] text-zinc-600">
                      {relativeDate(s.created_at)}
                    </p>
                  </button>
                </li>
              )
            })}
          </ul>
        </div>

        {/* Bottom — nav links + user */}
        <div className="shrink-0 border-t border-zinc-800/40 px-4 py-3">
          <button
            type="button"
            onClick={() => navTo('/dashboard')}
            className={cn(
              'mb-1 flex w-full items-center gap-2 rounded-lg px-3 py-2 text-xs font-medium transition-colors',
              pathname === '/dashboard'
                ? 'bg-[#1a1a2e] text-zinc-100'
                : 'text-zinc-400 hover:bg-zinc-800/50 hover:text-zinc-200'
            )}
          >
            <LayoutDashboard className="h-4 w-4 shrink-0" />
            Dashboard
          </button>
          <button
            type="button"
            onClick={() => navTo('/profile')}
            className={cn(
              'mb-3 flex w-full items-center gap-2 rounded-lg px-3 py-2 text-xs font-medium transition-colors',
              pathname === '/profile'
                ? 'bg-[#1a1a2e] text-zinc-100'
                : 'text-zinc-400 hover:bg-zinc-800/50 hover:text-zinc-200'
            )}
          >
            <User className="h-4 w-4 shrink-0" />
            Profile
          </button>
          <div className="flex items-center gap-2.5">
            {isLoaded && <UserButton />}
            <div className="min-w-0">
              <p className="truncate text-xs font-medium text-zinc-300">
                {user?.firstName ?? user?.emailAddresses?.[0]?.emailAddress ?? ''}
              </p>
              <p className="text-[10px] text-zinc-600">Free</p>
            </div>
          </div>
        </div>
      </aside>
    </>
  )
}
