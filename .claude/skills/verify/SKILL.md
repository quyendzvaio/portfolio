---
name: verify
description: Boot this repo's backend from an env file and drive its HTTP API to observe a change at runtime.
---

# Verify (backend / env template)

No Docker build needed. Compile once, then boot `server/dist` against a scratch env file:

```bash
npm run build:server
cp .env.server.example "$TMP/a.env"          # edit values with sed as needed
PORT=18787 node --env-file="$TMP/a.env" server/dist/index.js > "$TMP/a.log" 2>&1 &
curl -s localhost:18787/api/health          # {ok, storage, admin, llm}
```

- The shell `PORT` beats the file's `PORT=8787` (`--env-file` never overrides existing env), so stay off 8787 in case the compose backend is running.
- Dummy values are enough to flip readiness: `BLOB_READ_WRITE_TOKEN`, `ADMIN_PASSWORD` + `GITHUB_TOKEN` (with the template's `GITHUB_REPO`). `/api/health` and the boot log show the result.
- Admin flow without touching GitHub: `POST /api/login {"password":...}` → token, then `GET /api/me -H "authorization: Bearer $TOK"`. Restart with a different `SESSION_SECRET` to check that old tokens are rejected.
- Rate limits are checked before Blob is used: with a dummy Blob token, `POST /api/comments/x/bad!id/reactions` returns 400, then 429 once `REACTIONS_PER_WINDOW` is used up. That path makes no network calls.
- Compose parsing of an env file: copy `docker-compose.yml`, point `env_file` at the scratch file, then run `docker compose -f <copy> --project-directory . config`.
- Don't drive `PUT /api/profile` with a real `GITHUB_TOKEN`: it commits to the repo.

## Full flows without real Blob/GitHub

`fake-backends.mjs` (next to this file) uses undici's `MockAgent` to replace Blob and the GitHub Contents API in memory, so comments, reactions, avatars and profile saves all run against the unmodified server:

```bash
# the token's 4th "_" field is the store id the fake answers for
sed -i 's/^BLOB_READ_WRITE_TOKEN=.*/BLOB_READ_WRITE_TOKEN=vercel_blob_rw_dummyx_secret/' "$TMP/a.env"
FAKE_PROFILE='{"name":"T","avatar":"","links":[]}' PORT=18787 \
  node --env-file="$TMP/a.env" --import ./.claude/skills/verify/fake-backends.mjs server/dist/index.js
```

- Each fake call is logged as `[fake] put|get|list|del|github ...`. Use that log to check write and delete order, and whether a read used `(cache=0)`.
- `FAKE_LEGACY_AVATAR=<bytes>` seeds a pre-versioning `assets/avatar.png`. With `FAKE_GH_FAIL=1`, `kill -USR2 <pid>` makes GitHub reads return 502.
- UI: start `VITE_API_BASE_URL=http://localhost:18787 npx vite --port 5199 --strictPort` with the server's `FRONTEND_ORIGIN=http://localhost:5199`. Then drive `google-chrome --headless=new --remote-debugging-port=9333` over CDP with Node's global `WebSocket`. Playwright isn't installed.
- React's `onMouseEnter` (the reaction bar) needs a real `Input.dispatchMouseEvent` `mouseMoved`; a synthetic DOM event doesn't trigger it.
