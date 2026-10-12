<p align="center">
  <img src="assets/brand/banner.png" alt="AI CRAFT: every villager thinks for itself" width="100%">
</p>

<p align="center">
  <img src="assets/brand/block-brain.svg" alt="" width="84"><br>
  <b>A living block world where every villager has a mind.</b><br>
  120 autonomous villagers remember, plan, farm, chop, mine, build, trade, gossip and vote, on one shared clock that never stops.
</p>

<p align="center">
  <a href="https://x.com/AiCraftGame"><img alt="X @AiCraftGame" src="https://img.shields.io/badge/X-@AiCraftGame-111?style=flat-square&logo=x"></a>
  <img alt="License MIT" src="https://img.shields.io/badge/license-MIT-6fb043?style=flat-square">
  <img alt="Node 18+" src="https://img.shields.io/badge/node-18%2B-7b5434?style=flat-square&logo=node.js&logoColor=white">
  <img alt="three.js r128" src="https://img.shields.io/badge/three.js-r128-33322e?style=flat-square">
  <img alt="No build step" src="https://img.shields.io/badge/build-none-b8894f?style=flat-square">
  <img alt="Status" src="https://img.shields.io/badge/status-playable-8fd05a?style=flat-square">
</p>

<p align="center">
  <a href="#-run-it-locally">Run it</a> ·
  <a href="#-how-villagers-think">How villagers think</a> ·
  <a href="#-village-systems">Village systems</a> ·
  <a href="#-technical-architecture">Architecture</a> ·
  <a href="#-roadmap">Roadmap</a> ·
  <a href="https://x.com/AiCraftGame">Follow @AiCraftGame</a>
</p>

---

## ▣ What is AI CRAFT

AI CRAFT is a sandbox block world with five villages and 120 villagers who run their own lives. Nobody scripts them. Each villager has a personality, needs, memories, beliefs that can be wrong, goals, skills and relationships, and turns all of that into a concrete task: **till this field, carry that wood, put the roof on that cottage.**

You can walk the world in first person, fly over it as a spectator, click anyone to see **what they are doing and why**, talk to them, tell them rumours, help them work, or just watch a civilization grow. The world keeps running when you close the tab.

<p align="center">
  <img src="assets/screenshots/villagers-working.gif" alt="Villagers farming and hauling in the live world" width="80%">
</p>

> **Not scripted NPCs. Autonomous minds.** Every block you see placed, tilled or dug was placed, tilled or dug by a villager who decided to do it.

---

## ▣ Core features

| | | |
|:--|:--|:--|
| **Visible work**<br>Villagers till grass into farmland, plant, tend and harvest wheat, chop trees, mine ore, haul loads and place buildings block by block. | **Real decisions**<br>A utility engine weighs needs, goals, beliefs, relationships and personality. Every decision is logged with its inputs. | **Inspect any mind**<br>Current task and reason, needs, personality, memory, beliefs (true or false), skills, inventory and relationships. |
| **Memory that fades**<br>Importance × emotion × recency. Each mind holds only as much as its capacity allows; the rest is forgotten or summarised. | **Beliefs ≠ truth**<br>Rumours carry provenance hop by hop and can grow in the retelling. The world knows what really happened; villagers do not. | **Economy from the ground up**<br>Resource sites, storehouses, prices from stock, bakers and smiths, shops, businesses, wages, rent and loans. |
| **Villages grow**<br>New homes on free plots, new fields, workshops and civic buildings. Hamlet → Village → Town → City. | **Politics and crime**<br>Elections, campaigns, policies, thefts, witnesses, false testimony, investigations and wrongful arrests. | **One shared world**<br>One clock for everyone (a world day = 20 real minutes), persistent history, offline catch-up. |
| **A brain you can watch**<br>The homepage brain is built from the same blocks as the world. Each decision a villager makes runs across it as a line of light, with a card naming who decided what. | **Builders adapt**<br>When the storehouse runs out of clay or stone, builders change the plan and finish in what the village has. Owners who run short borrow from the village. | **The world in numbers**<br>Minds awake, decisions per minute, memories, conversations, beliefs, bonds, blocks placed, harvests and buildings, all counted live. |

---

## ▣ How villagers think

Each villager runs the same loop. Simulation code handles the physical world; the *mind* decides what to do with it.

```mermaid
flowchart LR
    P[Perceive<br/>events in sight,<br/>conversations, the paper] --> M[Remember<br/>importance × emotion × recency]
    M --> B[Believe<br/>claims with confidence<br/>and a source]
    B --> D{Decide<br/>utility over needs, goals,<br/>beliefs, relationships, traits}
    D --> T[Task<br/>till · plant · harvest · chop<br/>mine · haul · build · talk]
    T --> W[(World<br/>blocks, stock, money, people)]
    W --> P
    style D fill:#6fb043,color:#111,stroke:#3f7a25
    style T fill:#b8894f,color:#111,stroke:#7d5a30
```

### From memory to an action

```mermaid
flowchart TD
    subgraph Inputs
      N[Needs<br/>hunger · energy · company · safety · comfort]
      G[Goals<br/>build a bigger home · open a shop · become mayor · feed the village]
      R[Relationships<br/>trust · affection · respect · fear · resentment]
      BL[Beliefs<br/>“Finn stole from the store” 70% · from Arthur]
      ME[Memories<br/>strongest first, within capacity]
    end
    N & G & R & BL & ME --> U[Score every candidate plan]
    U --> C[Choose with depth-dependent noise]
    C --> TK[CURRENT TASK<br/>Placing blocks: walls of Ivo's cottage 54/143]
    C --> RS[REASON<br/>Ivo saved 180 coins for a cottage]
    TK --> LOG[(Decision log<br/>BEHAVIOR ENGINE or AI REASONING)]
```

Every decision records **PERCEIVED / BELIEVED / GOAL / RELATIONSHIP / DECISION / REASON**. These are the inputs and the outcome, not hidden reasoning. A decision is labelled **AI REASONING** only when a language model actually chose it (optional); everything else is **BEHAVIOR ENGINE**.

### Minds are measurable

Eleven scores (cognition, memory, social IQ, strategy, creativity, adaptability, influence, accuracy, deception, resourcefulness, survival) come from traits *and* measured behaviour, move at most two points a day and keep a daily history. Mind parameters are real inputs: **memory capacity** is the pruning limit, **think interval** sets how often a villager re-plans, **reasoning depth** sets how many options are weighed, **social model** sets how hard a liar's claims are discounted.

---

## ▣ Village systems

### Farm: till → plant → tend → harvest

```mermaid
flowchart LR
    G0[Grass] -- till --> F0[Farmland]
    F0 -- plant --> S1[Sprout]
    S1 -- grows ~half a day<br/>faster when tended or rained on --> W2[Ripe wheat]
    W2 -- harvest --> F0
    W2 -. carried .-> ST[(Storehouse)]
    ST -. food short and every plot busy .-> NF[A farmer pegs out<br/>a new field] --> G0
```

### Build: from savings to a finished house

```mermaid
flowchart LR
    A[Villager saves coins<br/>or a village tiers up] --> B[Commission at the town hall]
    B --> C[Blueprint on a free plot<br/>foundation · walls · roof · interior]
    C --> D[Builder fetches planks, cobble,<br/>stone brick, thatch from the storehouse]
    D --> E[Carries them to the site]
    E --> F[Places blocks one by one]
    F -- materials run out --> D
    F --> G[Owner moves in · property registered · rent, sale, inheritance]
```

### Resource economy

```mermaid
flowchart LR
    subgraph Sites
      T[Forest]:::w --> |chop| L(Wood)
      Q[Quarry / Mine]:::s --> |mine| O(Stone · Iron · Coal · Gold)
      F[Fields]:::g --> |harvest| WH(Wheat)
      R[River · Pen · Clay banks] --> |fish · shear · dig| X(Food · Wool · Clay)
    end
    L & O & WH & X --> |carry ≤ 8| SH[(Village storehouse<br/>pays by stock price)]
    SH --> BK[Bakery → bread] --> SHOP[Shops & market] --> V[Villagers eat, buy tools]
    SH --> FG[Forge → tools]
    SH --> BLD[Builders → houses, workshops, civic buildings]
    SH <--> |merchants walk the roads| OTHER[(Other villages)]
    classDef g fill:#6fb043,color:#111
    classDef w fill:#7b5434,color:#fff
    classDef s fill:#8a8a86,color:#111
```

### Village expansion

```mermaid
flowchart LR
    P[Production & population] --> TS[Tier score]
    TS -->|thresholds| TIER[Hamlet → Village → Town → City]
    TIER --> ROADS[Cobbled roads] & CIVIC[Watchtower · School · Library · Hall]
    CIVIC --> TECH[Tech points] --> P
    HOMES[New homes on free plots] --> P
    FIELDS[New fields] --> P
    MIG[Migration between villages] --> P
```

### Five villages

| Village | Identity | Works |
|---|---|---|
| **Highvale** | Politics and learning, home of the Academy | wheat, timber, quarry stone |
| **Ironridge** | Mines, forges and money | iron, coal, stone, a seam of gold |
| **Rivergate** | Traders and news on the river | fish, clay, wheat |
| **Greenhollow** | A farming cooperative | wheat, wool, timber |
| **Ashfield** | Poor, restless and quick with a knife | stone, scrub timber |

Each has its own mayor, election, guard, newspaper, treasury, stock, prices, tier and tech level. Villages trade, carry each other's news and keep relations scores.

---

## ▣ Inspect the mind

<table>
<tr>
<td width="50%"><img src="assets/screenshots/inspect-in-world.png" alt="Inspecting a villager in the world"></td>
<td width="50%"><img src="assets/screenshots/inspect-card.png" alt="Inspection card on the homepage"></td>
</tr>
<tr>
<td><b>Click anyone in the world.</b> Current task and reason, inventory slots, the need that matters most, personality, skills, recent memory and relationships.</td>
<td><b>The homepage shows a live one.</b> The busiest villager right now, updated as they work.</td>
</tr>
</table>

---

## ▣ Screenshots

<table>
<tr>
<td width="50%"><img src="assets/screenshots/hero.png" alt="Homepage: the living block brain over the village"></td>
<td width="50%"><img src="assets/screenshots/villagers-at-work.png" alt="Villagers at work in the fields"></td>
</tr>
<tr>
<td align="center">The living brain: every flash is a real decision, cards show who made it</td>
<td align="center">Farmers harvesting and hauling, tasks over their heads</td>
</tr>
<tr>
<td colspan="2"><img src="assets/screenshots/world-stats.png" alt="Live world statistics, thoughts and events on the homepage"></td>
</tr>
<tr>
<td colspan="2" align="center">The world right now: live counters, what villagers are thinking and what just happened</td>
</tr>
<tr>
<td><img src="assets/screenshots/minds-leaderboard.png" alt="Minds leaderboard"></td>
<td><img src="assets/screenshots/mind-profile.png" alt="Mind profile"></td>
</tr>
<tr>
<td align="center">Leaderboard of all 120 minds</td>
<td align="center">Mind profile: specs, scores over time, decisions</td>
</tr>
<tr>
<td><img src="assets/screenshots/villages-map.png" alt="World map and village rankings"></td>
<td><img src="assets/screenshots/brain-network.png" alt="Brain network of residents"></td>
</tr>
<tr>
<td align="center">World map, rankings and relations between villages</td>
<td align="center">The civilization as one brain network</td>
</tr>
<tr>
<td><img src="assets/screenshots/work-and-recipe.png" alt="How it works and the work counters"></td>
<td align="center"><img src="assets/screenshots/mobile-home.png" alt="Phone layout" width="46%"></td>
</tr>
<tr>
<td align="center">How a decision is “crafted”, and today's work</td>
<td align="center">Works on a phone too</td>
</tr>
</table>

---

## ▣ Technical architecture

No build step, no framework. Plain JavaScript modules that run unchanged in the browser **and** in Node, three.js for rendering.

```mermaid
flowchart TB
    subgraph Shared["Shared simulation (browser + Node)"]
      W[world.js<br/>voxel world, generator,<br/>A*, line of sight, lighting]
      C[cast.js<br/>villagers, roles, voices]
      SIM[sim.js<br/>needs, memory, beliefs,<br/>gossip, decisions, movement]
      SOC[society.js<br/>economy, crime, elections,<br/>papers, dialogue prompts]
      CIV[civ.js<br/>farming, gathering, hauling,<br/>construction, property, skills,<br/>scores, tasks, growth]
      SYNC[sync.js<br/>document layout, frames,<br/>visitor actions]
    end
    subgraph Browser
      NET[net.js<br/>host lease, followers,<br/>catch-up]
      R[render.js<br/>chunk meshing, textures,<br/>day/night, villagers]
      UI[ui.js · pages.js<br/>HUD, inspector, homepage,<br/>leaderboard, map, history]
      BR[brain.js<br/>block-brain mark]
      MAIN[main.js<br/>loop, cameras, input, audio]
    end
    subgraph Server["server/ (optional)"]
      SV[server.js<br/>always-on authority]
      PG[(PostgreSQL<br/>world_docs · history · events)]
    end
    W --> SIM --> SOC --> CIV --> SYNC
    SYNC --> NET --> UI
    SYNC --> SV --> PG
    R --> MAIN
    UI --> MAIN
```

### One shared world

```mermaid
sequenceDiagram
    participant H as Host (server or first tab with write access)
    participant DB as Shared store
    participant V as Every other viewer
    H->>H: advance the simulation on the global clock
    loop every second
      H-->>V: frame (positions, actions) · speech · events · tasks · block edits
    end
    loop every few seconds
      H->>DB: world/core · world/feed · agents/s0..s14 · edits · history
    end
    V->>H: visitor action (talk, give, tell, build)
    H-->>V: result
    Note over H,V: Host leaves → next writer takes the lease,<br/>replays the missed time and carries on.
```

| Document | Contents |
|---|---|
| `world/meta` | world id, clock anchor, save sequence |
| `world/core` | villages, shops, properties, businesses, projects, fields, crops, nodes, players |
| `world/feed` | events, mind feed, newspapers, conversation log |
| `agents/s0…` | residents, 8 per document (needs, memory, beliefs, scores, skills, tasks) |
| `edits/e0…e3` | block changes against the generated world |
| `history/h*` | permanent world history |

---

## ▣ Run it locally

**Requirements:** Node 18+. PostgreSQL is optional.

```bash
git clone <this repository> aicraft && cd aicraft
npm run setup            # installs the server's two dependencies
npm start                # http://localhost:8787 (world saved to server/world-data.json)
```

With PostgreSQL:

```bash
createdb aicraft
DATABASE_URL=postgres://user:pass@localhost/aicraft npm start
```

Static only (a private, unsaved world in your browser): serve `web/` with any static server and open `index.html`.

```bash
npm test                 # headless simulation smoke test
npm run simulate -- 5    # run 5 world days headless and print what happened
npm run brand            # regenerate assets/brand/block-brain.svg
```

| Env | Meaning |
|---|---|
| `PORT` | HTTP + WebSocket port (default 8787) |
| `DATABASE_URL` | PostgreSQL connection string; tables are created on boot |
| `AV_RESET=1` | start a brand-new world |
| `ANTHROPIC_API_KEY` | optional: featured villagers get occasional language-model decisions, labelled AI REASONING |

### Controls

`WASD` move · `Mouse` look · `E` talk · `Q` inspect · `LMB/RMB` break/place · `Tab` play/watch · `F` follow · `T` thoughts · `N` paper · `G` relationships · `M` minds · `L` logs

---

## ▣ Project layout

```
web/                 the game (open index.html)
  index.html         page, HUD and styles
  js/                world · cast · sim · society · civ · sync · net · render · brain · ui · pages · main
server/              always-on authority: Node + PostgreSQL + WebSocket
tests/               headless smoke test and day-by-day simulator
tools/brand.js       writes the block-brain SVG from the same voxel model the game uses
assets/brand/        block brain (SVG, PNG) and banner
assets/screenshots/  README images
docs/                design notes: style update, brand, behaviour, shared world
```

---

## ▣ Roadmap

- [x] Five villages, 120 villagers, one shared clock and persistent history
- [x] Memory, beliefs vs truth, rumour provenance, gossip
- [x] Farming cycle with new fields, gathering, hauling, block-by-block construction
- [x] Economy, businesses, property, rent, loans, migration, trade caravans
- [x] Elections, crime, investigations, newspapers
- [x] Mind scores, mind profiles, leaderboard, brain network
- [x] Inspection with current task and reason
- [ ] Seasons and weather that change crops and routines
- [ ] Animals in pens and pastures
- [ ] Bridges, wells and roads built by villagers on their own initiative
- [ ] Player-run shops and contracts with villagers
- [ ] Replays: scrub through a day of village history
- [ ] Modding hooks for new jobs, buildings and goals

---

## ▣ Community

Clips, updates and the occasional village scandal: **[@AiCraftGame on X](https://x.com/AiCraftGame)**.

Issues and pull requests are welcome. Keep code in plain JavaScript modules that run in both the browser and Node, and keep every claim in the UI true to what the simulation does.

## ▣ License

MIT. See [LICENSE](LICENSE).

<sub>AI CRAFT is an independent project with original code, art, textures and characters. It is inspired by sandbox block-building games and is not affiliated with or endorsed by any game studio.</sub>
