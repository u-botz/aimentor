// Routes API calls to either Claude or DeepSeek
// based on ACTIVE_MODEL environment variable
// DeepSeek uses OpenAI-compatible API so the interface is simple

import Anthropic from '@anthropic-ai/sdk'

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
})

export async function streamChat(systemPrompt, messages, modelType = 'sonnet') {
  const activeModel = process.env.ACTIVE_MODEL || 'claude'
  const maxTokens = modelType === 'haiku' ? 800 : 1024

  if (activeModel === 'deepseek') {
    const response = await fetch('https://api.deepseek.com/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${process.env.DEEPSEEK_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'deepseek-chat',
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

  const claudeModel =
    modelType === 'haiku'
      ? 'claude-haiku-4-5-20251001'
      : 'claude-sonnet-4-6'

  return anthropic.messages.stream({
    model: claudeModel,
    max_tokens: maxTokens,
    system: systemPrompt,
    messages: messages.map((m) => ({
      role: m.role,
      content: m.content,
    })),
  })
}
