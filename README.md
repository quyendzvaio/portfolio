# Portfolio — AI Blog + RAG Chat + MinIO Comments

Vite + React + TS static site (deploys to GitHub Pages) plus a small Node backend
that owns comments, admin login and the LLM call.

## Architecture

| Piece | Lives where | How it changes |
| --- | --- | --- |
| Blog posts | `src/content/*.md`, committed to git | Bundled at build time. Add/edit/delete = commit, push, redeploy. |
| Comments | Vercel Blob, one JSON object per comment | Via the backend. Anonymous; an open thread re-reads every few seconds. |
| Admin login | `ADMIN_PASSWORD` → signed session token | Session token in `sessionStorage`; the GitHub write credential stays server-side. |
| RAG retrieval | Browser (`src/lib/rag.ts`) | TF-IDF + parent/child chunking, no vector DB. |
| LLM call | Backend → OpenRouter | The key never ships to the browser. |
| Profile | `src/content/profile.json` | Edit by hand, or from the admin panel, which commits the file for you. |

The site still builds and runs with no backend: comments and the admin panel show a
setup note and chat answers with raw retrieval plus citations.

## Customize (1 file)

Edit `src/content/profile.json`: name, role, intro, avatar, linkedin, phone, gmail, links.

## Blog

Add/edit/delete `src/content/*.md` and push. Frontmatter: `title/date/tags/summary`.
Slug comes from the filename. Posts are **not** editable from the admin panel by
design — the repo is the source of truth, so there is no state that exists in only
one browser.

## Comments

Anyone can comment; a name is optional and never verified. The owner can delete any
comment inline in the thread. Reads are public, deletes require the admin token.

Freshness is polling, not a stream: an open thread re-reads the comments every few
seconds (`POLL_MS` in `src/components/Comments.tsx`). The backend runs serverless, so
an in-process fan-out could not reach a comment written in another instance — a stream
would go quietly stale instead of failing loudly.

Because writes are open, the backend rate-limits by IP (`COMMENTS_PER_WINDOW`) and
caps length. If the thread ever gets targeted, add a captcha or moderation queue.

## Run locally

```bash
npm install

# 1. backend
cp .env.server.example .env.server      # fill it in, see below
docker compose up -d

# 2. the site
cp .env.example .env                    # VITE_API_BASE_URL=http://localhost:8787
npm run dev                             # http://localhost:5173
```

Backend without Docker (still needs `BLOB_READ_WRITE_TOKEN`, `ADMIN_PASSWORD` and
`GITHUB_TOKEN`):

```bash
npm run dev:server          # compiles server/ then watches server/dist
npm run build:server        # compile only
npm run typecheck:server    # typecheck only
npm run start:server        # run the compiled output
```

## Backend configuration

Everything backend-side lives in `.env.server` (gitignored). Nothing in it reaches the
browser. The groups:

- **Vercel Blob** — `BLOB_READ_WRITE_TOKEN`. Comments and the avatar live here, one
  JSON object per comment. `vercel env pull` writes the token. Missing ⇒ comments and
  avatar upload are disabled.
- **Admin** — `ADMIN_PASSWORD`, plus `GITHUB_REPO`, `GITHUB_BRANCH`, `PROFILE_PATH`
  and `GITHUB_TOKEN`. The password is the only secret the owner types; the token is the
  repo-write credential and never reaches a browser. Missing any of them ⇒ admin login
  is disabled. No OAuth app and no callback URL are involved.
- **OpenRouter** — optional. Missing ⇒ chat runs retrieval-only.
- **`FRONTEND_ORIGIN`** — the exact origin the static site is served from. It must
  match or the browser blocks every request (no trailing slash).

`GET /api/health` reports which groups are configured:

```bash
curl http://localhost:8787/api/health
# {"ok":true,"storage":true,"admin":true,"llm":false}
```

## Admin login (one password)

Set `ADMIN_PASSWORD` in `.env.server` and open `#/admin`. The only thing the browser
keeps is a signed session token in that tab's `sessionStorage` — the GitHub write
credential (`GITHUB_TOKEN`) stays on the server, so XSS can at worst ride a session
until it expires.

The session token is signed with HMAC and carries its own expiry, so no session state
lives in server memory. That is what makes login work on a serverless host, where two
consecutive requests can land in different instances and a session Map would sign the
owner out at random. `SESSION_SECRET` keys the signature; leave it unset and the key
is derived from `ADMIN_PASSWORD`, so rotating the password invalidates every
outstanding session.

`GITHUB_TOKEN` is still required, for the profile editor. Create a **fine-grained**
token at github.com/settings/personal-access-tokens with **Contents: Read and write**
scoped to this repository, and give it an expiry.

**Why a password and not OAuth.** The admin panel commits `profile.json`, and an OAuth
`read:user` login cannot write to a repository — so a separate write credential was
going to be needed either way. Keeping that credential server-side instead of in the
browser removes the OAuth app and the callback URL, and means a stolen browser session
cannot be used to rewrite the repository.

**Why not a session cookie.** The static site can be served from a different origin
than the API (GitHub Pages plus a VPS, for example), where a cookie would be
third-party and browsers are removing those — logins would work and then quietly stop.
A bearer token is unaffected. The trade-off is that XSS could read it, so keep the
frontend free of injected markup. The Vercel setup below puts both halves on one
origin, which is the safest version of this.

## Editing the profile

The admin panel commits `src/content/profile.json` to the branch you configured,
then GitHub Actions redeploys. Expect a minute before the live site changes, and a
hard refresh if your browser cached the old avatar. The panel reads the committed
file rather than the deployed bundle, so it never edits a stale copy.

The avatar is uploaded to MinIO and referenced by URL instead of being inlined as a
base64 data URL — otherwise every later profile commit would carry a ~700 KB image
in its diff.

Every field is rebuilt server-side from an allow-list before it is committed, so only
`http(s)`, `mailto:` and `tel:` links survive. A `javascript:` URL in `links` would
otherwise become stored XSS on the live site.

## Deploy

**Frontend → GitHub Pages.** `.github/workflows/deploy.yml` builds `dist/` and
publishes it. Set a repository **variable** named `VITE_API_BASE_URL` (Settings →
Secrets and variables → Actions → Variables) to your API URL; without it the deployed
site builds with comments and admin disabled.

**Frontend + backend → one Vercel project.** `vercel.json` declares two services: the
static site at `/` and the container backend behind `/api/*`. Both deploy together on
one domain, so the browser calls the API same-origin and CORS stops being a variable to
get right. Set `VITE_API_BASE_URL=/` (same-origin), and add `BLOB_READ_WRITE_TOKEN`,
`ADMIN_PASSWORD`, `GITHUB_REPO` and `GITHUB_TOKEN` as project env vars. The Dockerfile
needs no changes: `env.ts` reads `PORT`, which is what the platform injects.

Both services build from the same project root, which is the least-exercised part of
this setup — if Vercel refuses two services from one root, fall back to a second Vercel
project for the backend and point `VITE_API_BASE_URL` at its URL instead.

Storing comments in Vercel Blob (rather than the previous self-hosted MinIO) also
retires a moving target: MinIO deprecated its community images, and its Docker Hub
images already pull with a misleading "pull access denied" that looks like an auth
problem.

**Backend → your VPS.**

```bash
cp .env.server.example .env.server      # set FRONTEND_ORIGIN + the API domain
docker compose up -d
```

Deploying the API over HTTPS is still the right thing (the admin token travels in a
header), and `TRUST_PROXY=1` is what makes the backend build correct avatar URLs.
Expose MinIO's port 9000 only to the backend (it already is, inside the compose
network) and put TLS in front of `8787`. The bundled Caddy service does that for you:

```bash
docker compose --profile tls up -d      # needs CADDY_DOMAIN + ports 80/443 open
```

Or point an existing nginx/Caddy at `8787` and set `TRUST_PROXY=1` so rate limiting
sees real client IPs instead of the proxy's.

## Security notes

- The OpenRouter key and MinIO credentials stay on the server. They used to be inlined
  into the client bundle; that is fixed.
- Comments are unauthenticated and stored in your own bucket. Rate limits are the only
  barrier — worth a captcha if it gets abused.
- The browser holds only a signed session token; the repo-write credential lives in
  `GITHUB_TOKEN` on the server. Keep it fine-grained and expiring, and sign out on
  shared machines.
- Sessions are stateless, so any number of backend instances can serve them, and
  comment freshness is polling — nothing depends on which instance a request lands in.
