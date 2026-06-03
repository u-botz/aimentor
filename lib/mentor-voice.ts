import { streamChat, resolveModel } from '@/lib/model-router'

export type ProactiveKind =
  | 'morning'
  | 'debrief'
  | 'streak_broken'
  | 'gone_quiet'
  | 'commitment_due'

export type GenerateProactiveMessageParams = {
  name: string
  kind: ProactiveKind
  context: string
}

const FALLBACKS: Record<ProactiveKind, string> = {
  morning: 'Pick one thing that matters today and protect it.',
  debrief: "Time to close out the day — how did it actually go?",
  streak_broken: 'A streak slipped. It happens. Start a fresh one today.',
  gone_quiet: "It's been a while. Where are you right now, really?",
  commitment_due: 'Something you committed to is due. Did it get done?',
}

const SYSTEM_PROMPT =
  'You are a personal mentor writing a single short push-notification line to ' +
  'your user. Direct, warm, never cruel. One sentence, under 18 words. No emoji. ' +
  "No greeting fluff unless it's the morning kind. Write as if you genuinely " +
  'noticed and care. Do not use the user\'s name more than once.'

export async function generateProactiveMessage(
  params: GenerateProactiveMessageParams
): Promise<string> {
  const { name, kind, context } = params

  try {
    const userMessage =
      `User name: ${name}\n` +
      `Situation: ${kind}\n` +
      `Context: ${context}\n` +
      'Write the one-line notification body now. Output ONLY the line, nothing else.'

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
    return trimmed || FALLBACKS[kind]
  } catch (error) {
    console.error('generateProactiveMessage error:', error)
    return FALLBACKS[kind] ?? FALLBACKS.gone_quiet
  }
}
