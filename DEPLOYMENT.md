# Deployment

Nothing here was run during development (no network in the build sandbox). Treat it as a checklist and test in a staging environment first.

## Option A: Docker Compose (simplest)
```bash
cp .env.example .env
# edit .env: JWT_SECRET (32+ random chars), LLM_* and optionally IMAGE_* / EMBEDDING_MODEL
# set FRONTEND_URL to the address people will open, e.g. https://soulforge.example.com
docker compose up --build -d
```
The web container serves the frontend and proxies `/api` and `/uploads` to the backend, so everything is one origin and the login cookie works without extra CORS setup. Put HTTPS in front (Caddy, Traefik, a cloud load balancer, or nginx with certificates) and forward to port 8080.

## Option B: Manual
1. `npm run install:all && npm run build`
2. Backend: set the environment variables from `.env.example` (real environment variables in production, not a committed file), then `node backend/dist/server.js` under a process manager (systemd, pm2).
3. Frontend: serve `frontend/dist` as static files with a fallback to `index.html`, and proxy `/api` and `/uploads` to the backend (see `frontend/nginx.conf`). Disable response buffering for `/api/` so streamed replies arrive live.
4. MongoDB: use MongoDB Atlas or a managed instance with authentication, backups and a network allow-list.

## Production checklist
- `NODE_ENV=production` (secure cookies, no internal error details in responses). Serve over HTTPS only.
- `FRONTEND_URL` must exactly match the browser address (scheme, host, port). It controls CORS and the cross-site write check.
- `JWT_SECRET` is long, random, and not reused. Rotating it signs everyone out.
- Keep API keys only in the backend environment. They are never sent to the browser.
- Back up MongoDB and the `uploads` volume.
- Run `npm --prefix backend run cleanup:uploads` daily from cron to remove uploads that were never attached to a character.
- If you run more than one backend instance, replace the in-memory rate limiter store and the per-conversation generation lock with shared ones (Redis). Both are single-process today.
- Watch provider spend. Chat and story requests are limited to 20 per minute per user and portraits to 5 per minute, but you should also set spending limits with your AI provider.
- Public characters can be reported by users. Characters with 5 reports are hidden from discovery and chat until you review them (delete the character, or set `reportCount` back to 0 in MongoDB). There is no admin UI yet.

## Scaling notes
- Conversation history is stored once in `messages`; older turns are compressed into a summary on the conversation, so prompts stay bounded.
- Indexes exist for the main queries (owner and recency, discovery by popularity and date, favorites, memories per character). Search uses case-insensitive matching on name and description, which is fine for thousands of characters. For large catalogs, move to a text or Atlas Search index.
- Uploads are stored on local disk. For multiple servers, switch `services/uploads.ts` to object storage (S3 or similar).
