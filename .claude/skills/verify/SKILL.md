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
