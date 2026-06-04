import { BASE_MENTOR_PROMPT } from './layer1-base'
import { buildUserLayer, type UserProfile } from './layer2-user'
import {
  buildMemoryLayer,
  type UserMemory,
  type OpenCommitment,
  type LastSession,
} from './layer3-memory'
import { OPEN_CHAT_PROMPT, buildDebriefPrompt, MORNING_MODE_PROMPT } from './layer4-mode'

export type SessionMode = 'open_chat' | 'debrief' | 'morning'

export type PromptContext = {
  user: UserProfile
  memory: UserMemory
  lastSession: LastSession | null
  openCommitments: OpenCommitment[]
  mode: SessionMode
}

// A content block as the Anthropic SDK expects it for the `system` field.
// `cache_control` marks a prefix boundary — everything up to and including this
// block is eligible for prompt-cache reuse on subsequent turns.
export type SystemBlock = {
  type: 'text'
  text: string
  cache_control?: { type: 'ephemeral' }
}

export function assembleSystemPrompt(ctx: PromptContext): SystemBlock[] {
  const now = new Date().toLocaleString('en-IN', {
    timeZone: 'Asia/Kolkata',
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  })
  const timeContext = `CURRENT TIME: ${now} IST`

  const layer1 = BASE_MENTOR_PROMPT
  const layer2 = buildUserLayer(ctx.user)
  const layer3 = buildMemoryLayer(ctx.memory, ctx.lastSession, ctx.openCommitments)
  const layer4 =
    ctx.mode === 'debrief' ? buildDebriefPrompt(ctx.user.tracked_domains ?? [])
    : ctx.mode === 'morning' ? MORNING_MODE_PROMPT
    : OPEN_CHAT_PROMPT

  return [
    // ── Block 1: L1 character ─────────────────────────────────────────────────
    // Identical for every user and every session — the deepest cache boundary.
    // Marking it means the ~650-token character definition is never re-processed
    // after the first call that warms the cache.
    {
      type: 'text',
      text: layer1,
      cache_control: { type: 'ephemeral' },
    },

    // ── Block 2: L2 user profile ──────────────────────────────────────────────
    // User-specific but only changes when the user edits their profile (rare).
    // Caching here gives a per-user hit on every turn of every session until the
    // profile changes. Together with Block 1 this covers ~850 stable tokens.
    {
      type: 'text',
      text: layer2,
      cache_control: { type: 'ephemeral' },
    },

    // ── Block 3: L3 memory + L4 mode + current time ───────────────────────────
    // Memory refreshes every ~3 days; mode changes per session; time changes
    // every minute. Putting volatile content LAST means it can never break the
    // stable prefix cache. No cache_control — let Blocks 1+2 carry the savings.
    {
      type: 'text',
      text: [layer3, layer4, timeContext].join('\n\n---\n\n'),
    },
  ]
}
