# SoulForge AI

Create AI characters, chat with them, give them memory, and write interactive stories with them.
React + TypeScript + Tailwind frontend, Express + TypeScript + MongoDB backend. AI providers are configurable (OpenRouter or Hugging Face for chat, Hugging Face or OpenAI-style APIs for portraits).

## Status

| Phase | Scope | State |
|---|---|---|
| 1 | Setup, UI foundation, auth, DB | Done |
| 2 | Landing page, dashboard, character creator and library | Done |
| 3 | AI provider layer, streaming one-to-one chat | Done |
| 4 | Persistent memory, summaries of older history | Done |
| 5 | Interactive stories with structured state | Done |
| 6 | Public discovery, favorites, sharing, reporting | Done |
| 7 | AI portraits, tests, security pass, deployment docs | Done |

**Important:** this code was written without network access. Dependencies were never installed and nothing was compiled, run, or tested against a real database or AI provider. Expect to fix small type or version issues on first run. Start with `npm run typecheck` in `backend` and `frontend`, then `npm test`.

## Features

**Accounts:** register, login, logout, profile, delete account (removes all your data). bcrypt, JWT in an httpOnly cookie, validation, rate limits, cross-site write protection.

**Characters:** full creator (identity, personality, voice, story, relationship, scenario, greeting, example dialogues), live preview, drafts, publish, private or public, duplicate, delete, portrait upload (checked by file bytes) or AI generation. "Try a conversation" tests a draft before publishing.

**Chat:** streamed replies with a typing indicator, regenerate, retry, delete, saved in MongoDB. The prompt is built from the character card, scenario, relevant memories, a summary of older messages, and recent history. Narration in *asterisks* is shown separately from dialogue.

**Memory:** after every few messages the model is asked whether anything is worth remembering for the long term (facts you shared, events, relationship changes, preferences). Saving nothing is the expected outcome most of the time. Near-duplicates are skipped. Replies retrieve only memories related to what you just said (semantic search if `EMBEDDING_MODEL` is set, keywords otherwise). You can view, add, edit and delete memories on the Memories page. Long conversations are compressed into a rolling summary.

**Stories:** choose genre, setting, opening situation and cast. Each scene is streamed and saved with a structured state (current scene, key events, open and resolved plot threads, relationships, participants) that is fed back into the next scene. Suggested choices appear when the model sees a real decision, and you can always write your own action. Add or remove cast members mid-story. New characters introduced by the narrator are tracked.

**Discovery:** search, category and personality filters, popular or newest sort, load-more pagination, greeting previews, creator names, favorites, public character pages with a share link. Only published public characters appear, and other people see a limited public card (no backstory, scenario or goals). Users can report characters; at 5 reports a character is hidden until reviewed.

## Run locally

Requires Node 20+ and MongoDB.

```bash
npm run install:all
cp .env.example backend/.env       # set MONGODB_URI and JWT_SECRET, plus AI keys
npm run dev:backend                # http://localhost:4000
npm run dev:frontend               # http://localhost:5173
```

Tests (use an in-memory MongoDB, downloaded on first run):
```bash
npm test
```

Docker and production: see [DEPLOYMENT.md](DEPLOYMENT.md).

## Configuration

| Variable | Required | Notes |
|---|---|---|
| `MONGODB_URI`, `JWT_SECRET` | yes | `JWT_SECRET` needs 32+ random characters |
| `PORT`, `NODE_ENV`, `JWT_EXPIRES_IN`, `FRONTEND_URL` | no | defaults in `.env.example`; `FRONTEND_URL` must match the browser address in production |
| `LLM_PROVIDER`, `LLM_API_KEY`, `LLM_MODEL` | for chat, stories, memory | without them the app runs and shows a setup message |
| `LLM_BASE_URL`, `LLM_STREAMING`, `LLM_TIMEOUT_MS`, `LLM_MAX_TOKENS`, `LLM_TEMPERATURE` | no | tuning |
| `ALLOW_MATURE_CONTENT` | no | default `false`. When `true`, characters and stories can be rated 18+ (see below) |
| `EMBEDDING_MODEL` | no | enables semantic memory search; must be served by your provider's `/embeddings` |
| `IMAGE_PROVIDER`, `IMAGE_API_KEY`, `IMAGE_MODEL` | for AI portraits | uploads work without them |
| `IMAGE_BASE_URL`, `IMAGE_TIMEOUT_MS` | no | tuning |

Never commit real credentials. API keys are only read by the backend.

## Keeping chat fast

Each reply sends the model only the last `CHAT_HISTORY_MESSAGES` messages (default 8, capped at `CHAT_HISTORY_CHARS`) plus up to `MEMORY_RETRIEVE_LIMIT` relevant memories. Everything older is not sent. Important facts and events are saved as memories every `MEMORY_EVERY_MESSAGES` of your messages (default 6), and that background step is cancelled the moment you send another message, so it never delays a reply. The rolling summary is off unless `CHAT_SUMMARY=true`. With Ollama, also set `OLLAMA_KEEP_ALIVE=30m` so the model stays loaded between messages.

## Content ratings and Ollama

- **Ollama:** set `LLM_BASE_URL=http://localhost:11434/v1`, `LLM_API_KEY=ollama` (any value), `LLM_MODEL=<name from ollama list>`, and a longer `LLM_TIMEOUT_MS` (e.g. 180000).
- **18+ switch:** `ALLOW_MATURE_CONTENT=true` lets you rate a character or story "Mature (18+)". Mature characters need an age of 18 or older, can never be public, never appear in Explore, featured, favorites or other people's chats, and mature stories accept adult characters only. Mature mode relaxes the general-audience wording in the prompts.
- **Always on:** every prompt keeps a rule against sexual content involving anyone under 18. This is not configurable. Portrait prompts stay "safe for work".
- The app cannot change what a model is willing to write. If your Ollama model refuses something, that comes from the model's own training, and a different model is the only fix.

## Architecture

```
backend/src
  config/       env validation, database
  models/       User, Character, Conversation, Message, Memory, Story, StoryScene, Favorite, Report
  routes/ controllers/ validators/ middleware/
  services/
    ai/         AIProvider interface, OpenAI-compatible base, OpenRouterProvider, HuggingFaceProvider,
                CharacterPromptBuilder, image providers
    memoryService, postReplyTasks (memories + summaries), storyEngine, uploads, accountCleanup
frontend/src    pages, components, layouts, hooks, api clients, context, types
```

- Add a chat provider by implementing `AIProvider` (or extending `OpenAICompatibleProvider`) and registering it in `services/ai/index.ts`. Add an image provider in `services/ai/image/index.ts`.
- The app only relies on plain chat completions. It does not assume tool calling, image input or long context. Streaming falls back automatically if a model returns plain JSON, and `LLM_STREAMING=false` turns it off.
- No fake AI output exists in production code. Tests use scripted providers only inside the test suite.
- Provider errors (bad key, no credits, unknown model, rate limit, timeout, outage) are shown as such. A failed reply is never saved as if it succeeded.

## Known limitations

- Rate limiting and the one-reply-at-a-time lock are in memory (single server process).
- Search uses regular expressions on name and description; fine for modest catalogs.
- Uploads live on local disk.
- No admin interface for reviewing reports yet.
- Memory extraction and summaries run as extra AI calls after replies, which adds cost. They are skipped when fewer than 3 new user messages have arrived (memory) or fewer than 40 unsummarized messages exist (summary).
- Image and embedding provider integrations follow each provider's documented HTTP shape but could not be verified without credentials.
