'use client'

import ReactMarkdown from 'react-markdown'
import { Suspense, useCallback, useEffect, useRef, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { SendHorizontal, Square, Menu, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { AppSidebar } from '@/components/AppSidebar'

type MessageRole = 'user' | 'assistant'
type SessionMode = 'open_chat' | 'debrief' | 'morning'

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

function MarkdownMessage({ content }: { content: string }) {
  return (
    <ReactMarkdown
      components={{
        h1: ({ children }) => <h1 className="text-base font-bold mb-1 mt-2">{children}</h1>,
        h2: ({ children }) => <h2 className="text-base font-bold mb-1 mt-2">{children}</h2>,
        h3: ({ children }) => <h3 className="text-sm font-semibold mb-1 mt-2">{children}</h3>,
        p: ({ children }) => <p className="mb-1 last:mb-0">{children}</p>,
        strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
        em: ({ children }) => <em className="italic">{children}</em>,
        ul: ({ children }) => <ul className="list-disc pl-4 mb-1 space-y-0.5">{children}</ul>,
        ol: ({ children }) => <ol className="list-decimal pl-4 mb-1 space-y-0.5">{children}</ol>,
        li: ({ children }) => <li className="leading-snug">{children}</li>,
        hr: () => <hr className="border-zinc-600 my-2" />,
        code: ({ children }) => <code className="bg-zinc-800 px-1 rounded text-xs font-mono">{children}</code>,
        pre: ({ children }) => <pre className="bg-zinc-800 p-2 rounded text-xs font-mono overflow-x-auto mb-1">{children}</pre>,
      }}
    >
      {content}
    </ReactMarkdown>
  )
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

function ChatPage() {
  const router = useRouter()
  const searchParams = useSearchParams()

  // Chat state
  const [messages, setMessages] = useState<Message[]>([])
  const [sessionId, setSessionId] = useState('')
  // Honor ?mode= from push notifications and dashboard CTAs.
  const [mode, setMode] = useState<SessionMode>(() => {
    const m = searchParams.get('mode')
    if (m === 'debrief') return 'debrief'
    if (m === 'morning') return 'morning'
    return 'open_chat'
  })
  const [isLoading, setIsLoading] = useState(false)
  const [input, setInput] = useState('')
  const [isFirstSession, setIsFirstSession] = useState(false)

  // Lazy opener — mentor's first line, shown before any DB session is created.
  // Kept separate from messages[] so it isn't double-sent when the user replies.
  const [openerText, setOpenerText] = useState<string | null>(null)
  const [openerLoading, setOpenerLoading] = useState(false)

  // End session state
  const [sessionSaved, setSessionSaved] = useState(false)
  const [confirmEnd, setConfirmEnd] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [saveError, setSaveError] = useState(false)

  // Sidebar state
  const [sessions, setSessions] = useState<SessionSummary[]>([])
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [loadingSession, setLoadingSession] = useState(false)
  const [hasDebriefedToday, setHasDebriefedToday] = useState(false)
  const [reminderTime, setReminderTime] = useState<string | null>(null)
  const [isDebriefTime, setIsDebriefTime] = useState(false)

  const messagesEndRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  // Bumps on cleanup or new chat so stale opener fetches are ignored (incl. Strict Mode).
  const openerRequestIdRef = useRef(0)

  // ── Document title ───────────────────────────────────────────────────────────

  useEffect(() => {
    document.title =
      mode === 'debrief' ? 'Nightly Debrief'
      : mode === 'morning' ? 'Morning Planning'
      : 'Open Chat'
  }, [mode])

  // ── Scroll ──────────────────────────────────────────────────────────────────

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [])

  useEffect(() => {
    scrollToBottom()
  }, [messages, isLoading, openerText, openerLoading, scrollToBottom])

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

  const loadOpener = useCallback(async (sessionMode: SessionMode) => {
    const requestId = ++openerRequestIdRef.current
    setOpenerLoading(true)
    try {
      const res = await fetch('/api/opener', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: sessionMode }),
      })
      if (!res.ok) throw new Error(`Opener fetch failed: ${res.status}`)
      const { opener } = (await res.json()) as { opener: string }
      if (requestId !== openerRequestIdRef.current) return
      if (opener?.trim()) setOpenerText(opener.trim())
    } catch (err) {
      console.error('Opener fetch error (non-fatal):', err)
    } finally {
      if (requestId === openerRequestIdRef.current) setOpenerLoading(false)
    }
  }, [])

  const createNewSession = useCallback((newMode: SessionMode) => {
    setSessionId('')
    setMode(newMode)
    setMessages([])
    setInput('')
    setSessionSaved(false)
    setConfirmEnd(false)
    setSidebarOpen(false)
    setOpenerText(null)
    void loadOpener(newMode)
  }, [loadOpener])

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

  const ensureSession = useCallback(async (currentMode: SessionMode): Promise<{ id: string; isFirst: boolean } | null> => {
    try {
      const res = await fetch('/api/session/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: currentMode }),
      })
      if (!res.ok) throw new Error('Session creation failed')
      const { sessionId: id, isFirstSession: isFirst = false } = (await res.json()) as { sessionId: string; isFirstSession?: boolean }
      setSessionId(id)
      setIsFirstSession(isFirst)
      return { id, isFirst }
    } catch (err) {
      console.error('Session creation error:', err)
      return null
    }
  }, [])

  // ── Session param — must be declared before any effect that reads it ────────
  const sessionParam = searchParams.get('session')
  const appliedSessionParamRef = useRef<string | null>(null)

  // ── Lazy opener — fetch the mentor's first line without creating a session ────
  // POSTs to /api/opener which calls generateOpener() and returns { opener }.
  // No session is created here; no messages are saved. The opener is held in
  // openerText state and merged into messages[] only when the user replies.

  useEffect(() => {
    if (sessionParam) return
    if (sessionId) return
    if (messages.length > 0) return
    void loadOpener(mode)
    return () => {
      openerRequestIdRef.current++
    }
  }, [mode, sessionParam, sessionId, messages.length, loadOpener])

  // ── Load historical session ──────────────────────────────────────────────────

  const loadSession = useCallback(async (s: SessionSummary) => {
    if (s.id === sessionId) { setSidebarOpen(false); return }
    setLoadingSession(true)
    setOpenerText(null)
    openerRequestIdRef.current++
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

  // ── Open a session linked from another page (/chat?session=<id>) ──────────────

  useEffect(() => {
    if (
      !sessionParam ||
      sessionParam === sessionId ||
      sessionParam === appliedSessionParamRef.current
    )
      return
    const summary = sessions.find((s) => s.id === sessionParam)
    if (summary) {
      appliedSessionParamRef.current = sessionParam
      loadSession(summary)
    }
  }, [sessionParam, sessions, sessionId, loadSession])

  // ── End debrief session ──────────────────────────────────────────────────────

  const handleEndSession = async () => {
    if (!sessionId) return
    setIsSaving(true)
    setConfirmEnd(false)
    setSaveError(false)
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

      setSessionSaved(true)
      router.push('/dashboard')
    } catch (err) {
      console.error('End session error:', err)
      setSaveError(true)
    } finally {
      setIsSaving(false)
    }
  }

  // ── Send message ─────────────────────────────────────────────────────────────

  const handleSend = async () => {
    const trimmed = input.trim()
    if (!trimmed || isLoading) return

    const userMessage: Message = { role: 'user', content: trimmed }

    // ── First-send opener merge ───────────────────────────────────────────────
    // If openerText is set, the user is replying to the lazy opener for the
    // first time. We merge it as the leading assistant turn so:
    //   1. The UI shows the full thread (opener → user reply → mentor response).
    //   2. /api/chat receives real conversation context instead of an empty array
    //      + the synthetic withLeadingUser nudge.
    // Capture before clearing — once it moves into messages[] it must not fire again.
    const currentOpener = openerText
    const isNewSession = !sessionId

    const nextMessages: Message[] = currentOpener
      ? [{ role: 'assistant', content: currentOpener }, userMessage]
      : [...messages, userMessage]

    setMessages(nextMessages)
    if (currentOpener) setOpenerText(null) // opener is now in messages[]; clear UI state
    setInput('')
    setIsLoading(true)

    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
    }

    try {
      // Create the DB session row on the very first user send.
      // Nothing was written to the DB before this point — a glance-and-close
      // leaves no sessions and no messages rows.
      let activeSessionId = sessionId
      let firstSession = false
      if (!activeSessionId) {
        const created = await ensureSession(mode)
        if (!created) throw new Error('Could not create session')
        activeSessionId = created.id
        firstSession = created.isFirst
        fetchSessions()
      }

      // ── Persist the opener as the first DB row ────────────────────────────
      // Save opener BEFORE calling /api/chat so the messages table order is:
      //   assistant (opener) → user (reply) → assistant (new response)
      // /api/chat saves the user message at the very start of the request, so
      // we must await this call first to guarantee ordering.
      // /api/messages/save is a thin endpoint (built separately); if it 404s or
      // fails for any reason the chat still works — the opener just won't be in
      // DB history for that session.
      if (currentOpener) {
        try {
          await fetch('/api/messages/save', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              sessionId: activeSessionId,
              role: 'assistant',
              content: currentOpener,
            }),
          })
        } catch (saveErr) {
          console.warn('Opener DB save failed (non-fatal):', saveErr)
        }
      }

      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: nextMessages, sessionId: activeSessionId, mode, isFirstSession: firstSession }),
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

      // Refresh sidebar once after the first real exchange so the session title
      // appears. Use isNewSession (captured before ensureSession) — nextMessages
      // length is unreliable here because it includes the opener when present.
      if (isNewSession) fetchSessions()
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

      <AppSidebar
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        sessions={sessions}
        activeSessionId={sessionId}
        onSelectSession={loadSession}
        onDeleteSession={(id) => {
          setSessions((prev) => prev.filter((s) => s.id !== id))
          if (id === sessionId) createNewSession('open_chat')
        }}
        onNewChat={handleSmartCTA}
        hasDebriefedToday={hasDebriefedToday}
        isDebriefTime={isDebriefTime}
      />

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
              {mode === 'debrief' ? 'Nightly Debrief'
                : mode === 'morning' ? 'Morning Planning'
                : 'Open Chat'}
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
            {saveError && (
              <button
                type="button"
                onClick={handleEndSession}
                className="text-xs text-red-400 hover:text-red-300 underline underline-offset-2"
              >
                Save failed — tap to retry
              </button>
            )}
          </div>
        </header>

        {/* Messages */}
        <main className="flex-1 overflow-y-auto px-4 py-6">
          <div className="mx-auto flex max-w-2xl flex-col gap-4">
            {/* Lazy opener — shown as a real assistant bubble before any session
                is created. Replaced by the same content inside messages[] on
                the first user send, so it never appears twice. */}
            {messages.length === 0 && openerText && (
              <div className="flex justify-start">
                <div className="max-w-[85%] rounded-2xl border border-zinc-700/40 bg-[#1a1a2e] px-4 py-2.5 text-sm leading-relaxed text-zinc-100">
                  <MarkdownMessage content={openerText} />
                </div>
              </div>
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
                  <MarkdownMessage content={msg.content} />
                </div>
              </div>
            ))}

            {(isLoading || loadingSession || openerLoading) &&
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
            {(mode === 'debrief' || mode === 'morning') && (
              <p className="mb-2 text-center text-xs text-zinc-600">
                {mode === 'debrief'
                  ? "Structured session — your mentor will guide tonight\u2019s debrief"
                  : 'Morning planning — keep it short and focused'}
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
                    : mode === 'morning'
                      ? "What's on your mind this morning..."
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

export default function ChatPageWrapper() {
  return (
    <Suspense
      fallback={
        <div className="flex h-dvh items-center justify-center bg-[#0a0a0f] text-zinc-500">
          Loading…
        </div>
      }
    >
      <ChatPage />
    </Suspense>
  )
}
