import { env } from './env.js'

export interface ContextChunk {
  source: string
  text: string
}

export type Lang = 'en' | 'vi'
const LANGUAGE: Record<Lang, string> = { en: 'English', vi: 'Vietnamese' }

function systemPrompt(lang: Lang): string {
  return [
    'You answer questions about this portfolio and its blog posts.',
    'Use ONLY the Context below. Cite every factual claim as [source title].',
    'If the answer is not in the Context, say so and suggest what to ask instead.',
    // The site's language switch decides, not the question: a visitor reading the
    // Vietnamese site gets Vietnamese answers even to an English question.
    `Always answer in ${LANGUAGE[lang]}, whatever language the question is in.`,
  ].join(' ')
}

// The key lives here and never ships to the browser — this is the whole reason the
// chat call goes through the backend instead of straight from the client.
export async function ask(query: string, context: ContextChunk[], lang: Lang = 'en'): Promise<string> {
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
      // Reasoning models spend max_tokens on hidden thinking first: with a 400-token
      // cap, nemotron used all 400 thinking and returned no answer. Grounded lookup
      // answers don't need it; OpenRouter ignores this for models that don't reason.
      reasoning: { enabled: false },
      messages: [
        { role: 'system', content: systemPrompt(lang) },
        {
          role: 'user',
          content: `Context:\n${contextText || '(no relevant chunks found)'}\n\nQuestion: ${query}`,
        },
      ],
    }),
    signal: AbortSignal.timeout(env.llm.timeoutMs),
  })
  if (!res.ok) throw new Error(`OpenRouter ${res.status}: ${(await res.text()).slice(0, 200)}`)
  const data = (await res.json()) as { choices?: { message?: { content?: string }; finish_reason?: string }[] }
  const answer = data.choices?.[0]?.message?.content?.trim()
  // An empty answer is a failure, not a reply: throwing lets the chat fall back to
  // showing the retrieved passages instead of printing nothing.
  if (!answer) throw new Error(`OpenRouter returned no answer (finish_reason: ${data.choices?.[0]?.finish_reason ?? 'none'})`)
  return answer
}
