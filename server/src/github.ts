import { env } from './env.js'

// Contents API only: enough to read and commit profile.json. Blog posts stay a
// deliberate hand edit via git, so nothing here touches src/content/*.md.

const API = 'https://api.github.com'

export const githubHeaders = (token: string): Record<string, string> => ({
  Authorization: `Bearer ${token}`,
  Accept: 'application/vnd.github+json',
  'User-Agent': 'portfolio-backend',
  'X-GitHub-Api-Version': '2022-11-28',
})

export interface RepoFile {
  content: Record<string, unknown>
  sha: string
}

export async function readJsonFile(token: string, path: string): Promise<RepoFile> {
  const url = `${API}/repos/${env.github.repo}/contents/${path}?ref=${encodeURIComponent(env.github.branch)}`
  const res = await fetch(url, { headers: githubHeaders(token) })
  if (res.status === 404) throw new Error(`${path} was not found on branch "${env.github.branch}" of ${env.github.repo}.`)
  if (!res.ok) throw new Error(`Reading ${path} failed (${res.status}): ${(await res.text()).slice(0, 200)}`)
  const data = (await res.json()) as { content?: string; sha?: string }
  if (!data.sha || typeof data.content !== 'string') throw new Error(`${path} came back without content`)
  // The Contents API wraps base64 at 60 chars with newlines; they must go before decoding.
  const text = Buffer.from(data.content.replace(/\n/g, ''), 'base64').toString('utf8')
  try {
    return { content: JSON.parse(text) as Record<string, unknown>, sha: data.sha }
  } catch {
    throw new Error(`${path} is not valid JSON, so the admin form will not overwrite it.`)
  }
}

export async function writeJsonFile(
  token: string,
  path: string,
  value: unknown,
  message: string,
  sha: string,
): Promise<void> {
  const body = JSON.stringify({
    message,
    branch: env.github.branch,
    sha,
    content: Buffer.from(`${JSON.stringify(value, null, 2)}\n`, 'utf8').toString('base64'),
  })
  const res = await fetch(`${API}/repos/${env.github.repo}/contents/${path}`, {
    method: 'PUT',
    headers: { ...githubHeaders(token), 'Content-Type': 'application/json' },
    body,
  })
  if (!res.ok) {
    throw new Error(`Committing ${path} failed (${res.status}): ${(await res.text()).slice(0, 200)}`)
  }
}
