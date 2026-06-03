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

export function assembleSystemPrompt(ctx: PromptContext): string {
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

  return [timeContext, layer1, layer2, layer3, layer4].join('\n\n---\n\n')
}
