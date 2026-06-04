import { streamChat, resolveModel } from '@/lib/model-router'

export type MilestoneKind = 'commitment_kept'

export type MilestoneEvidence = {
  commitment: string
  made_on: string | null // YYYY-MM-DD
  resolved_on: string | null // YYYY-MM-DD
  days_held: number
}

export type GenerateMilestoneCardParams = {
  name: string
  kind: MilestoneKind
  evidence: MilestoneEvidence
}

export type MilestoneCard = { title: string; body: string }

// Short, plain titles per kind.
const TITLES: Record<MilestoneKind, string> = {
  commitment_kept: 'A commitment kept',
}

// Per-kind fallback templates. Unlike mentor-voice these take the evidence so a
// fallback still references the specific moment — never a generic line.
const FALLBACKS: Record<MilestoneKind, (e: MilestoneEvidence) => string> = {
  commitment_kept: (e) => {
    const held =
      e.days_held > 0
        ? ` and held it ${e.days_held} ${e.days_held === 1 ? 'day' : 'days'}`
        : ''
    return `You committed to "${e.commitment.trim()}"${held}. You did what you said you would. I noticed.`
  },
}

const SYSTEM_PROMPT =
  "You are the user's personal mentor — strict, honest, hard to impress, " +
  'never cruel. The user has crossed a real milestone they earned. Acknowledge ' +
  'it in your own voice and reference the specific evidence you are given. Do ' +
  'not flatter. Do not celebrate. No emoji. No exclamation marks. Under 40 ' +
  'words. It should read like a hard-to-impress person choosing to say, plainly, ' +
  'that they noticed.'

export async function generateMilestoneCard(
  params: GenerateMilestoneCardParams
): Promise<MilestoneCard> {
  const { name, kind, evidence } = params
  const title = TITLES[kind] ?? 'A milestone'

  try {
    const userMessage =
      `User name: ${name}\n` +
      `Milestone: ${kind}\n` +
      `Commitment they made: ${evidence.commitment}\n` +
      `Date committed: ${evidence.made_on ?? 'unknown'}\n` +
      `Date kept: ${evidence.resolved_on ?? 'unknown'}\n` +
      `Days held: ${evidence.days_held}\n` +
      'Write the acknowledgement now, stating the facts plainly in your own ' +
      'voice. Output ONLY the line, nothing else.'

    const model = resolveModel('fast')
    const stream = await streamChat(
      SYSTEM_PROMPT,
      [{ role: 'user', content: userMessage }],
      model,
      200
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

    const body = text.trim()
    return { title, body: body || FALLBACKS[kind](evidence) }
  } catch (error) {
    console.error('generateMilestoneCard error:', error)
    return { title, body: FALLBACKS[kind](evidence) }
  }
}
