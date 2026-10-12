# AI CRAFT — shared-world server

One authoritative simulation for every visitor: one world clock (1 world day = 20 real minutes),
PostgreSQL persistence, WebSocket fan-out. The browser client detects the server automatically
(`GET /api/hello`) and becomes a follower that draws the server's frames.

```bash
cd server
npm install
createdb aivillage                       # or any Postgres you have
DATABASE_URL=postgres://user:pass@localhost/aivillage PORT=8787 npm start
# open http://localhost:8787
```

Without `DATABASE_URL` the server keeps the world in `server/world-data.json`.

| Env | Meaning |
|---|---|
| `DATABASE_URL` | Postgres connection string. Tables are created on boot (`schema.sql`). |
| `PORT` | HTTP + WebSocket port (default 8787). |
| `ANTHROPIC_API_KEY` | Optional. Featured residents then get a real language-model decision every ~20 s, labelled AI REASONING. |
| `AV_MODEL` | Model for those decisions (default `claude-haiku-5-5`). |
| `AV_RESET=1` | Start a brand-new world (wipes `world_docs`). |

Storage: `world_docs` holds exactly the documents the published page uses (`world/meta`, `world/core`,
`world/feed`, `world/rumors`, `agents/s*`, `edits/e*`, `history/h*`). `world_history` and `world_events`
are append-only logs for querying. If the server stops, the next start replays the missed time
(fine simulation for the last 6 world hours, a macro-day model before that).

WebSocket messages (`/ws`): server → `hello`, `docs`, `doc`, `f` (1 Hz frame), `b` (speech), `e` (events),
`m` (mind feed), `x` (block edits), `peers`, `rpcr`; client → `rpc {op, pid, args}`, `presence`.
