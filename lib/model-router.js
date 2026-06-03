// Routes API calls to either Claude or DeepSeek
// based on ACTIVE_MODEL environment variable
// DeepSeek uses OpenAI-compatible API so the interface is simple

import Anthropic from '@anthropic-ai/sdk'

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
})

// Backward tolerance: callers used to pass the labels 'haiku' / 'sonnet'.
// Map those to concrete Claude model ids so passing a label never crashes
// and a Haiku id never silently falls through to Sonnet.
const MODEL_ALIASES = {
  haiku: 'claude-haiku-4-5-20251001',
  sonnet: 'claude-sonnet-4-6',
}

export async function streamChat(
  systemPrompt,
  messages,
  modelId = 'claude-sonnet-4-6',
  maxTokens = 1024
) {
  const activeModel = process.env.ACTIVE_MODEL || 'claude'

  // Resolve a label to a concrete id; a concrete id passes through unchanged.
  const resolvedId = MODEL_ALIASES[modelId] || modelId

  if (activeModel === 'deepseek') {
    // DeepSeek only knows its own model ids; use the passed id only if it is a
    // deepseek id, otherwise route to deepseek-chat as before.
    const deepseekModel =
      typeof resolvedId === 'string' && resolvedId.startsWith('deepseek')
        ? resolvedId
        : 'deepseek-chat'

    const response = await fetch('https://api.deepseek.com/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${process.env.DEEPSEEK_API_KEY}`,
      },
      body: JSON.stringify({
        model: deepseekModel,
        stream: true,
        max_tokens: maxTokens,
        messages: [
          { role: 'system', content: systemPrompt },
          ...messages,
        ],
      }),
    })

    if (!response.ok) {
      throw new Error(`DeepSeek API error: ${response.statusText}`)
    }

    async function* deepseekToAnthropicStream() {
      const reader = response.body?.getReader()
      if (!reader) return
      const decoder = new TextDecoder()
      let buffer = ''
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''
        for (const line of lines) {
          if (line.trim() === 'data: [DONE]') return
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6))
              const text = data.choices[0]?.delta?.content
              if (text) {
                yield {
                  type: 'content_block_delta',
                  delta: { type: 'text_delta', text },
                }
              }
            } catch {
              // ignore parse errors for incomplete chunks
            }
          }
        }
      }
    }

    return deepseekToAnthropicStream()
  }

  return anthropic.messages.stream({
    model: resolvedId,
    max_tokens: maxTokens,
    system: systemPrompt,
    messages: messages.map((m) => ({
      role: m.role,
      content: m.content,
    })),
  })
}

export const TIER_MODELS = {
  claude: {
    fast: 'claude-haiku-4-5-20251001',
    deep: 'claude-sonnet-4-6',
  },
  deepseek: {
    fast: 'deepseek-chat',
    deep: 'deepseek-chat',
  },
};

// Resolve a tier to a concrete model id for the currently active provider.
export function resolveModel(tier = 'deep') {
  const provider = process.env.ACTIVE_MODEL === 'deepseek' ? 'deepseek' : 'claude';
  const map = TIER_MODELS[provider];
  return (map && map[tier]) || map.deep;
}
