# AGENTS.md

## What this is
Vite + React 19 + TS static frontend (`src/`) + small Node backend (`server/src/`, raw `node:http`, no framework). Deploys: frontend → GitHub Pages, backend → Vercel functions (`api/index.js` wraps `listener` from `server/src/index.ts`; `vercel.json` rewrites every `/api/*` path to it), backend → VPS via compose.

## Commands
- Frontend: `npm run dev` (needs `.env`), `npm run build` (= `tsc --noEmit && vite build`), `npm run preview`.
- Backend: `npm run dev:server` (compiles `server/` then watches `server/dist`), `npm run build:server`, `npm run typecheck:server`, `npm run start:server`.
- Verify with **both** green: `npm run build` + `npm run typecheck:server`. There are no tests, linter, or formatter configs — do not add runners.
- Health check: `curl http://localhost:8787/api/health` → `{ok, storage, admin, llm}`.

## Structure (entrypoints)
- `src/main.tsx` → `src/App.tsx`: hash router (`#/`, `#/blog`, `#/blog/:slug`, `#/admin`; old `#/chat` links redirect to the blog with the chat open). Hash routing is required for GitHub Pages (no server rewrites).
- `src/content/<slug>.md` + `<slug>.vi.md` = blog posts, English + Vietnamese (slug = filename, shared by both; frontmatter `title/date/tags/summary`, bundled at build). Diagrams live in `public/blog/`. `src/lib/i18n.ts` = EN/VI switch + interface strings; `getProfile()`/`getPosts()`/`getIndex()` default to the current language, so admin code must pass `'en'` explicitly. `src/content/profile.json` = single source for home page. Posts are git-only by design — admin panel never writes them.
- `src/lib/rag.ts` = client-side BM25 retrieval over the blog posts (no vector DB); `src/lib/api.ts` + `src/lib/store.ts` = backend client / content store. `vite.config.ts` `base: './'` is required for Pages project sites — keep it.
- `server/src/index.ts` = all routes; `server/src/env.ts` = config truth; `sanitize.ts` (profile/link allow-list), `auth.ts` (HMAC stateless sessions), `storage.ts` (Vercel Blob), `github.ts`, `llm.ts`.
- Two TS projects: root `tsconfig.json` includes only `src`; `server/tsconfig.json` (`NodeNext`, outDir `server/dist`). Frontend `tsc` never checks `server/` and vice versa.

## Env (two files, never mix)
- `.env` (frontend, gitignored): only `VITE_API_BASE_URL` (public, inlined into bundle). Unset = site still builds, comments/admin show "not configured". Use `/` for same-origin (Vercel), full origin for split deploys. Live Pages value comes from the repo **variable** `VITE_API_BASE_URL` in `deploy.yml`, not from the file.
- `.env.server` (backend, gitignored, fed to compose via `env_file`): `BLOB_READ_WRITE_TOKEN`, `ADMIN_PASSWORD` (+ optional `SESSION_SECRET`), `GITHUB_REPO/BRANCH/PROFILE_PATH` + `GITHUB_TOKEN` (fine-grained, Contents read+write, server-side only), `OPENROUTER_*` (optional; blank = chat falls back to retrieval-only), `FRONTEND_ORIGIN`, `PORT`, `TRUST_PROXY`.
- Backend never crashes on missing config — it starts degraded and reports via `/api/health`. `FRONTEND_ORIGIN` must match exactly (no trailing slash) or CORS blocks everything. `TRUST_PROXY=1` only behind a proxy you control (compose already sets it); otherwise rate-limit IPs and avatar-URL scheme are attacker-controlled.

## Conventions / gotchas
- Source of truth is `README.md` + `server/src/env.ts` + `server/src/index.ts`. `PRD.md` / `plan.md` describe an obsolete design (Giscus, SSE, MinIO, OAuth, client-side key) — do not follow them. Blob (`BLOB_READ_WRITE_TOKEN`) is the only storage.
- Comments are polling (`POLL_MIN_MS`/`POLL_MAX_MS` in `src/components/Comments.tsx`, only while the thread is on screen), not SSE/streams — serverless fan-out can't reach other instances. Polls send `?since=<version>`, and the backend answers from a version-marker `head()`: never add a per-poll `list` (Blob Hobby includes 2,000 list-class ops/month).
- Admin = one password (`ADMIN_PASSWORD`) → HMAC-signed token in tab `sessionStorage` (no cookies: frontend and API may be cross-origin). `GITHUB_TOKEN` never leaves the server. Profile `PUT` merges over an allow-list (`http(s)/mailto:/tel:` only) — hand-added keys in `profile.json` survive admin saves.
- Local dev: `cp .env.server.example .env.server` + `cp .env.example .env`, then `docker compose up -d` and `npm run dev`. VPS TLS: `docker compose --profile tls up -d` (needs `CADDY_DOMAIN`); or point own proxy at `8787` with `TRUST_PROXY=1`. Never commit `.env` / `.env.server`; never put secrets in `VITE_*` vars.
