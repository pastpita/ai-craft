# AI CRAFT — Block-World Style Update Plan

Goal: the project should read at first glance as **AI villagers living inside a block-built sandbox world**, not as an AI dashboard with a voxel demo attached.

All art stays original and generated in code. No textures, models, fonts, sounds, logos or names are taken from any existing game. We align with the *genre's* visual language (cubes, grass-topped dirt, readable materials, slot-based UI), not with any one product's assets.

## 1. Audit: what exists today

| Area | Current state | Verdict |
|---|---|---|
| Voxel engine (`world.js`, `render.js`) | 208×44×208 world, chunk meshing with AO, sky + torch light, day/night, rain, procedural 16px textures | **Keep.** Brighten the palette, add a sprout block, push materials toward clear grass / dirt / stone / wood reads. |
| World layout | 5 villages, plaza + well, homes, storehouse, tavern, forge, farms, mine, quarry, river, pier, pen, forests, roads, crossroads | **Keep.** Already a settlement with a centre, homes, farms, storage, workshop, mine entrance, forest edge, river, hills and lots. Add player-visible field expansion. |
| Simulation (`sim.js`, `society.js`, `civ.js`) | 120 residents, needs, memory, beliefs vs truth, gossip, crime, elections, economy, gathering, hauling, block-by-block construction, property, businesses, skills, scores | **Keep.** Make the work loops *visible*: till → plant → tend → harvest, chop → carry → store, fetch → carry → place. Add a task descriptor (CURRENT TASK + REASON) for every resident. |
| Shared world (`sync.js`, `net.js`, `server/`) | One clock, host lease, frames, take-over, Postgres server | **Keep** unchanged in behaviour; add a task channel so followers see live task text. |
| Brand | Lime/cyan voxel brain, "AI Village", dark stone UI | **Replace.** New name AI CRAFT, block-brain built from grass-topped dirt cubes, earthy palette. |
| Homepage | Brain hero, metrics, feeds, top minds, villages | **Replace the hero** with the live village itself (cinematic camera over villagers at work, task labels). Rebuild the section flow around gameplay. |
| HUD | Bevelled stone panels, parchment | **Restyle** into inventory-slot panels: plank headers, stone bodies, recessed slots, grass-block buttons. |
| Repo | Flat folder, plan doc, no README | **Restructure** into `web/`, `server/`, `docs/`, `assets/`, `tools/`, `tests/` with a premium README. |

## 2. Keep vs replace (summary)

**Keep:** engine, world generator, all simulation systems, shared-world sync, server, leaderboard / mind profile / villages / network / history pages (restyled).

**Replace:** brand mark, name, colour system, homepage hero and section flow, HUD skin, loading screen art, favicon.

**Add:** farming cycle with tilling and new fields, sprout block, task descriptors and a live task channel, cinematic "live village" camera, X/Twitter links, README + diagrams + screenshots, repo hygiene.

**Remove:** neon/glass leftovers (lime/cyan brain gradient), generic "AI" phrasing, assistant-branded strings and comments.

## 3. Visual direction

- Bright daylight sky, soft blocky clouds, saturated grass, warm dirt, cool stone, honey planks.
- Every surface reads as a material: grass tops with dirt fringe, log rings, plank seams, cobble, stone brick, thatch, wool, clay.
- UI echoes blocks: square frames, 2–3 px bevels, slot grids, pixel display face, small pixel icons. No rounded cards, no gradients, no glass.
- Copy is short and game-native.

## 4. Phases

1. Docs (this file, brand, README plan, behaviour upgrade).
2. Repo restructure + rename.
3. Block-brain mark (3D for hero/loading, 2D isometric for favicon/top bar, SVG/PNG exports for GitHub).
4. Behaviour: farming cycle, field expansion, task descriptors, gestures, palette.
5. UI skin + homepage with live world hero + X links + inspection panel.
6. README with banner, screenshots, GIF and diagrams.
7. Test (headless + browser), publish, package.

## 5. Naming note

Public copy says "block world", "sandbox", "voxel". It does not use third-party game trademarks in headlines or as a claim of affiliation. The README carries a short "not affiliated" line where the genre is named.
