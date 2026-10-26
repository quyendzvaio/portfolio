import { env } from './env.js'

export interface ContextChunk {
  source: string
  text: string
}

function systemPrompt(): string {
  return [
    'You answer questions about this portfolio and its blog posts.',
    'Use ONLY the Context below. Cite every factual claim as [source title].',
    'If the answer is not in the Context, say so and suggest what to ask instead.',
    'Always answer in English, whatever language the question is in.',
  ].join(' ')
}

// The key lives here and never ships to the browser — this is the whole reason the
// chat call goes through the backend instead of straight from the client.
export async function ask(query: string, context: ContextChunk[]): Promise<string> {
  const contextText = context.map((chunk) => `[${chunk.source}]\n${chunk.text}`).join('\n\n')
  const res = await fetch(`${env.llm.baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${env.llm.apiKey}`,
      ...(env.llm.siteUrl ? { 'HTTP-Referer': env.llm.siteUrl, 'X-Title': 'Portfolio RAG Chat' } : {}),
    },
    body: JSON.stringify({
      model: env.llm.model,
      // Output is the expensive half of a call and the slow half too: a short, capped,
      // low-temperature answer is what a grounded portfolio chat needs.
      max_tokens: env.llm.maxTokens,
      temperature: 0.2,
      messages: [
        { role: 'system', content: systemPrompt() },
        {
          role: 'user',
          content: `Context:\n${contextText || '(no relevant chunks found)'}\n\nQuestion: ${query}`,
        },
      ],
    }),
    signal: AbortSignal.timeout(env.llm.timeoutMs),
  })
  if (!res.ok) throw new Error(`OpenRouter ${res.status}: ${(await res.text()).slice(0, 200)}`)
  const data = (await res.json()) as { choices?: { message?: { content?: string } }[] }
  return data.choices?.[0]?.message?.content ?? '(empty response)'
}
