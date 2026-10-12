# AI CRAFT — Shared World Design

From "50 villagers in one voxel village" to **a live, shared civilization of AI minds**:
5 villages, ~120 residents, one world clock, one persistent history, visible minds.

## 1. Current architecture (V1)

| File | Role | Runs in |
|---|---|---|
| `world.js` | Voxel grid 96×40×96, block registry, single-village generator, walk grid, A*, line of sight, raycast, torch light | browser + Node |
| `cast.js` | 12 hand-written core villagers, voices, name/palette pools for 38 generated villagers | browser + Node |
| `sim.js` | Agent core: needs, utility decisions, movement, conversation, beliefs vs truth, gossip with provenance + distortion, memory + decay, event bus | browser + Node |
| `society.js` | Economy, crime + investigation, Village Post, elections, construction, secrets, player social footprint, LLM prompt building + validation, serialize/load, offline catch-up | browser + Node |
| `render.js` | Texture atlas, chunk meshing with AO + sky/torch light, day/night shader, sky, rain, voxel villagers | browser |
| `ui.js` | HUD, feed, inspector, dialogue, paper, graph, dev tools | browser |
| `main.js` | Boot, localStorage save, loop, first-person physics, spectator camera, audio, LLM provider | browser |

State lives in one object `S` (agents, events, rumors, shops, town, election, econ, …).
Persistence: whole `S` serialized to **localStorage** every 20 s; time missed while away is replayed on load (capped at 4 days).

## 2. What is preserved

Everything that works stays and is extended, not replaced:

- Voxel engine (meshing, lighting, collision, raycast, A*), first-person and spectator modes.
- Beliefs vs truth, rumor chains with provenance and distortion, interpretation by personality.
- Memory model (importance × emotion × recency, nightly pruning, social summaries, semantic beliefs).
- Crime, witnesses, false testimony, investigation, wrongful arrests, overturned cases.
- Elections, campaigns, mayor policies, protests. Village Post (one paper per village now).
- Relationships (8 axes), reputation of visitors, inspector, relationship graph, dev tools.
- LLM-assisted dialogue, decisions and columns with JSON validation and deterministic fallback.

## 3. What migrates

| V1 | V2 |
|---|---|
| One village, places keyed `bakery`, `tavern`… | Five villages; places keyed `<village>_<kind>` (`highvale_bakery`). Agent code keeps using kinds through a **village context** (`Sim.useVillage(vid)`) that resolves kinds and swaps in that village's town, election, shops and stock. This keeps V1 logic intact. |
| Global `S.town`, `S.election`, `S.econ`, `S.shops` | `S.villages[vid].{town, election, econ, shops, flags}`; the context swaps them into `S.*` while that village is processed. |
| Single player `'you'` | `S.players[pid]`, one per visitor. Villagers keep a reputation row per visitor (`rel['p_…']`). |
| Abstract `econ.grain` / `econ.ore` | Village storehouse stock of WOOD, STONE, IRON, COAL, FOOD, CLAY, WOOL, GOLD, fed by agents who physically walk to finite/renewable resource nodes, gather, carry and deposit. |
| Instant-ish shop construction | Projects with blueprints, material requirements, hauling, stages (plan → gather → foundation → walls → roof → complete), homes and businesses. |
| localStorage save | Authoritative shared store (see §5). localStorage keeps only preferences (sound, AI toggle, camera). |

### localStorage state that moves server-side

`aivillage.save.v3` held: clock, agents (needs, money, inventory, plans, beliefs, memories, relationships, summaries, secrets, decisions), events, feed, news, crimes, cases, rumors, shops, econ history, town, election, projects, extra places, heatmaps, world block edits, player state. **All of it** moves to the shared store. Only `aivillage.settings.v1` (sound, language-model opt-in, camera, last page) remains local.

## 4. Backend schema

Two deployments share one simulation core and one document layout.

### 4a. Document layout (used by both)

| Doc key | Contents | Write cadence |
|---|---|---|
| `world/meta` | world id, generation seed, clock anchor (`epochReal`, `t0`, `rate`), save sequence, authority holder | 10 s |
| `world/core` | villages (town, election, stock, prices, tier, tech, relations), shops, properties, businesses, projects, secrets, cases, crimes, players, resource nodes, weather | 15 s |
| `world/feed` | recent events, live mind feed, newspapers, conversation log, LLM prompt log | 10 s when changed |
| `world/rumors` | rumor chains still referenced by a belief (hops capped) | 30 s |
| `agents/s0…s9` | residents, sharded 12 per doc (needs, money, skills, scores + history, beliefs, memories, relationships, decisions) | round-robin, one shard / 3 s |
| `edits/e0…e3` | block edits vs the generated world (compacted: restored blocks are dropped) | when changed |
| `history/h<n>` | permanent world history, 400 entries per page | when appended |

### 4b. PostgreSQL (Node server deployment)

```sql
create table world_docs (key text primary key, body jsonb not null, updated_at timestamptz default now());
create table world_history (id bigserial primary key, day int, t double precision, kind text, village text, text text, created_at timestamptz default now());
create table world_events (id bigserial primary key, day int, t double precision, type text, village text, actor text, text text, truth text, created_at timestamptz default now());
create index on world_events (day);
```
`world_docs` stores exactly the documents in 4a, so the client sync code is identical. History and events are also appended row-by-row for querying.

## 5. Realtime architecture

**Authority** = the only process that advances the simulation and writes state.
**Followers** render, interpolate and send actions.

| | Node deployment | Published artifact (no server process available) |
|---|---|---|
| Authority | `server/server.js` ticking continuously | One open browser tab holding a 20 s **lease** on `world/meta` (renewed every 6 s). If it closes, the next tab acquires the lease and continues from the saved state. |
| Persistence | PostgreSQL `world_docs` | Artifact shared database (same doc keys) |
| Live frames | WebSocket broadcast | Room channel (`f`, `b`, `e`, `x` topics) |
| Visitor actions | WS `rpc` → server executes → reply | Room `rpc` topic → authority tab executes → reply |
| Offline time | Server never stops | Next authority replays the gap: fine simulation for the last 6 world hours, a cheap **macro-day model** for days before that |

**World clock:** `t = t0 + (Date.now() − epochReal) / 1000 × 1.2` world minutes. Everyone computes the same time; 1 world day = 20 real minutes.

**Frames** (1 Hz, ≤ 4 KB): `[agentIndex, x×10, z×10, dir×100, flags, carry]` for every resident + heartbeat counters. Followers dead-reckon between frames.
**Reconnect:** show *SYNCING WORLD…*, read all docs, subscribe, resume. The world is never reset by a client.

## 6. Score formulas

All scores are 0–100, derived from **traits** (fixed) and **behavior counters** (measured). Displayed scores move toward their target by at most ±2 per world day (`s += clamp((target − s) × 0.25, −2, 2)`), and a daily history row is stored.

| Score | Trait base | Behavior component (measured) |
|---|---|---|
| Memory | `capacity = 40 + 25·C + 15·O + 10·(1−N)` (this is the real pruning limit) | recalls used in conversation |
| Social IQ | `25 + 15·A + 20·empathy + 10·E + 10·O` | conversations held, campaign promises that matched actual votes |
| Strategy | `20 + 25·C + 20·ambition + 10·(1−laziness)` | goals achieved (home built, business opened, elected), predictions kept |
| Creativity | `20 + 35·O + 20·curiosity` | entropy of the last 40 decision types |
| Adaptability | `25 + 20·O + 15·risk + 15·(1−N)` | re-plans after failures, job switches, avoided conflicts |
| Influence | `15 + 20·E + 10·sociability` | respect others hold, listeners who adopted their claims, office held |
| Accuracy | — | confidence-weighted share of their beliefs that match world truth (rumor chains know the truth) |
| Deception | `30·(1−honesty) + 10·E` | lies believed ÷ lies told, minus exposures |
| Resourcefulness | `20 + 15·C + 10·curiosity` | earnings and resources gathered vs village peers |
| Survival | — | rolling average of hunger/energy, share of days sick |
| **Cognition** | composite: `.18 Memory + .16 Social + .20 Strategy + .10 Creativity + .10 Adaptability + .16 Accuracy + .10 Influence` | |

**Mind parameters are real inputs to behavior**, not labels:
- *Memory capacity* = pruning limit. *Think interval* = minutes between decisions. *Reasoning depth* (LOW/MED/HIGH, from Strategy) = how many options and listeners are evaluated and how much noise enters the choice. *Social model* (WEAK/MED/STRONG, from Social IQ) = how strongly a listener discounts claims from people they believe are liars.
- *Mind type* comes from the dominant trait pattern (Planner, Social, Opportunist, Memory-heavy, Creative, Cautious, Chaotic, Logical, Manipulator, Generalist). *Mind version* `v1.n` increments each time cumulative score change since the last version reaches 5.
- Labels are honest: a decision shows **AI REASONING** only when the language model produced it; otherwise **BEHAVIOR ENGINE**.

## 7. Village expansion approach

World 208×208 with five settlements on flat ground, connected by roads through hills, a river and a mountain:

| Village | Identity | Resources | Trait bias |
|---|---|---|---|
| Highvale | politics, education (Academy) — the V1 cast lives here | food, wood, stone | openness, conscientiousness, curiosity |
| Ironridge | mining, industry, wealth | iron, coal, stone, gold | conscientiousness, greed |
| Rivergate | trade, merchants, information | fish, clay, food | extraversion, curiosity, greed |
| Greenhollow | agriculture, cooperative | food, wool, wood | agreeableness, honesty |
| Ashfield | poor, chaotic, crime-heavy | stone, wood | low honesty, high neuroticism, low money |

Each village has its own mayor, election, guard, paper, treasury, stock, prices, tier (Hamlet → Village → Town → City), tech level, trust, crime and happiness. Villages trade (merchants physically walk the roads), exchange news (travellers carry beliefs), attract migrants and keep a relations score with each other.

## 8. Implementation phases

1. **Shared world:** document layout, authority lease, global clock, frames, RPC, reconnect; Node + Postgres + WS server.
2. **Brain-first client:** loading brain, homepage, orbiting minds, camera jump.
3. **Minds:** scores, mind types, history, leaderboard, Mind Profile, decision summaries.
4. **Villages:** five-village world, per-village politics/economy/paper, world map, rankings.
5. **Resources:** nodes, gathering, hauling, storehouse, prices from stock.
6. **Construction:** material-driven projects, homes by wealth/role, property, rent, sale, inheritance.
7. **Residents and actions:** 120 residents, skills, businesses, hiring, lending, migration, teaching.
8. **Inter-village:** trade, relations, global events, permanent history.

## 9. Status after the upgrade

Built: everything in phases 1–8.

- `sync.js` (document split, rebuild, frames, visitor actions), `net.js` (artifact / server / local transports, host lease, follower interpolation, take-over, projection for viewers), `server/` (Node + Postgres + WebSocket).
- `civ.js` (resources, hauling, storehouses, material-driven construction, property, rent, sales, businesses, hiring, loans, skills, migration, trade, carts, tiers, tech, world events, mind scores and types, decision summaries, mind feed, history, macro-day catch-up).
- `brain.js` (voxel brain, loading sequence, favicon, heartbeat mark), `pages.js` (home, MINDS, Mind Profile, villages map and rankings, brain network, history).

Known limits:
- In the published page there is no always-on process. The world advances whenever any tab with write access is open (that tab hosts); when nobody is, the next host replays the gap on arrival. Viewers alone see a local projection until a host appears.
- Viewers (below Contributor) can watch everything but cannot talk to residents or change blocks; the shared store and room only accept their reads.
- The server is plain Node.js (CommonJS), not TypeScript.
