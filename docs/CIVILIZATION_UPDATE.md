# Civilization Scale Update

> They started with a village. Watch them build a city.

This document records what the simulation did before this update, what had to change, and how the change was made. Every number on the site still comes from the simulation; nothing is invented for show.

## 1. Where the project stood

| System | Before this update |
|---|---|
| **World** | 208 × 44 × 208 voxels, generated once with five fully built villages: town hall, tavern, bakery, forge, store, clinic, guard post, press office, 10–14 houses each, paved squares, lamps. |
| **Buildings** | Generated buildings were finished from minute one. New buildings came only from rich residents (homes), businesses (shops) and tier-ups (civic), on six spare lots per village. |
| **Construction** | Real: builders fetch materials from the storehouse, carry them to the site and place blocks in blueprint order. Materials substitute when they run out. |
| **Resources** | Resource nodes (trees, ore, stone, clay, wool, crops) are gathered, carried and deposited in a village storehouse. Prices move with stock. |
| **Population** | 120 residents from the first minute, 24 per village. Migration between villages, no newcomers. |
| **Economy** | Wages, bread and tools from shops, rent, loans between residents, businesses with employees, village treasury and taxes, storehouse carts between villages. |
| **Progression** | A tier (Hamlet/Village/Town/City) from a weighted score. No requirements a player could read. |
| **Metrics** | Counters for decisions, memories and conversations; work counters for blocks, harvests and hauls. No per-resident contribution, no daily history of the world. |
| **Persistence** | Artifact store (or Postgres on the Node server): world/meta, world/core, world/feed, world/rumors, agents/sN, edits/eN, history/hN. Block edits were stored as a JSON map, four documents, about 85,000 edits at most. |

**The problem:** after 50 days the villages looked almost exactly like day 1. The work was real but the change was not visible.

## 2. What changed

### A world that starts small

* The generator still lays out the full master plan of each settlement, then **un-builds it**. What remains on day 1 is a **camp**: a storehouse, two or three small homes, one field, the mine or quarry, dirt paths.
* Every other building of the plan (bakery, market square, town hall, tavern, forge, store, clinic, guard post, press office, academy, family houses) becomes a **planned building** with a full blueprint. Nothing appears by itself: a planned building only rises when the village needs it and builders place it block by block.
* The un-building is deterministic, so every viewer rebuilds the same camp from the same seed and then applies the saved block edits.
* Each settlement starts with **6–8 founders**, chosen so that the camp can feed and house itself: a leader, builders, farmers or fishers, a woodcutter and a miner or quarrier. The other residents of the roster are **not here yet**.

### Population that follows housing

* Newcomers arrive only when there is a free bed in a finished house, food in the storehouse and, for trades, a workplace that exists. The roster's own residents come first, matched to the work the village lacks; after that, **new people are generated** with names that fit the settlement.
* How many people a settlement draws depends on its stage: 12 for a camp, 20 for a hamlet, 30 for a village, 48 for a town, 70 for a city (up to 350 in the valley), and always limited by free beds and food.

### Need → plan → build

A village decides what to build from what it lacks:

| Need | Building |
|---|---|
| Newcomers waiting, everyone crowded | family houses |
| No bread | bakery |
| Nowhere to trade | market square |
| 12+ people and no seat of government | town hall |
| Broken tools | forge |
| Evenings with nothing to do | tavern |
| Sick residents | clinic |
| Thefts | guard post |
| Town stage, many coins in pockets | **bank** |
| Storehouse overflowing | warehouse |
| Town stage, children and newcomers | school |
| City stage | market hall, watchtowers, townhouses of two or three storeys |

Every building follows the same visible path: **need identified → plan → gather → carry → foundation → walls → roof → interior → complete.**

### Settlement stages with readable requirements

| Stage | Residents | Buildings | Also needs |
|---|---|---|---|
| **CAMP** | – | – | – |
| **HAMLET** | 8 | 4 | a field producing food |
| **VILLAGE** | 16 | 9 | market square, town hall |
| **TOWN** | 26 | 16 | 4,500 coins of wealth (coins plus the value of its buildings), 40 blocks of paved street |
| **CITY** | 36 | 26 | a bank, 9,000 coins of wealth, 40 food a day |

The numbers are per settlement: there are five settlements in one valley. A stage is reached only when all of its requirements hold; nothing is unlocked by a timer. The site shows the next stage, the requirement checklist and a progress bar.

### Bigger buildings for richer people

Homes vary by owner wealth and stage: a wooden hut, cottage, stone house or manor, and from the Town stage on, **two- and three-storey townhouses** in brick and stone. Lots open further from the centre as the settlement grows, clearing trees where needed, so the settlement physically spreads.

### Roads

The **road builder** (engineer) trade upgrades streets: dirt paths become cobble at the Village stage and stone brick on the main streets at the Town stage, with lamp posts.

### Bank

Once built, the bank takes deposits (small daily interest), lends to owners who cannot pay for a building (home loans, business loans), collects repayments from wages and records defaults. A **banker** must be at work for loans to be issued. The bank's balance sheet is part of the world state.

### New trades

| Trade | Effect |
|---|---|
| **Builder** (changed) | When the storehouse is out of wood or stone, fetches it from the forest or quarry instead of waiting; with nothing ordered, joins the road crew. |
| **Transporter** | Carries materials from the storehouse to building sites, so builders can keep placing blocks. |
| **Engineer** | Upgrades roads and places street lamps. |
| **Banker** | Runs the bank: deposits, loans, repayments. |

Skills already rise with practice (0–100) and already change speed and yield. Materials now follow block-world logic (one log saws into four planks, one stone dresses into two bricks) and skilled builders waste less: from 15% extra at skill 0 to 15% saved at skill 100.

Tunnelling for iron, coal and gold brings up rubble (1.5 stone per unit of ore), so a mining town supplies the valley's builders and road crews; storehouse carts take stone to settlements without a quarry.

Surplus also leaves the valley: traders from outside buy stock above what a settlement needs, which is how coins enter the economy as it produces more.

### Metrics from real events

`world.metrics` holds lifetime counters, all incremented at the moment the event happens in the simulation:

`blocksPlaced, blocksMined, treesCut, cropsHarvested, seedsPlanted, farmTiles, hauls, buildingsCompleted, housesBuilt, businessesCreated, tradeVolume, arrivals, populationPeak, roadsPaved, loansIssued`

At midnight a **daily report** stores the day's difference and the totals (population, wealth, buildings, food), and every seventh day a **weekly report** compares the week with the one before and names its biggest event. Thresholds (first house, first market, population 25, first bank, new stage) are written to the permanent **world history**.

Each resident keeps **lifetime contribution** counters: blocks placed, blocks mined, trees cut, crops harvested, seeds planted, loads carried, buildings worked on and coins earned. Each finished building keeps **who built it**, which materials it used, the day it was finished, its value and its condition.

### Then / Now

The host saves an **aerial snapshot** of the whole valley (top block and height of every column, compressed) on days 1, 2, 3, 5, 7, 10, 14, 20, 30, 45, 60, 90, 120 and then every 30 days. The homepage compares the first snapshot with the latest one using a slider.

### Storage

* Block edits are now **packed** (sorted, delta-coded) and spread over 16 documents: several hundred thousand edits fit, enough for five cities.
* Relationship entries that were never touched are no longer stored.
* Snapshots are stored as `snaps/dN`, one document each.
* `world/core` stays small in long worlds: building records live once in `world/civ`, standing spots are recomputed from the lot, economy history keeps 24 rounded rows. The daily totals keep every day for the last 90 days and one day in five before that. A 200-day test world keeps `world/core` near 175 KB and `world/civ` near 105 KB, under the 256 KiB document limit.
* The Node server persists every document it receives, including snapshots and the metrics inside `world/core`.

## 3. Rollout

Worlds saved before this update were fully built from the start. They cannot be turned back into camps, so the shared world is **re-founded** on the first visit after the update, and the old world's history ends with a line saying so.
