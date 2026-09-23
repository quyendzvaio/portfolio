# Portfolio — AI Blog + RAG Chat + MinIO Comments

Vite + React + TS static site (deploys to GitHub Pages) plus a small Node backend
that owns comments, admin login and the LLM call.

## Architecture

| Piece | Lives where | How it changes |
| --- | --- | --- |
| Blog posts | `src/content/*.md`, committed to git | Bundled at build time. Add/edit/delete = commit, push, redeploy. |
| Comments | MinIO, one JSON object per comment | Via the backend. Anonymous, realtime over SSE. |
| Admin login | GitHub personal access token | Token in `sessionStorage`; only the repo owner's tokens are accepted. |
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

Realtime is Server-Sent Events: the backend writes the object to MinIO, then fans the
event out to every browser watching that post. The stream reconnects on its own and
re-fetches on reconnect, so comments posted during a dropout are not lost.

Because writes are open, the backend rate-limits by IP (`COMMENTS_PER_WINDOW`) and
caps length. If the thread ever gets targeted, add a captcha or moderation queue.

## Run locally

```bash
npm install

# 1. backend + MinIO
cp .env.server.example .env.server      # fill it in, see below
docker compose up -d

# 2. the site
cp .env.example .env                    # VITE_API_BASE_URL=http://localhost:8787
npm run dev                             # http://localhost:5173
```

Backend without Docker (needs a MinIO reachable at `MINIO_ENDPOINT`):

```bash
npm run dev:server          # compiles server/ then watches server/dist
npm run build:server        # compile only
npm run typecheck:server    # typecheck only
npm run start:server        # run the compiled output
```

## Backend configuration

Everything backend-side lives in `.env.server` (gitignored). Nothing in it reaches the
browser. The groups:

- **MinIO** — `MINIO_*`. `docker-compose.yml` feeds this same file to the MinIO
  container, so keep `MINIO_ACCESS_KEY`/`MINIO_SECRET_KEY` identical to
  `MINIO_ROOT_USER`/`MINIO_ROOT_PASSWORD` or the backend will fail to authenticate.
- **GitHub repo** — `GITHUB_REPO`, `GITHUB_BRANCH`, `PROFILE_PATH`. The owner half of
  `GITHUB_REPO` is also the only account allowed into `#/admin`. Missing ⇒ admin login
  is disabled. No OAuth app and no callback URL are involved.
- **OpenRouter** — optional. Missing ⇒ chat runs retrieval-only.
- **`FRONTEND_ORIGIN`** — the exact origin the static site is served from. It must
  match or the browser blocks every request (no trailing slash).

`GET /api/health` reports which groups are configured:

```bash
curl http://localhost:8787/api/health
# {"ok":true,"storage":true,"oauth":true,"llm":false}
```

## Admin login (personal access token)

Set `GITHUB_REPO=owner/name` in `.env.server`. The owner half of that string is the
admin, so there is no second username variable to keep in sync.

Then create a **fine-grained** token at github.com/settings/personal-access-tokens:

1. Repository access → only this repository
2. Repository permissions → **Contents: Read and write**
3. Give it an expiry

Paste it into `#/admin`. It is kept in that tab's `sessionStorage`, is never written
to the server's disk, and is validated against GitHub once per 5 minutes per token
(cached by hash, so raw tokens never sit in a map or a log).

**Why one token and not OAuth.** The admin panel commits `profile.json`, and an OAuth
`read:user` login cannot write to a repository — so a separate write credential was
going to be needed either way. Making the PAT do both jobs removes the OAuth app, the
callback URL, the HTTPS requirement on login, and `SESSION_SECRET`, along with any
code path that could work half the time.

**Why not a session cookie.** The site is on `*.github.io` and the API is on your VPS,
which is a different site. A cookie there would be third-party and browsers are
removing those, so logins would work and then quietly stop. A bearer token is
unaffected. The trade-off is that XSS could read it, so keep the frontend free of
injected markup.

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

**MinIO image.** MinIO pulled its Docker Hub images in September 2026, and `docker pull
minio/minio` now fails with a misleading "pull access denied" that looks like a login
problem. `docker-compose.yml` therefore pulls from `quay.io`, the remaining official
registry, and pins a specific hotfix tag — `latest` there still resolves to a year-old
build. Check for a newer tag before deploying, and note that MinIO has deprecated its
community images, so this moving target is worth revisiting.

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
- The admin token is a repo-write credential kept in `sessionStorage`. Use a
  fine-grained token scoped to this one repo with an expiry, and sign out on shared
  machines.
- The SSE fan-out is in-process, so run a single backend container. Two replicas would
  each only notify their own subscribers.
