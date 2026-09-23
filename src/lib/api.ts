// The one place that knows the backend contract. Everything else in src/ talks to
// this instead of calling fetch directly, so the API shape lives in exactly one file.

const base = (import.meta.env.VITE_API_BASE_URL ?? '').trim().replace(/\/$/, '')

/** False when the site is built without a backend URL — callers show setup help. */
export const apiConfigured = (): boolean => base.length > 0

const TOKEN_KEY = 'portfolio.admin.token'

// ponytail: the browser holds a random session token from POST /api/login, not the
// GitHub credential. The PAT that commits profile.json lives in the server env, so
// XSS on this page can at worst ride a session until it expires or the server
// restarts — it can never read or rotate the write token. sessionStorage keeps the
// session tab-scoped; switching to localStorage would only lengthen convenience.
export const getToken = (): string => sessionStorage.getItem(TOKEN_KEY) ?? ''
export const setToken = (token: string): void => sessionStorage.setItem(TOKEN_KEY, token)
export const clearToken = (): void => sessionStorage.removeItem(TOKEN_KEY)

export interface ApiComment {
  id: string
  slug: string
  name: string
  body: string
  createdAt: string
  parentId?: string
  quote?: string
  reactions?: Record<string, string[]>
}

export interface ProfilePayload {
  name: string
  role: string
  intro: string
  avatar: string
  linkedin: string
  phone: string
  gmail: string
  links: { label: string; url: string }[]
}

function requireBase(): string {
  if (!base) throw new Error('Backend URL is not configured (VITE_API_BASE_URL).')
  return base
}

async function request<T>(path: string, init: RequestInit = {}, tokenOverride?: string): Promise<T> {
  const token = tokenOverride ?? getToken()
  const headers = new Headers(init.headers)
  // Only JSON bodies get a default content type; avatar uploads set their own.
  if (typeof init.body === 'string' && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json')
  }
  if (token) headers.set('Authorization', `Bearer ${token}`)

  const res = await fetch(`${requireBase()}${path}`, { ...init, headers })
  const raw = await res.text()
  let payload: unknown = null
  if (raw) {
    try {
      payload = JSON.parse(raw)
    } catch {
      payload = null
    }
  }
  if (!res.ok) {
    const message = (payload as { error?: string } | null)?.error
    throw new Error(message || `Request failed with ${res.status}`)
  }
  return payload as T
}

// ------------------------------------------------------------------- comments

export const listComments = (slug: string) =>
  request<{ comments: ApiComment[] }>(`/api/comments?slug=${encodeURIComponent(slug)}`)

export const createComment = (
  slug: string,
  name: string,
  body: string,
  opts: { parentId?: string; quote?: string } = {},
) =>
  request<{ comment: ApiComment }>('/api/comments', {
    method: 'POST',
    body: JSON.stringify({ slug, name, body, ...opts }),
  })

/** Toggles this browser's anonymous reaction pick on one comment. */
export const toggleReaction = (
  slug: string,
  id: string,
  viewer: string,
  reactions: string[],
) =>
  request<{ comment: ApiComment }>(
    `/api/comments/${encodeURIComponent(slug)}/${encodeURIComponent(id)}/reactions`,
    { method: 'POST', body: JSON.stringify({ viewer, reactions }) },
  )

export const deleteComment = (slug: string, id: string) =>
  request<{ ok: true }>(`/api/comments/${encodeURIComponent(slug)}/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  })

/** SSE endpoint for one post's thread. Public — reading needs no token. */
export const commentsStreamUrl = (slug: string): string =>
  `${requireBase()}/api/comments/stream?slug=${encodeURIComponent(slug)}`

// ----------------------------------------------------------------------- auth

/** One admin password in, one random session token out. The PAT stays server-side. */
export const loginAdmin = (password: string) =>
  request<{ token: string; login: string }>('/api/login', {
    method: 'POST',
    body: JSON.stringify({ password }),
  })

export const getMe = () => request<{ admin: boolean; login: string | null; reason?: string }>('/api/me')

// -------------------------------------------------------------------- profile

/** Reads profile.json from the repo, which can be newer than the deployed bundle. */
export const getRepoProfile = () =>
  request<{ profile: ProfilePayload; path: string }>('/api/profile')

export const saveProfile = (profile: ProfilePayload) =>
  request<{ ok: true; path: string; profile: ProfilePayload }>('/api/profile', {
    method: 'PUT',
    body: JSON.stringify(profile),
  })

export const uploadAvatar = (file: Blob) =>
  request<{ url: string }>('/api/profile/avatar', {
    method: 'PUT',
    headers: { 'Content-Type': file.type || 'application/octet-stream' },
    body: file,
  })

// ----------------------------------------------------------------------- chat

export const getChatStatus = () => request<{ llmEnabled: boolean }>('/api/chat/status')

export const askChat = (query: string, context: { source: string; text: string }[]) =>
  request<{ answer: string }>('/api/chat', {
    method: 'POST',
    body: JSON.stringify({ query, context }),
  })
