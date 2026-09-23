// ponytail: config is read once at boot and nothing throws. If a group is missing
// the server still starts and reports exactly what is unconfigured, so the owner
// can curl /api/health instead of debugging a crash loop.

const str = (name: string, fallback = ''): string => process.env[name]?.trim() || fallback

const num = (name: string, fallback: number): number => {
  const parsed = Number(process.env[name]?.trim())
  return Number.isFinite(parsed) ? parsed : fallback
}

const bool = (name: string, fallback = false): boolean => {
  const raw = process.env[name]?.trim().toLowerCase()
  if (!raw) return fallback
  return raw === '1' || raw === 'true' || raw === 'yes'
}

export const env = {
  port: num('PORT', 8787),
  frontendOrigin: str('FRONTEND_ORIGIN', 'http://localhost:5173').replace(/\/$/, ''),
  // Only enable behind a reverse proxy you control — otherwise X-Forwarded-For and
  // X-Forwarded-Proto are attacker-controlled, which breaks rate limits and lets a
  // request claim to be https.
  trustProxy: bool('TRUST_PROXY', false),

  // Vercel Blob replaced MinIO. A serverless host mounts no disk, so a self-hosted
  // object store had nowhere to live; Blob is the same platform as the deployment
  // and its free allowance (1 GB) is far past a portfolio's comments and one avatar.
  blob: {
    token: str('BLOB_READ_WRITE_TOKEN'),
  },

  admin: {
    // The one secret the admin types. Empty disables admin login entirely.
    password: str('ADMIN_PASSWORD'),
    // Keys the signed session tokens. Optional: without it the key is derived from
    // ADMIN_PASSWORD, so the only mandatory secret stays the one the owner types.
    // Rotating the password then invalidates every outstanding session for free.
    sessionSecret: str('SESSION_SECRET'),
    sessionTtlMs: num('SESSION_TTL_HOURS', 24 * 7) * 3_600_000,
  },

  github: {
    // owner/name — the coordinates every commit targets.
    repo: str('GITHUB_REPO'),
    branch: str('GITHUB_BRANCH', 'main'),
    profilePath: str('PROFILE_PATH', 'src/content/profile.json'),
    // The commit credential moved server-side: the admin browser session only ever
    // holds a random session token, so the PAT is out of XSS reach entirely.
    token: str('GITHUB_TOKEN'),
  },

  llm: {
    baseUrl: str('OPENROUTER_BASE_URL', 'https://openrouter.ai/api/v1').replace(/\/$/, ''),
    model: str('OPENROUTER_MODEL'),
    apiKey: str('OPENROUTER_API_KEY'),
    siteUrl: str('OPENROUTER_SITE_URL'),
  },

  limits: {
    commentMaxLength: num('COMMENT_MAX_LENGTH', 2000),
    nameMaxLength: num('NAME_MAX_LENGTH', 40),
    commentsPerWindow: num('COMMENTS_PER_WINDOW', 5),
    reactionsPerWindow: num('REACTIONS_PER_WINDOW', 60),
    chatPerWindow: num('CHAT_PER_WINDOW', 20),
    authPerWindow: num('AUTH_PER_WINDOW', 30),
    windowMs: num('RATE_WINDOW_MS', 10 * 60 * 1000),
    avatarMaxBytes: num('AVATAR_MAX_BYTES', 2 * 1024 * 1024),
  },
}

export const storageReady = (): boolean => Boolean(env.blob.token)

/** Admin login needs a password to check and repo coordinates plus a token to commit with. */
export const adminReady = (): boolean =>
  Boolean(env.admin.password) && /^[^/\s]+\/[^/\s]+$/.test(env.github.repo) && Boolean(env.github.token)

export const llmReady = (): boolean => Boolean(env.llm.apiKey && env.llm.model)

export const configReport = () => ({
  storage: storageReady(),
  admin: adminReady(),
  llm: llmReady(),
})
