# Portfolio — AI Blog + RAG Chat + Comments

Vite + React + TS static site (deploys to GitHub Pages) plus a small Node backend
that owns comments, admin login and the LLM call.

## Architecture

| Piece | Lives where | How it changes |
| --- | --- | --- |
| Blog posts | `src/content/<slug>.md` + `<slug>.vi.md`, committed to git | Bundled at build time. Add/edit/delete = commit, push, redeploy. |
| Comments | Vercel Blob, one JSON object per comment | Via the backend. Anonymous; a thread on screen re-checks every 5–30 s. |
| Admin login | `ADMIN_PASSWORD` → signed session token | Session token in `sessionStorage`; the GitHub write credential stays server-side. |
| RAG retrieval | Browser (`src/lib/rag.ts`) | TF-IDF + parent/child chunking, no vector DB. |
| LLM call | Backend → OpenRouter | The key never ships to the browser. |
| Profile | `src/content/profile.json` | Edit by hand, or from the admin panel, which commits the file for you. |

The site still builds and runs with no backend: comments and the admin panel show a
setup note and chat answers with raw retrieval plus citations.

## Customize (1 file)

Everything on the landing page comes from `src/content/profile.json`. Edit it by
hand, or from `#/admin`, which commits the file for you.

| Field | Shows up as |
| --- | --- |
| `name`, `role`, `intro` | Hero headline, role line, intro paragraph; also the browser tab title |
| `avatar` | The 3D portrait. An `https://` URL, or a file in `public/` such as `avatar.webp` (the default) |
| `available` | The status badge above your name. Empty hides it |
| `skills` | The Skills section, and the first three as chips around the portrait |
| `stats` | Up to four highlight numbers (`{ "value": "3+", "label": "years shipping ML" }`). A leading number counts up |
| `linkedin`, `phone`, `gmail`, `links` | Contact icons in the hero and footer |
| `vi` | Vietnamese `name`, `role`, `intro`, `available` for the VI side of the language switch. A missing one shows the English text |

A section whose field is empty doesn't render. The chat also indexes these fields, so
it can answer questions about your skills. To swap the photo without the admin panel,
replace `public/avatar.webp` (a 4:5 crop of about 720×900 works best).

Visitors can turn animations off from the footer. The site starts with motion off
when the OS asks for reduced motion.

The EN/VI switch in the nav changes the interface (`src/lib/i18n.ts`), the profile text
(`vi` above) and the posts, and the chat answers in the chosen language. The admin
panel stays in English and edits the English profile only; edit `vi` by hand.

## Blog

Add/edit/delete `src/content/<slug>.md` (English) and `src/content/<slug>.vi.md`
(Vietnamese) and push. Frontmatter: `title/date/tags/summary`. Slug comes from the
filename; both copies share it, so a post keeps one URL and one comment thread. A post
without a `.vi.md` shows its English copy on the VI side. A leading `# <title>` line is
dropped because the page already shows the title. The renderer (`src/lib/markdown.ts`)
supports `#`–`####` headings, flat lists, fenced code, tables, `>` quotes, images
(`![alt](blog/x.svg)`, files in `public/blog/`), bold, italic, code and links. Posts are **not** editable from the admin panel by
design — the repo is the source of truth, so there is no state that exists in only
one browser.

## Comments

Anyone can comment; a name is optional and never verified. The owner can delete any
comment inline in the thread. Reads are public, deletes require the admin token.

Freshness is polling, not a stream. The backend runs serverless, so an in-process
fan-out could not reach a comment written in another instance, and a stream would go
quietly stale instead of failing loudly.

Polling is built to fit Blob's free tier. On Hobby, every `list` is an "advanced
operation" (2,000 included a month), and going over blocks the store for 30 days. So:

- Each thread has a version marker (`comment-versions/{slug}.json`) that every write
  rewrites. A poll sends the last version it saw and costs one `head()` (a "simple"
  operation, 10,000 included). The thread is only listed again when the version moved,
  and the server keeps the last thread per instance, so a second reader often costs
  just the `head()`.
- The page polls only while the thread is on screen in a visible tab. It starts every
  5 s and backs off to 30 s while nothing changes (`POLL_MIN_MS` / `POLL_MAX_MS` in
  `src/components/Comments.tsx`). A reader who never scrolls to the comments costs one
  load.

The trade-off: on a quiet thread, someone else's new comment can take up to about 30 s
to appear. Your own comments, reactions and deletes show instantly.

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
then GitHub Actions redeploys. Expect a minute before the live site changes. The
panel reads the committed file rather than the deployed bundle, so it never edits a
stale copy.

The avatar is uploaded to Vercel Blob (served through `/api/avatar?v=<version>`) and
referenced by URL instead of being inlined as a base64 data URL — otherwise every
later profile commit would carry a ~700 KB image in its diff. Each upload is a new
version, so the live site keeps its current avatar until you save the profile, and an
upload you never save is pruned by the next one.

Every field is rebuilt server-side from an allow-list before it is committed, so only
`http(s)`, `mailto:` and `tel:` links survive. A `javascript:` URL in `links` would
otherwise become stored XSS on the live site.

## Deploy

**Frontend → GitHub Pages.** `.github/workflows/deploy.yml` builds `dist/` and
publishes it. Set a repository **variable** named `VITE_API_BASE_URL` (Settings →
Secrets and variables → Actions → Variables) to your API URL; without it the deployed
site builds with comments and admin disabled.

**Backend → Vercel (serverless).** `vercel.json` builds only the backend
(`npm run build:server`), and `api/[...path].js` serves every `/api/*` request with
the same `listener` the Docker server uses. The frontend stays on GitHub Pages.
`regions: ["sin1"]` keeps the function in Singapore, next to the Blob store and the
site's (Vietnamese) visitors; create the store in the same region.
1. Import the repo at vercel.com/new: preset *Other*, root `./`, no other build settings.
2. Paste the env vars into the import form: `ADMIN_PASSWORD`, `GITHUB_REPO`,
   `GITHUB_BRANCH`, `PROFILE_PATH`, `GITHUB_TOKEN`, `SESSION_SECRET`, `TRUST_PROXY=1`,
   `FRONTEND_ORIGIN=https://<user>.github.io`, and the optional `OPENROUTER_*`.
3. Create a **private** Blob store and connect it, which adds `BLOB_READ_WRITE_TOKEN`:
   `vercel link`, then `vercel blob create-store <name> --access private --region sin1 --yes`
   (or Storage → Create → Blob in the dashboard); then redeploy.
4. Set the repo variable `VITE_API_BASE_URL` to the project URL and rerun the Pages
   workflow. `https://<project>.vercel.app/api/health` should show `true` for each group.

`TRUST_PROXY=1` is safe here because Vercel overwrites `X-Forwarded-For` with the real
client IP. Without it, every visitor shares one rate-limit bucket (the proxy's
address), and avatar URLs come out as `http://`. On serverless, rate limits and the
chat/thread caches are per instance, so treat them as best-effort.

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
Put TLS in front of `8787`. The bundled Caddy service does that for you:

```bash
docker compose --profile tls up -d      # needs CADDY_DOMAIN + ports 80/443 open
```

Or point an existing nginx/Caddy at `8787` and set `TRUST_PROXY=1` so rate limiting
sees real client IPs instead of the proxy's.

## Security notes

- The OpenRouter key and Blob token stay on the server. They used to be inlined
  into the client bundle; that is fixed.
- Comments are unauthenticated and stored in your own bucket. Rate limits are the only
  barrier — worth a captcha if it gets abused.
- The browser holds only a signed session token; the repo-write credential lives in
  `GITHUB_TOKEN` on the server. Keep it fine-grained and expiring, and sign out on
  shared machines.
- Sessions are stateless, so any number of backend instances can serve them, and
  comment freshness is polling — nothing depends on which instance a request lands in.
