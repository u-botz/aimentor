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

  if (memory.name) lines.push(`User name: ${memory.name}`)

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
    return trimmed || fallback(mode, name)
  } catch (error) {
    console.error('generateOpener error:', error)
    return fallback(mode, name)
  }
}
