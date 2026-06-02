'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useUser, UserButton } from '@clerk/nextjs'
import {
  SendHorizontal,
  Square,
  Sparkles,
  Moon,
  MessageCircle,
  Menu,
  X,
} from 'lucide-react'
import { cn } from '@/lib/utils'

type MessageRole = 'user' | 'assistant'
type SessionMode = 'open_chat' | 'debrief'

type Message = {
  role: MessageRole
  content: string
}

type SessionSummary = {
  id: string
  mode: SessionMode
  created_at: string
  status: string | null
  debrief_date: string | null
  first_message: string | null
}

const getISTTime = () => {
  const now = new Date()
  const istTime = new Date(
    now.toLocaleString('en-US', { timeZone: 'Asia/Kolkata' })
  )
  return {
    hours: istTime.getHours(),
    minutes: istTime.getMinutes(),
  }
}

const isPastReminderTime = (reminderTime: string) => {
  const [reminderHour, reminderMinute] = reminderTime.split(':').map(Number)
  const { hours, minutes } = getISTTime()
  const nowTotal = hours * 60 + minutes
  const reminderTotal = reminderHour * 60 + reminderMinute
  return nowTotal >= reminderTotal
}

const getTodayISTDate = () =>
  new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' })

const LINE_HEIGHT_PX = 24
const MAX_TEXTAREA_LINES = 4

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

function renderMarkdown(text: string) {
  const segments = text.split(/(\*\*[^*]+\*\*)/g)
  return segments.map((segment, i) => {
    if (segment.startsWith('**') && segment.endsWith('**')) {
      return (
        <strong key={i} className="font-semibold">
          {segment.slice(2, -2)}
        </strong>
      )
    }
    const lines = segment.split('\n')
    return lines.map((line, j) => (
      <span key={`${i}-${j}`}>
        {line}
        {j < lines.length - 1 && <br />}
      </span>
    ))
  })
}

function TypingIndicator() {
  return (
    <div className="flex justify-start">
      <div className="rounded-2xl border border-zinc-700/50 bg-[#1a1a2e] px-4 py-3">
        <div className="flex gap-1.5">
          {[0, 1, 2].map((i) => (
            <span
              key={i}
              className="h-2 w-2 rounded-full bg-zinc-400 animate-bounce"
              style={{ animationDelay: `${i * 150}ms` }}
            />
          ))}
        </div>
      </div>
    </div>
  )
}

export default function ChatPage() {
  const router = useRouter()
  const { isLoaded, user } = useUser()

  // Chat state
  const [messages, setMessages] = useState<Message[]>([])
  const [sessionId, setSessionId] = useState('')
  const [mode, setMode] = useState<SessionMode>('open_chat')
  const [isLoading, setIsLoading] = useState(false)
  const [input, setInput] = useState('')

  // End session state
  const [sessionSaved, setSessionSaved] = useState(false)
  const [confirmEnd, setConfirmEnd] = useState(false)
  const [isSaving, setIsSaving] = useState(false)

  // Sidebar state
  const [sessions, setSessions] = useState<SessionSummary[]>([])
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [loadingSession, setLoadingSession] = useState(false)
  const [hasDebriefedToday, setHasDebriefedToday] = useState(false)
  const [reminderTime, setReminderTime] = useState<string | null>(null)
  const [isDebriefTime, setIsDebriefTime] = useState(false)

  const messagesEndRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // ── Scroll ──────────────────────────────────────────────────────────────────

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [])

  useEffect(() => {
    scrollToBottom()
  }, [messages, isLoading, scrollToBottom])

  // ── Sessions list ───────────────────────────────────────────────────────────

  const fetchSessions = useCallback(async () => {
    try {
      const res = await fetch('/api/sessions')
      if (!res.ok) return
      const data = (await res.json()) as SessionSummary[]
      setSessions(data)
      const today = getTodayISTDate()
      setHasDebriefedToday(
        data.some(
          (s) =>
            s.mode === 'debrief' &&
            s.status === 'closed' &&
            s.debrief_date === today
        )
      )
    } catch (err) {
      console.error('Failed to fetch sessions:', err)
    }
  }, [])

  // Auto-refresh CTA when IST clock crosses the user's reminder_time
  useEffect(() => {
    if (!reminderTime) return

    setIsDebriefTime(isPastReminderTime(reminderTime))

    const [reminderHour, reminderMinute] = reminderTime.split(':').map(Number)
    const now = new Date()
    const ist = new Date(
      now.toLocaleString('en-US', { timeZone: 'Asia/Kolkata' })
    )
    const target = new Date(ist)
    target.setHours(reminderHour, reminderMinute, 0, 0)
    if (ist >= target) target.setDate(target.getDate() + 1)
    const msUntilReminder = target.getTime() - ist.getTime()
    const timer = setTimeout(() => setIsDebriefTime(true), msUntilReminder)
    return () => clearTimeout(timer)
  }, [reminderTime])

  // ── Init — only sync user + load sidebar. Session created lazily on first send. ──

  useEffect(() => {
    let cancelled = false

    async function initialize() {
      try {
        await fetch('/api/user/sync', { method: 'POST' })
        const profileRes = await fetch('/api/user/profile')
        if (profileRes.ok) {
          const profile = (await profileRes.json()) as {
            onboarded?: boolean
            reminder_time?: string | null
          }
          if (!profile.onboarded) {
            router.replace('/onboarding')
            return
          }
          if (profile.reminder_time) {
            setReminderTime(profile.reminder_time)
          }
        }
        if (!cancelled) fetchSessions()
      } catch (err) {
        console.error('Initialization failed:', err)
      }
    }

    initialize()
    return () => { cancelled = true }
  }, [router])

  // ── Textarea resize ──────────────────────────────────────────────────────────

  const resizeTextarea = useCallback(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    const maxHeight = LINE_HEIGHT_PX * MAX_TEXTAREA_LINES
    el.style.height = `${Math.min(el.scrollHeight, maxHeight)}px`
  }, [])

  useEffect(() => {
    resizeTextarea()
  }, [input, resizeTextarea])

  // ── Start a new blank chat (no DB session yet — created lazily on first send) ──

  const createNewSession = useCallback((newMode: SessionMode) => {
    setSessionId('')
    setMode(newMode)
    setMessages([])
    setInput('')
    setSessionSaved(false)
    setConfirmEnd(false)
    setSidebarOpen(false)
  }, [])

  const handleSmartCTA = useCallback(() => {
    if (hasDebriefedToday) {
      createNewSession('open_chat')
    } else if (isDebriefTime) {
      createNewSession('debrief')
    } else {
      createNewSession('open_chat')
    }
  }, [hasDebriefedToday, isDebriefTime, createNewSession])

  // ── Actually create the DB session row (called once per conversation) ─────────

  const ensureSession = useCallback(async (currentMode: SessionMode): Promise<string | null> => {
    try {
      const res = await fetch('/api/session/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: currentMode }),
      })
      if (!res.ok) throw new Error('Session creation failed')
      const { sessionId: id } = (await res.json()) as { sessionId: string }
      setSessionId(id)
      return id
    } catch (err) {
      console.error('Session creation error:', err)
      return null
    }
  }, [])

  // ── Load historical session ──────────────────────────────────────────────────

  const loadSession = useCallback(async (s: SessionSummary) => {
    if (s.id === sessionId) { setSidebarOpen(false); return }
    setLoadingSession(true)
    try {
      const res = await fetch(`/api/sessions/${s.id}/messages`)
      if (!res.ok) throw new Error('Failed to load messages')
      const data = (await res.json()) as { role: MessageRole; content: string }[]
      setMessages(data.map((m) => ({ role: m.role, content: m.content })))
      setSessionId(s.id)
      setMode(s.mode)
      setConfirmEnd(false)
      setSessionSaved(false)
      setSidebarOpen(false)
    } catch (err) {
      console.error('Load session error:', err)
    } finally {
      setLoadingSession(false)
    }
  }, [sessionId])

  // ── End debrief session ──────────────────────────────────────────────────────

  const handleEndSession = async () => {
    if (!sessionId) return
    setIsSaving(true)
    setConfirmEnd(false)
    try {
      const closeRes = await fetch('/api/session/close', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId }),
      })
      if (!closeRes.ok) throw new Error('Session close failed')

      const extractRes = await fetch('/api/session/extract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId, messages }),
      })
      if (!extractRes.ok) throw new Error('Extraction failed')

      router.push('/dashboard')
    } catch (err) {
      console.error('End session error:', err)
    } finally {
      setIsSaving(false)
    }
  }

  // ── Send message ─────────────────────────────────────────────────────────────

  const handleSend = async () => {
    const trimmed = input.trim()
    if (!trimmed || isLoading) return

    const userMessage: Message = { role: 'user', content: trimmed }
    const nextMessages = [...messages, userMessage]

    setMessages(nextMessages)
    setInput('')
    setIsLoading(true)

    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
    }

    try {
      // Create session on first message of a new conversation
      let activeSessionId = sessionId
      if (!activeSessionId) {
        const newId = await ensureSession(mode)
        if (!newId) throw new Error('Could not create session')
        activeSessionId = newId
      }

      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: nextMessages, sessionId: activeSessionId, mode }),
      })

      if (!res.ok || !res.body) {
        throw new Error(`Chat request failed: ${res.status}`)
      }

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let assistantContent = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        assistantContent += decoder.decode(value, { stream: true })
        const content = assistantContent

        setMessages((prev) => {
          const last = prev[prev.length - 1]
          if (last?.role === 'assistant') {
            const updated = [...prev]
            updated[updated.length - 1] = { role: 'assistant', content }
            return updated
          }
          return [...prev, { role: 'assistant', content }]
        })
      }

      // Refresh sidebar after first message so the new session appears with its title
      if (nextMessages.length === 1) fetchSessions()
    } catch (err) {
      console.error('Chat error:', err)
      setMessages((prev) => {
        if (
          prev[prev.length - 1]?.role === 'assistant' &&
          prev[prev.length - 1].content === ''
        ) {
          return prev.slice(0, -1)
        }
        return prev
      })
    } finally {
      setIsLoading(false)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  const inputDisabled = isLoading || loadingSession

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <div className="flex h-dvh overflow-hidden bg-[#0a0a0f] text-zinc-100">

      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-20 bg-black/50 md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* ── Sidebar ── */}
      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-30 flex w-[260px] flex-col bg-[#111118]',
          'border-r border-zinc-800/60 transition-transform duration-200',
          'md:relative md:translate-x-0',
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        )}
      >
        {/* Sidebar top */}
        <div className="shrink-0 px-4 pt-4 pb-3 border-b border-zinc-800/40">
          <div className="flex items-center gap-2 mb-4">
            <Sparkles className="h-4 w-4 text-[#2E5BFF]" />
            <span className="text-sm font-semibold tracking-tight">AI Mentor</span>
          </div>
          <div className="flex flex-col gap-2">
            <button
              type="button"
              onClick={handleSmartCTA}
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
        </div>

        {/* Sessions list */}
        <div className="flex-1 overflow-y-auto py-3">
          {sessions.length > 0 && (
            <p className="px-4 pb-2 text-[10px] font-medium uppercase tracking-wider text-zinc-600">
              Recent
            </p>
          )}
          <ul className="flex flex-col gap-0.5 px-2">
            {sessions.map((s) => {
              const isActive = s.id === sessionId
              const title = s.first_message
                ? s.first_message.slice(0, 40) +
                  (s.first_message.length > 40 ? '…' : '')
                : 'New conversation'
              return (
                <li key={s.id}>
                  <button
                    type="button"
                    onClick={() => loadSession(s)}
                    className={cn(
                      'w-full rounded-lg px-3 py-2.5 text-left transition-colors',
                      'border-l-2',
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

        {/* Sidebar bottom — user */}
        <div className="shrink-0 border-t border-zinc-800/40 px-4 py-3">
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

      {/* ── Main area ── */}
      <div className="flex flex-1 flex-col min-w-0">

        {/* Header */}
        <header className="shrink-0 flex items-center justify-between border-b border-zinc-800/60 px-4 py-3">
          <div className="flex items-center gap-3">
            {/* Mobile hamburger */}
            <button
              type="button"
              onClick={() => setSidebarOpen((v) => !v)}
              className="md:hidden text-zinc-400 hover:text-zinc-200 transition-colors"
              aria-label="Toggle sidebar"
            >
              {sidebarOpen ? (
                <X className="h-5 w-5" />
              ) : (
                <Menu className="h-5 w-5" />
              )}
            </button>
            <h1 className="text-sm font-semibold tracking-tight text-zinc-100">
              {mode === 'debrief' ? 'Nightly Debrief' : 'Open Chat'}
            </h1>
          </div>

          <div className="flex items-center gap-3">
            {mode === 'debrief' &&
              messages.length >= 4 &&
              !isSaving &&
              !sessionSaved && (
                confirmEnd ? (
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-zinc-400">
                      Save this debrief?
                    </span>
                    <button
                      type="button"
                      onClick={handleEndSession}
                      className="rounded px-2.5 py-1 text-xs font-medium text-white bg-orange-600 hover:bg-orange-500 transition-colors"
                    >
                      Yes
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmEnd(false)}
                      className="rounded px-2.5 py-1 text-xs font-medium text-zinc-400 hover:text-zinc-200 transition-colors"
                    >
                      No
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setConfirmEnd(true)}
                    disabled={isLoading}
                    className="flex items-center gap-1.5 rounded-md border border-orange-700/60 px-2.5 py-1.5 text-xs font-medium text-orange-400 transition-colors hover:border-orange-600 hover:text-orange-300 disabled:opacity-40"
                  >
                    <Square className="h-3 w-3 fill-current" />
                    End Session
                  </button>
                )
              )}
            {isSaving && (
              <span className="text-xs text-zinc-500">Saving session…</span>
            )}
            {sessionSaved && (
              <span className="text-xs text-emerald-400">✓ Session saved</span>
            )}
          </div>
        </header>

        {/* Messages */}
        <main className="flex-1 overflow-y-auto px-4 py-6">
          <div className="mx-auto flex max-w-2xl flex-col gap-4">
            {messages.length === 0 && !isLoading && !loadingSession && (
              <p className="text-center text-sm text-zinc-500 pt-8">
                {mode === 'debrief'
                  ? 'Ready for your nightly debrief. How did today go?'
                  : "What's on your mind?"}
              </p>
            )}

            {messages.map((msg, index) => (
              <div
                key={`${msg.role}-${index}`}
                className={cn(
                  'flex',
                  msg.role === 'user' ? 'justify-end' : 'justify-start'
                )}
              >
                <div
                  className={cn(
                    'max-w-[85%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed',
                    msg.role === 'user'
                      ? 'bg-[#2E5BFF] text-white'
                      : 'border border-zinc-700/40 bg-[#1a1a2e] text-zinc-100'
                  )}
                >
                  {renderMarkdown(msg.content)}
                </div>
              </div>
            ))}

            {(isLoading || loadingSession) &&
              (messages.length === 0 ||
                messages[messages.length - 1]?.role === 'user') && (
                <TypingIndicator />
              )}

            <div ref={messagesEndRef} />
          </div>
        </main>

        {/* Input footer */}
        <footer className="shrink-0 border-t border-zinc-800/60 bg-[#0a0a0f] px-4 pb-4 pt-3">
          <div className="mx-auto max-w-2xl">
            {mode === 'debrief' && (
              <p className="mb-2 text-center text-xs text-zinc-600">
                Structured session — your mentor will guide tonight&apos;s
                debrief
              </p>
            )}
            <div className="flex items-end gap-2 rounded-xl border border-zinc-800/80 bg-zinc-900/50 p-2">
              <textarea
                ref={textareaRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={
                  mode === 'debrief'
                    ? 'Share how your day went...'
                    : 'Message your mentor...'
                }
                disabled={inputDisabled}
                rows={1}
                className={cn(
                  'flex-1 resize-none bg-transparent px-2 py-2 text-sm text-zinc-100',
                  'placeholder:text-zinc-600 outline-none leading-6',
                  'disabled:cursor-not-allowed disabled:opacity-50'
                )}
                style={{ maxHeight: LINE_HEIGHT_PX * MAX_TEXTAREA_LINES }}
              />
              <button
                type="button"
                onClick={handleSend}
                disabled={inputDisabled || !input.trim()}
                aria-label="Send message"
                className={cn(
                  'shrink-0 rounded-lg p-2.5 transition-colors',
                  'bg-[#2E5BFF] text-white hover:bg-[#2548d4]',
                  'disabled:cursor-not-allowed disabled:opacity-40'
                )}
              >
                <SendHorizontal className="h-4 w-4" />
              </button>
            </div>
          </div>
        </footer>
      </div>
    </div>
  )
}
