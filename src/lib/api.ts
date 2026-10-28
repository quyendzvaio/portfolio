import type { Lang } from './i18n'
// The one place that knows the backend contract. Everything else in src/ talks to
// this instead of calling fetch directly, so the API shape lives in exactly one file.

// A '/' (or any relative) value means same-origin: the backend is deployed as a
// service beside this site — see vercel.json — so requests go to /api/* on whatever
// host served the page, and preview deployments need no separate URL.
const rawBase = (import.meta.env.VITE_API_BASE_URL ?? '').trim()
const base = rawBase.replace(/\/$/, '')

/** False when the site is built without a backend URL — callers show setup help. */
export const apiConfigured = (): boolean => rawBase.length > 0

const TOKEN_KEY = 'portfolio.admin.token'

// ponytail: the browser holds a signed session token from POST /api/login, not the
// GitHub credential. The PAT that commits profile.json lives in the server env, so
// XSS on this page can at worst ride a session until it expires — it can never read or rotate the write token. sessionStorage keeps the
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
  available?: string
  skills?: string[]
  stats?: { value: string; label: string }[]
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

/**
 * The thread, or `{ unchanged: true }` when it still matches `since` (the version a
 * previous call returned). Polls pass `since`, so a quiet thread costs the backend a
 * single cheap metadata check.
 */
export const listComments = (slug: string, since?: string) =>
  request<{ version: string; comments?: ApiComment[]; unchanged?: true }>(
    `/api/comments?slug=${encodeURIComponent(slug)}${since ? `&since=${encodeURIComponent(since)}` : ''}`,
  )

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

// ----------------------------------------------------------------------- auth

/** One admin password in, one signed session token out. The PAT stays server-side. */
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

export const askChat = (query: string, context: { source: string; text: string }[], lang: Lang) =>
  request<{ answer: string }>('/api/chat', {
    method: 'POST',
    body: JSON.stringify({ query, context, lang }),
  })
