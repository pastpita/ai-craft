# AI CRAFT — shared-world server

One authoritative simulation for every visitor: one world clock (1 world day = 40 real minutes),
PostgreSQL persistence, WebSocket fan-out. The browser client detects the server automatically
(`GET /api/hello`) and becomes a follower that draws the server's frames.

```bash
cd server
npm install
createdb aivillage                       # or any Postgres you have
DATABASE_URL=postgres://user:pass@localhost/aivillage PORT=8787 npm start
# open http://localhost:8787
```

Without `DATABASE_URL` the server keeps the world in `server/world-docs/`, one JSON file per document (`AV_DIR` to move it). A save writes only the documents that changed, every 45 s (`AV_SAVE_MS`).

| Env | Meaning |
|---|---|
| `DATABASE_URL` | Postgres connection string. Tables are created on boot (`schema.sql`). |
| `PORT` | HTTP + WebSocket port (default 8787). |
| `ANTHROPIC_API_KEY` | Optional. Featured residents then get a real language-model decision every ~20 s, labelled AI REASONING. |
| `AV_MODEL` | Model for those decisions (default `claude-haiku-5-5`). |
| `AV_RESET=1` | Start a brand-new world (wipes `world_docs`). |

Storage: `world_docs` holds exactly the documents the published page uses (`world/meta`, `world/core`,
`world/civ`, `world/feed`, `world/rumors`, `agents/s*`, `edits/e*`, `history/h*`, `snaps/d*`). `world_history`
and `world_events` are append-only logs for querying. `world_metrics` gets one row per finished world day
(population, wealth, buildings, houses, blocks placed and mined, trees cut, crops, farm tiles, trade volume,
businesses, plus the full row as JSON) and `world_metrics_totals` keeps the running counters.
A world saved before the civilization update (schema < 3) is re-founded as five camps on boot.

HTTP: `GET /api/hello`, `/api/world`, `/api/history`, `/api/metrics` (totals, daily rows, latest reports),
`/api/snaps` (aerial snapshots). If the server stops, the next start replays the missed time
(fine simulation for the last 6 world hours, a macro-day model before that).

WebSocket messages (`/ws`): server → `hello`, `docs`, `doc`, `f` (1 Hz frame), `b` (speech), `e` (events),
`m` (mind feed), `x` (block edits), `peers`, `rpcr`; client → `rpc {op, pid, args}`, `presence`.
