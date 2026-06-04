import { streamChat, resolveModel } from '@/lib/model-router'
import { fetchMemoryContext } from '@/lib/memory/fetch-context'
import { istDateString } from '@/lib/date'

type OpenerMode = 'open_chat' | 'debrief' | 'morning'

export type GenerateOpenerParams = {
  userId: string
  mode: OpenerMode
}

// ── Fallbacks ─────────────────────────────────────────────────────────────────
// Interpolate name; drop gracefully when absent.

function withName(template: string, name: string): string {
  if (!name) return template.replace(/,?\s*\{name\}/g, '')
  return template.replace('{name}', name)
}

const FALLBACK_TEMPLATES: Record<OpenerMode, string> = {
  open_chat: 'Hey {name}. What\'s on your mind?',
  morning:   'Morning, {name}. What\'s the one thing today\'s about?',
  debrief:   'Let\'s get into it, {name}. How did today actually go?',
}

function fallback(mode: OpenerMode, name: string): string {
  return withName(FALLBACK_TEMPLATES[mode], name)
}

// ── System prompt ─────────────────────────────────────────────────────────────

const SYSTEM_PROMPT =
  'You are a personal mentor opening a conversation — you speak first, before ' +
  'the user types. Direct, warm, never fluffy. 1–2 sentences only. End with ' +
  'exactly one question. No emoji. Reference one real thing from memory only if ' +
  'it is genuinely notable; otherwise a simple present check-in is right. ' +
  'If a "User name:" is given in the context, address them by THAT name and no ' +
  'other. Never use any other name. If no user name is given, do NOT use any ' +
  'name or invented name — open without a name (e.g. a direct "Welcome back" ' +
  'style). Never address the user by a name that is not explicitly provided as ' +
  '"User name:". Do not treat names appearing inside notes or patterns as the ' +
  "user's name. " +
  'Mode shapes your register: ' +
  'open_chat — light and present, personal if there is something worth naming; ' +
  'morning — open on the priority they set last night if one exists; ' +
  'debrief — lead straight in, no warm-up. ' +
  'Output ONLY the opener line. Nothing else.'

// ── Context note builder ──────────────────────────────────────────────────────
// Produces a compact plain-text briefing for the model. Omits null/empty fields
// so the prompt has no blank lines or "null" noise.

function buildContextNote(
  memory: Awaited<ReturnType<typeof fetchMemoryContext>>['memory'],
  lastSession: Awaited<ReturnType<typeof fetchMemoryContext>>['lastSession'],
  openCommitments: Awaited<ReturnType<typeof fetchMemoryContext>>['openCommitments'],
  mode: OpenerMode
): string {
  const today = istDateString()
  const lines: string[] = []

  const displayName = memory.name?.trim()
  if (displayName) {
    lines.push(`User name: ${displayName}`)
  } else {
    lines.push('User name: (unknown — do not use any name)')
  }

  // Last session carry-forward — the single most important thing from the
  // previous session. Always include when present; it's the richest signal.
  if (lastSession?.carry_forward) {
    lines.push(`Last session note: ${lastSession.carry_forward}`)
  }

  // Tomorrow's priority — most relevant for morning mode but useful in all.
  if (lastSession?.tomorrow_priority) {
    lines.push(`Priority they set last night: ${lastSession.tomorrow_priority}`)
  }

  // Single most relevant open commitment. Prefer overdue or due today;
  // otherwise take the most recent (commitments come back made_on desc).
  const urgentCommitment =
    openCommitments.find(
      (c) => c.due_date && c.due_date <= today
    ) ?? openCommitments[0] ?? null

  if (urgentCommitment) {
    const due = urgentCommitment.due_date
    const dueNote =
      due && due < today ? ` (overdue since ${due})`
      : due === today    ? ' (due today)'
      : due              ? ` (due ${due})`
      : ''
    lines.push(`Open commitment: "${urgentCommitment.commitment}"${dueNote}`)
  }

  // One identity pattern — only if there is exactly one or a clear short one
  // (avoids a wall of patterns diluting the briefing).
  const pattern = memory.identity_patterns[0] ?? null
  if (pattern) {
    lines.push(`Known pattern: ${pattern}`)
  }

  lines.push(`Session mode: ${mode}`)

  return lines.join('\n')
}

// ── Opener name guard ─────────────────────────────────────────────────────────
// Only inspects the opening vocative slot (Hey/Hi Name or Name, at line start).

function detectLeadingVocative(text: string): string | null {
  const heyHi = text.match(/^(?:Hey|Hi)\s+([A-Za-z][A-Za-z'-]*)\b/i)
  if (heyHi) return heyHi[1]

  const commaVocative = text.match(/^([A-Za-z][A-Za-z'-]*)\s*,/)
  if (commaVocative) return commaVocative[1]

  const beforeBreak = text.match(
    /^([A-Z][a-z][A-Za-z'-]*)\b(?=\s|[.,!?]|$)/
  )
  if (beforeBreak) return beforeBreak[1]

  return null
}

function namesMatch(leading: string, expected: string): boolean {
  const a = leading.trim().toLowerCase()
  const b = expected.trim().toLowerCase()
  if (a === b) return true
  const firstWord = b.split(/\s+/)[0]
  return firstWord.length > 0 && a === firstWord
}

function guardOpenerName(
  opener: string,
  expectedName: string,
  userId: string,
  mode: OpenerMode
): string {
  const expected = expectedName.trim()
  if (!expected) return opener

  try {
    const leading = detectLeadingVocative(opener.trim())
    if (!leading) return opener
    if (namesMatch(leading, expected)) return opener

    console.warn(
      `[generateOpener] Wrong leading name for user ${userId}: ` +
        `got "${leading}", expected "${expected}". Text: ${opener.trim()}`
    )
    return fallback(mode, expected)
  } catch {
    return fallback(mode, expected)
  }
}

// ── Main export ───────────────────────────────────────────────────────────────

export async function generateOpener(
  params: GenerateOpenerParams
): Promise<string> {
  const { userId, mode } = params

  // Fetch memory first so we have a name for the fallback regardless of what
  // happens during generation.
  let name = ''
  try {
    const { memory, lastSession, openCommitments } =
      await fetchMemoryContext(userId)

    name = memory.name ?? ''

    const contextNote = buildContextNote(
      memory,
      lastSession,
      openCommitments,
      mode
    )

    const userMessage =
      contextNote + '\n\nWrite the opening line now.'

    const model = resolveModel('fast')
    const stream = await streamChat(
      SYSTEM_PROMPT,
      [{ role: 'user', content: userMessage }],
      model,
      256
    )

    let text = ''
    for await (const chunk of stream) {
      if (
        chunk.type === 'content_block_delta' &&
        chunk.delta.type === 'text_delta'
      ) {
        text += chunk.delta.text
      }
    }

    const trimmed = text.trim()
    if (!trimmed) return fallback(mode, name)
    return guardOpenerName(trimmed, name, userId, mode)
  } catch (error) {
    console.error('generateOpener error:', error)
    return fallback(mode, name)
  }
}
