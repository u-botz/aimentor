import { BASE_MENTOR_PROMPT } from './layer1-base'
import { buildUserLayer, type UserProfile } from './layer2-user'
import {
  buildMemoryLayer,
  type UserMemory,
  type OpenCommitment,
  type LastSession,
} from './layer3-memory'
import { OPEN_CHAT_PROMPT, buildDebriefPrompt, MORNING_MODE_PROMPT, FIRST_SESSION_PROMPT } from './layer4-mode'
import { buildTimeContext, formatTimeContextForPrompt } from '@/lib/time-context'

export type SessionMode = 'open_chat' | 'debrief' | 'morning'

export type PromptContext = {
  userId: string
  reminderTime: string | null
  user: UserProfile
  memory: UserMemory
  lastSession: LastSession | null
  openCommitments: OpenCommitment[]
  mode: SessionMode
  isFirstSession?: boolean
}

// A content block as the Anthropic SDK expects it for the `system` field.
// `cache_control` marks a prefix boundary — everything up to and including this
// block is eligible for prompt-cache reuse on subsequent turns.
export type SystemBlock = {
  type: 'text'
  text: string
  cache_control?: { type: 'ephemeral' }
}

export async function assembleSystemPrompt(ctx: PromptContext): Promise<SystemBlock[]> {
  // ── Rich time context (replaces single-line timestamp) ────────────────────
  // Fetched fresh every call so the mentor always sees the correct temporal
  // state.  Runs in parallel with the rest of assembly; no cache_control here
  // because this block changes minute-by-minute.
  const timeContext = await buildTimeContext(ctx.userId, ctx.reminderTime)
  const timeBlock   = formatTimeContextForPrompt(timeContext)

  const layer1 = BASE_MENTOR_PROMPT
  const layer2 = buildUserLayer(ctx.user)
  const layer3 = buildMemoryLayer(ctx.memory, ctx.lastSession, ctx.openCommitments)
  const baseLayer4 =
    ctx.mode === 'debrief' ? buildDebriefPrompt(ctx.user.tracked_domains ?? [])
    : ctx.mode === 'morning' ? MORNING_MODE_PROMPT
    : OPEN_CHAT_PROMPT

  const layer4 = ctx.isFirstSession
    ? FIRST_SESSION_PROMPT + '\n\n' + baseLayer4
    : baseLayer4

  return [
    // ── Block 1: L1 character ─────────────────────────────────────────────────
    // Identical for every user and every session — the deepest cache boundary.
    // Marking it means the character definition is never re-processed after the
    // first call that warms the cache.
    {
      type: 'text',
      text: layer1,
      cache_control: { type: 'ephemeral' },
    },

    // ── Block 2: L2 user profile ──────────────────────────────────────────────
    // User-specific but only changes when the user edits their profile (rare).
    // Caching here gives a per-user hit on every turn of every session until
    // the profile changes.  Together with Block 1 this covers stable tokens.
    {
      type: 'text',
      text: layer2,
      cache_control: { type: 'ephemeral' },
    },

    // ── Block 3: time block + L3 memory + L4 mode ─────────────────────────────
    // Time block is first so the mentor reads the temporal situation before
    // it reads history.  Memory refreshes every ~3 days; mode changes per
    // session; time changes every minute.  No cache_control — Blocks 1+2 carry
    // the savings; volatile content here never breaks that stable prefix.
    {
      type: 'text',
      text: [timeBlock, layer3, layer4].join('\n\n---\n\n'),
    },
  ]
}
