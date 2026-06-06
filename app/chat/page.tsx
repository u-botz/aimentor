'use client'

import ReactMarkdown from 'react-markdown'
import { Suspense, useCallback, useEffect, useRef, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import {
  SendHorizontal,
  Square,
  ChevronLeft,
  History,
  Sunrise,
  MessageCircle,
  Moon,
  X,
  AlertTriangle,
} from 'lucide-react'
import { cn } from '@/lib/utils'

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

const getISTHour = () => {
  const now = new Date()
  const ist = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }))
  return ist.getHours()
}

const getTodayISTDate = () =>
  new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' })

const isPastReminderTime = (reminderTime: string) => {
  const [h, m] = reminderTime.split(':').map(Number)
  const now = new Date()
  const ist = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }))
  return ist.getHours() * 60 + ist.getMinutes() >= h * 60 + m
}

const SESSION_LABELS: Record<SessionMode, string> = {
  open_chat: 'Open Chat',
  debrief:   'Nightly Debrief',
  morning:   'Morning Check-in',
}

const MODE_BADGE_STYLE: Record<SessionMode, string> = {
  open_chat: 'bg-[#0D9488]/20 text-[#0D9488]',
  debrief:   'bg-amber-400/20 text-amber-400',
  morning:   'bg-[#10B981]/20 text-[#10B981]',
}

// ─── localStorage helpers ─────────────────────────────────────────────────────

const LS_SESSION_KEY = 'ai_mentor_active_session'
const lsDraftKey = (sid: string) => `ai_mentor_draft_${sid}`

function lsSaveSession(id: string, mode: SessionMode) {
  try { localStorage.setItem(LS_SESSION_KEY, JSON.stringify({ id, mode })) } catch {}
}
function lsClearSession() {
  try { localStorage.removeItem(LS_SESSION_KEY) } catch {}
}
function lsGetSession(): { id: string; mode: SessionMode } | null {
  try {
    const raw = localStorage.getItem(LS_SESSION_KEY)
    if (!raw) return null
    return JSON.parse(raw) as { id: string; mode: SessionMode }
  } catch { return null }
}
function lsSaveDraft(sid: string, text: string) {
  try { localStorage.setItem(lsDraftKey(sid), text) } catch {}
}
function lsGetDraft(sid: string): string {
  try { return localStorage.getItem(lsDraftKey(sid)) ?? '' } catch { return '' }
}
function lsClearDraft(sid: string) {
  try { localStorage.removeItem(lsDraftKey(sid)) } catch {}
}

// ─────────────────────────────────────────────────────────────────────────────

const LINE_HEIGHT_PX = 24
const MAX_TEXTAREA_LINES = 4

// ─── Markdown message renderer ────────────────────────────────────────────────

function MarkdownMessage({ content }: { content: string }) {
  return (
    <ReactMarkdown
      components={{
        h1: ({ children }) => <h1 className="text-base font-bold mb-1 mt-2">{children}</h1>,
        h2: ({ children }) => <h2 className="text-base font-bold mb-1 mt-2">{children}</h2>,
        h3: ({ children }) => <h3 className="text-sm font-semibold mb-1 mt-2">{children}</h3>,
        p:  ({ children }) => <p className="mb-1 last:mb-0">{children}</p>,
        strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
        em: ({ children }) => <em className="italic">{children}</em>,
        ul: ({ children }) => <ul className="list-disc pl-4 mb-1 space-y-0.5">{children}</ul>,
        ol: ({ children }) => <ol className="list-decimal pl-4 mb-1 space-y-0.5">{children}</ol>,
        li: ({ children }) => <li className="leading-snug">{children}</li>,
        hr: () => <hr className="border-[#2A2A2A] my-2" />,
        code: ({ children }) => (
          <code className="bg-[#1E1E1E] px-1 rounded text-xs font-mono">{children}</code>
        ),
        pre: ({ children }) => (
          <pre className="bg-[#1E1E1E] p-2 rounded text-xs font-mono overflow-x-auto mb-1">{children}</pre>
        ),
      }}
    >
      {content}
    </ReactMarkdown>
  )
}

// ─── Typing indicator ─────────────────────────────────────────────────────────

function TypingIndicator() {
  return (
    <div className="flex justify-start">
      <div className="rounded-2xl border border-[#2A2A2A] bg-[#141414] px-4 py-3">
        <div className="flex gap-1.5">
          {[0, 1, 2].map((i) => (
            <span
              key={i}
              className="h-2 w-2 rounded-full bg-[#6B7280] animate-bounce"
              style={{ animationDelay: `${i * 150}ms` }}
            />
          ))}
        </div>
      </div>
    </div>
  )
}

// ─── Session picker bottom sheet ──────────────────────────────────────────────

function SessionPicker({
  onSelect,
  morningState,
}: {
  onSelect: (mode: SessionMode) => void
  morningState: boolean
}) {
  const hour = getISTHour()
  const isEvening = hour >= 18

  const options: {
    mode: SessionMode
    emoji: string
    title: string
    subtitle: string
    warning?: string
    morningOnly?: boolean
  }[] = [
    ...(morningState
      ? [
          {
            mode: 'morning' as SessionMode,
            emoji: '☀️',
            title: 'Morning Check-in',
            subtitle: 'Set your intention for today',
          },
        ]
      : []),
    {
      mode: 'open_chat',
      emoji: '💬',
      title: 'Open Chat',
      subtitle: 'Talk to your mentor about anything',
    },
    {
      mode: 'debrief',
      emoji: '🌙',
      title: 'Nightly Debrief',
      subtitle: 'Your daily structured check-in',
      warning: isEvening ? undefined : 'Works best in the evening',
    },
  ]

  return (
    <div className="fixed inset-0 z-[60] flex items-end">
      {/* Backdrop */}
      <div className="absolute inset-0 sheet-backdrop" />

      {/* Sheet */}
      <div className="animate-slide-up relative w-full rounded-t-3xl bg-[#141414] px-5 pt-3" style={{ paddingBottom: 'calc(24px + env(safe-area-inset-bottom))' }}>
        {/* Handle */}
        <div className="mx-auto mb-5 h-1 w-8 rounded-full bg-[#2A2A2A]" />
        <h2 className="mb-4 text-[16px] font-bold text-[#F5F5F5]">Start a session</h2>

        <div className="space-y-2.5">
          {options.map(({ mode, emoji, title, subtitle, warning }) => (
            <button
              key={mode}
              type="button"
              onClick={() => onSelect(mode)}
              className="flex w-full items-center gap-4 rounded-2xl border border-[#2A2A2A] bg-[#1E1E1E] p-4 text-left transition-all active:scale-[0.98] hover:border-[#3A3A3A]"
            >
              <span className="text-2xl">{emoji}</span>
              <div className="min-w-0 flex-1">
                <p className="text-[15px] font-semibold text-[#F5F5F5]">{title}</p>
                <p className="text-[13px] text-[#6B7280]">{subtitle}</p>
                {warning && (
                  <div className="mt-1 flex items-center gap-1 text-[11px] text-amber-400/70">
                    <AlertTriangle size={10} />
                    {warning}
                  </div>
                )}
              </div>
              <ChevronLeft size={16} className="shrink-0 rotate-180 text-[#6B7280]" />
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

// ─── History bottom sheet ─────────────────────────────────────────────────────

function HistorySheet({
  sessions,
  activeSessionId,
  onSelect,
  onClose,
}: {
  sessions: SessionSummary[]
  activeSessionId: string
  onSelect: (s: SessionSummary) => void
  onClose: () => void
}) {
  const groups: { label: string; items: SessionSummary[] }[] = []
  const today = getTodayISTDate()
  const todayStart = new Date(today)
  const weekAgo = new Date(todayStart)
  weekAgo.setDate(weekAgo.getDate() - 7)

  const todayItems = sessions.filter(
    (s) => s.created_at.slice(0, 10) === today
  )
  const weekItems = sessions.filter((s) => {
    const d = new Date(s.created_at)
    return d >= weekAgo && s.created_at.slice(0, 10) !== today
  })
  const olderItems = sessions.filter((s) => new Date(s.created_at) < weekAgo)

  if (todayItems.length) groups.push({ label: 'Today', items: todayItems })
  if (weekItems.length)  groups.push({ label: 'This week', items: weekItems })
  if (olderItems.length) groups.push({ label: 'Earlier', items: olderItems })

  const modeIcon = (mode: SessionMode) =>
    mode === 'debrief' ? '🌙' : mode === 'morning' ? '☀️' : '💬'

  return (
    <div className="fixed inset-0 z-[60] flex items-end">
      <div className="absolute inset-0 sheet-backdrop" onClick={onClose} />
      <div className="animate-slide-up relative w-full max-h-[75vh] rounded-t-3xl bg-[#141414] flex flex-col">
        {/* Handle + header */}
        <div className="px-5 pt-3">
          <div className="mx-auto mb-4 h-1 w-8 rounded-full bg-[#2A2A2A]" />
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-[16px] font-bold text-[#F5F5F5]">Past sessions</h2>
            <button
              type="button"
              onClick={onClose}
              className="text-[#6B7280] hover:text-[#F5F5F5]"
            >
              <X size={20} />
            </button>
          </div>
        </div>

        {/* Session list */}
        <div className="flex-1 overflow-y-auto px-5" style={{ paddingBottom: 'calc(16px + env(safe-area-inset-bottom))' }}>
          {groups.length === 0 ? (
            <p className="py-8 text-center text-[14px] text-[#6B7280]">
              No past sessions yet.
            </p>
          ) : (
            groups.map(({ label, items }) => (
              <div key={label} className="mb-4">
                <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-[#6B7280]">
                  {label}
                </p>
                <div className="space-y-1.5">
                  {items.map((s) => {
                    const isActive = s.id === activeSessionId
                    const dateStr = new Date(s.created_at).toLocaleDateString('en-US', {
                      month: 'short',
                      day: 'numeric',
                    })
                    return (
                      <button
                        key={s.id}
                        type="button"
                        onClick={() => { onSelect(s); onClose() }}
                        className={cn(
                          'flex w-full items-center gap-3 rounded-xl border p-3 text-left transition-all',
                          isActive
                            ? 'border-amber-400/30 bg-[rgba(245,158,11,0.08)]'
                            : 'border-[#2A2A2A] bg-[#1E1E1E] hover:border-[#3A3A3A]'
                        )}
                      >
                        <span className="text-xl">{modeIcon(s.mode)}</span>
                        <div className="min-w-0 flex-1">
                          <p className="text-[13px] font-medium text-[#F5F5F5]">
                            {SESSION_LABELS[s.mode]}
                          </p>
                          <p className="truncate text-[12px] text-[#6B7280]">
                            {dateStr}
                            {s.first_message
                              ? ` · ${s.first_message.slice(0, 40)}${s.first_message.length > 40 ? '…' : ''}`
                              : ''}
                          </p>
                        </div>
                      </button>
                    )
                  })}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Chat page ────────────────────────────────────────────────────────────────

function ChatPage() {
  const router = useRouter()
  const searchParams = useSearchParams()

  const [messages, setMessages] = useState<Message[]>([])
  const [sessionId, setSessionId] = useState('')
  const [mode, setMode] = useState<SessionMode>(() => {
    const m = searchParams.get('mode')
    if (m === 'debrief') return 'debrief'
    if (m === 'morning') return 'morning'
    return 'open_chat'
  })
  const [isLoading, setIsLoading] = useState(false)
  const [input, setInput] = useState('')
  const [isFirstSession, setIsFirstSession] = useState(false)

  const [openerText, setOpenerText] = useState<string | null>(null)
  const [openerLoading, setOpenerLoading] = useState(false)

  const [sessionSaved, setSessionSaved] = useState(false)
  const [confirmEnd, setConfirmEnd] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [saveError, setSaveError] = useState(false)

  const [sessions, setSessions] = useState<SessionSummary[]>([])
  const [loadingSession, setLoadingSession] = useState(false)
  const [hasDebriefedToday, setHasDebriefedToday] = useState(false)
  const [reminderTime, setReminderTime] = useState<string | null>(null)
  const [isDebriefTime, setIsDebriefTime] = useState(false)

  // UI state for bottom sheets
  const [showPicker, setShowPicker] = useState(false)
  const [showHistory, setShowHistory] = useState(false)

  const sessionParam = searchParams.get('session')
  const modeParam = searchParams.get('mode')

  const messagesEndRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const openerRequestIdRef = useRef(0)

  // Document title
  useEffect(() => {
    document.title = SESSION_LABELS[mode]
  }, [mode])

  // Scroll to bottom
  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [])
  useEffect(() => {
    scrollToBottom()
  }, [messages, isLoading, openerText, openerLoading, scrollToBottom])

  // Fetch sessions list
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
      console.error('Sessions fetch error:', err)
    }
  }, [])

  // Reminder time auto-refresh
  useEffect(() => {
    if (!reminderTime) return
    setIsDebriefTime(isPastReminderTime(reminderTime))
    const [rH, rM] = reminderTime.split(':').map(Number)
    const now = new Date()
    const ist = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }))
    const target = new Date(ist)
    target.setHours(rH, rM, 0, 0)
    if (ist >= target) target.setDate(target.getDate() + 1)
    const timer = setTimeout(() => setIsDebriefTime(true), target.getTime() - ist.getTime())
    return () => clearTimeout(timer)
  }, [reminderTime])

  // Init — sync user, check onboarding, then decide: restore session / load opener / show picker
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
          if (!profile.onboarded) { router.replace('/onboarding'); return }
          if (profile.reminder_time) setReminderTime(profile.reminder_time)
        }
        if (cancelled) return
        fetchSessions()

        // URL param ?session= handled by the separate session-param effect
        if (sessionParam) return

        // URL param ?mode= — opener loading effect handles it when showPicker=false
        if (modeParam) return

        // Check for active session in localStorage
        const saved = lsGetSession()
        if (saved) {
          restoreSession(saved.id, saved.mode)
          return
        }

        // No active session — show the picker
        setShowPicker(true)
      } catch (err) {
        console.error('Init error:', err)
      }
    }
    initialize()
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router, fetchSessions])

  // Textarea auto-resize
  const resizeTextarea = useCallback(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, LINE_HEIGHT_PX * MAX_TEXTAREA_LINES)}px`
  }, [])
  useEffect(() => { resizeTextarea() }, [input, resizeTextarea])

  // Restore session from localStorage
  const restoreSession = useCallback(async (id: string, savedMode: SessionMode) => {
    setLoadingSession(true)
    openerRequestIdRef.current++
    try {
      const res = await fetch(`/api/sessions/${id}/messages`)
      if (!res.ok) throw new Error('Failed to restore session')
      const data = (await res.json()) as { role: MessageRole; content: string }[]
      setMessages(data.map((m) => ({ role: m.role, content: m.content })))
      setSessionId(id)
      setMode(savedMode)
      setShowPicker(false)
      const draft = lsGetDraft(id)
      if (draft) setInput(draft)
    } catch (err) {
      console.error('Restore session error:', err)
      lsClearSession()
      setShowPicker(true)
    } finally {
      setLoadingSession(false)
    }
  }, [])

  // Load opener
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
      console.error('Opener error (non-fatal):', err)
    } finally {
      if (requestId === openerRequestIdRef.current) setOpenerLoading(false)
    }
  }, [])

  // Create new session (in-place)
  const createNewSession = useCallback(
    (newMode: SessionMode) => {
      lsClearSession()
      lsClearDraft(sessionId)
      setSessionId('')
      setMode(newMode)
      setMessages([])
      setInput('')
      setSessionSaved(false)
      setConfirmEnd(false)
      setShowPicker(false)
      setShowHistory(false)
      setOpenerText(null)
      void loadOpener(newMode)
    },
    [loadOpener, sessionId]
  )

  // Handle session picker selection
  const handlePickerSelect = useCallback(
    (selectedMode: SessionMode) => {
      lsClearSession()
      setShowPicker(false)
      setMode(selectedMode)
      setOpenerText(null)
      openerRequestIdRef.current++
      void loadOpener(selectedMode)
    },
    [loadOpener]
  )

  // Load opener when a mode is active and no messages exist yet
  const sessionParamRef = useRef(sessionParam)
  useEffect(() => {
    if (sessionParamRef.current) return // handled by session-param effect
    if (sessionId) return
    if (messages.length > 0) return
    if (showPicker) return // wait until picker is dismissed
    void loadOpener(mode)
    return () => { openerRequestIdRef.current++ }
  }, [mode, sessionId, messages.length, showPicker, loadOpener])

  // Draft auto-save: debounce 600ms, keyed by sessionId
  useEffect(() => {
    if (!sessionId) return
    const timer = setTimeout(() => {
      if (input) {
        lsSaveDraft(sessionId, input)
      } else {
        lsClearDraft(sessionId)
      }
    }, 600)
    return () => clearTimeout(timer)
  }, [input, sessionId])

  // Ensure DB session row
  const ensureSession = useCallback(
    async (currentMode: SessionMode): Promise<{ id: string; isFirst: boolean } | null> => {
      try {
        const res = await fetch('/api/session/create', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ mode: currentMode }),
        })
        if (!res.ok) throw new Error('Session creation failed')
        const { sessionId: id, isFirstSession: isFirst = false } = (await res.json()) as {
          sessionId: string
          isFirstSession?: boolean
        }
        setSessionId(id)
        setIsFirstSession(isFirst)
        lsSaveSession(id, currentMode)
        return { id, isFirst }
      } catch (err) {
        console.error('Session create error:', err)
        return null
      }
    },
    []
  )

  // Load historical session
  const loadSession = useCallback(
    async (s: SessionSummary) => {
      if (s.id === sessionId) return
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
        lsSaveSession(s.id, s.mode)
        const draft = lsGetDraft(s.id)
        if (draft) setInput(draft)
      } catch (err) {
        console.error('Load session error:', err)
      } finally {
        setLoadingSession(false)
      }
    },
    [sessionId]
  )

  // Open session from URL param
  const appliedSessionParamRef = useRef<string | null>(null)
  useEffect(() => {
    if (!sessionParam || sessionParam === sessionId || sessionParam === appliedSessionParamRef.current) return
    const summary = sessions.find((s) => s.id === sessionParam)
    if (summary) {
      appliedSessionParamRef.current = sessionParam
      loadSession(summary)
    }
  }, [sessionParam, sessions, sessionId, loadSession])

  // End session
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
      lsClearSession()
      lsClearDraft(sessionId)
      router.push('/home')
    } catch (err) {
      console.error('End session error:', err)
      setSaveError(true)
    } finally {
      setIsSaving(false)
    }
  }

  // Send message
  const handleSend = async () => {
    const trimmed = input.trim()
    if (!trimmed || isLoading) return

    const userMessage: Message = { role: 'user', content: trimmed }
    const currentOpener = openerText
    const isNewSession = !sessionId

    const nextMessages: Message[] = currentOpener
      ? [{ role: 'assistant', content: currentOpener }, userMessage]
      : [...messages, userMessage]

    setMessages(nextMessages)
    if (currentOpener) setOpenerText(null)
    setInput('')
    if (sessionId) lsClearDraft(sessionId)
    setIsLoading(true)

    if (textareaRef.current) textareaRef.current.style.height = 'auto'

    try {
      let activeSessionId = sessionId
      let firstSession = false
      if (!activeSessionId) {
        const created = await ensureSession(mode)
        if (!created) throw new Error('Could not create session')
        activeSessionId = created.id
        firstSession = created.isFirst
        fetchSessions()
      }

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
        body: JSON.stringify({
          messages: nextMessages,
          sessionId: activeSessionId,
          mode,
          isFirstSession: firstSession,
        }),
      })

      if (!res.ok || !res.body) throw new Error(`Chat request failed: ${res.status}`)

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

      if (isNewSession) fetchSessions()
    } catch (err) {
      console.error('Chat error:', err)
      setMessages((prev) => {
        if (prev[prev.length - 1]?.role === 'assistant' && prev[prev.length - 1].content === '') {
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

  // Morning state = before noon
  const isMorningState = getISTHour() < 12

  // ─── Render ─────────────────────────────────────────────────────────────────

  return (
    <div
      className="flex flex-col bg-[#0A0A0A] text-[#F5F5F5]"
      style={{ height: 'calc(100dvh - 64px)' }}
    >
      {/* ── Top bar ───────────────────────────────────────────────────────── */}
      <header className="shrink-0 flex items-center justify-between border-b border-[#2A2A2A] bg-[#0A0A0A] px-4 py-3">
        {/* Left: back arrow */}
        <button
          type="button"
          onClick={() => router.push('/home')}
          className="flex h-9 w-9 items-center justify-center rounded-xl text-[#6B7280] hover:text-[#F5F5F5] transition-colors"
          aria-label="Back"
        >
          <ChevronLeft size={22} />
        </button>

        {/* Center: title + mode badge */}
        <div className="flex flex-col items-center gap-1">
          <span className="text-[14px] font-semibold text-[#F5F5F5]">
            {SESSION_LABELS[mode]}
          </span>
          <span
            className={cn(
              'rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide',
              MODE_BADGE_STYLE[mode]
            )}
          >
            {mode === 'open_chat' ? 'OPEN' : mode === 'debrief' ? 'DEBRIEF' : 'MORNING'}
          </span>
        </div>

        {/* Right: end session + history */}
        <div className="flex items-center gap-2">
          {/* End session controls */}
          {mode === 'debrief' && messages.length >= 4 && !isSaving && !sessionSaved && (
            confirmEnd ? (
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={handleEndSession}
                  className="rounded-lg bg-amber-400 px-2.5 py-1 text-[11px] font-semibold text-black"
                >
                  Save
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmEnd(false)}
                  className="rounded-lg border border-[#2A2A2A] px-2 py-1 text-[11px] text-[#6B7280]"
                >
                  No
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setConfirmEnd(true)}
                disabled={isLoading}
                className="flex items-center gap-1 rounded-lg border border-amber-400/30 px-2.5 py-1.5 text-[11px] font-medium text-amber-400 disabled:opacity-40"
              >
                <Square size={10} className="fill-current" />
                End
              </button>
            )
          )}
          {isSaving && <span className="text-[11px] text-[#6B7280]">Saving…</span>}
          {sessionSaved && <span className="text-[11px] text-[#10B981]">✓ Saved</span>}
          {saveError && (
            <button
              type="button"
              onClick={handleEndSession}
              className="text-[11px] text-[#EF4444] underline"
            >
              Retry
            </button>
          )}

          {/* History icon */}
          <button
            type="button"
            onClick={() => setShowHistory(true)}
            className="flex h-9 w-9 items-center justify-center rounded-xl text-[#6B7280] hover:text-[#F5F5F5] transition-colors"
            aria-label="Session history"
          >
            <History size={18} />
          </button>
        </div>
      </header>

      {/* ── Messages ──────────────────────────────────────────────────────── */}
      <main className="flex-1 overflow-y-auto px-4 py-5">
        <div className="mx-auto flex max-w-2xl flex-col gap-3">
          {/* Lazy opener */}
          {messages.length === 0 && openerText && (
            <div className="flex justify-start">
              <div className="max-w-[85%] rounded-2xl border border-[#2A2A2A] bg-[#141414] px-4 py-2.5 text-sm leading-relaxed text-[#F5F5F5]">
                <MarkdownMessage content={openerText} />
              </div>
            </div>
          )}

          {messages.map((msg, index) => (
            <div
              key={`${msg.role}-${index}`}
              className={cn('flex', msg.role === 'user' ? 'justify-end' : 'justify-start')}
            >
              <div
                className={cn(
                  'max-w-[85%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed',
                  msg.role === 'user'
                    ? 'bg-amber-400 text-black'
                    : 'border border-[#2A2A2A] bg-[#141414] text-[#F5F5F5]'
                )}
              >
                <MarkdownMessage content={msg.content} />
              </div>
            </div>
          ))}

          {(isLoading || loadingSession || openerLoading) &&
            (messages.length === 0 || messages[messages.length - 1]?.role === 'user') && (
              <TypingIndicator />
            )}

          <div ref={messagesEndRef} />
        </div>
      </main>

      {/* ── Input footer ──────────────────────────────────────────────────── */}
      <footer className="shrink-0 border-t border-[#2A2A2A] bg-[#0A0A0A] px-4 pb-3 pt-2">
        <div className="mx-auto max-w-2xl">
          {(mode === 'debrief' || mode === 'morning') && (
            <p className="mb-1.5 text-center text-[11px] text-[#6B7280]/60">
              {mode === 'debrief'
                ? 'Structured session — your mentor will guide tonight’s debrief'
                : 'Morning planning — keep it short and focused'}
            </p>
          )}
          <div className="flex items-end gap-2 rounded-2xl border border-[#2A2A2A] bg-[#141414] p-2">
            <textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={
                mode === 'debrief'
                  ? 'Share how your day went…'
                  : mode === 'morning'
                    ? "What's on your mind this morning…"
                    : 'Message your mentor…'
              }
              disabled={inputDisabled}
              rows={1}
              className={cn(
                'flex-1 resize-none bg-transparent px-2 py-2 text-sm text-[#F5F5F5]',
                'placeholder:text-[#6B7280] outline-none leading-6',
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
                'shrink-0 rounded-xl p-2.5 transition-all',
                'bg-amber-400 text-black',
                'disabled:cursor-not-allowed disabled:opacity-30'
              )}
            >
              <SendHorizontal size={16} />
            </button>
          </div>
        </div>
      </footer>

      {/* ── Session picker overlay ────────────────────────────────────────── */}
      {showPicker && (
        <SessionPicker
          onSelect={handlePickerSelect}
          morningState={isMorningState}
        />
      )}

      {/* ── History bottom sheet ──────────────────────────────────────────── */}
      {showHistory && (
        <HistorySheet
          sessions={sessions}
          activeSessionId={sessionId}
          onSelect={loadSession}
          onClose={() => setShowHistory(false)}
        />
      )}
    </div>
  )
}

export default function ChatPageWrapper() {
  return (
    <Suspense
      fallback={
        <div
          className="flex items-center justify-center bg-[#0A0A0A] text-[#6B7280]"
          style={{ height: 'calc(100dvh - 64px)' }}
        >
          Loading…
        </div>
      }
    >
      <ChatPage />
    </Suspense>
  )
}
