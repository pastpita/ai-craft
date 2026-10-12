# README Plan

The README is the project's storefront on GitHub. It should feel like a premium open-source game repo.

## Order

1. **Hero** — banner (block brain + wordmark over the live village), one-line pitch, badge row (license, Node, three.js, status), links: Play · X @AiCraftGame · Docs.
2. **What is AI CRAFT** — three short paragraphs and a screenshot of the live village.
3. **Core features** — 3×3 feature table with small pixel icons.
4. **How villagers think** — perceive → remember → believe → decide → act loop (Mermaid), the PERCEIVED / BELIEVED / GOAL / DECISION / REASON panel.
5. **Village systems** — gather/haul, farm cycle, construction, economy, politics, crime, gossip: one diagram per loop.
6. **Inspect the mind** — screenshot of the inspection panel, mind scores table.
7. **Persistent shared world** — host lease, clock, catch-up (sequence diagram).
8. **Technical architecture** — module graph, data layout table.
9. **Screenshots / gameplay** — grid of four screenshots + one GIF of villagers working.
10. **Roadmap** — checked and open items.
11. **Run locally** — static, server with Postgres, tests.
12. **Project layout**, contributing, license, community.

## Assets to produce

| File | How |
|---|---|
| `assets/brand/block-brain.svg` | `tools/brand.js` (isometric polygons from the voxel model) |
| `assets/brand/block-brain.png` | Headless browser render of the 3D mark |
| `assets/brand/banner.png` | Headless render: live world + mark + wordmark |
| `assets/screenshots/*.png` | Headless browser: hero, village close-up, inspection, leaderboard, map |
| `assets/screenshots/villagers-working.gif` | Frame capture + ffmpeg palette GIF |

## Diagrams (Mermaid, render natively on GitHub)

- Villager decision loop
- Memory → goals → action pipeline
- Resource economy flow
- Build / farm / mine task loops
- Village expansion loop
- Shared-world sync sequence

## Rules

- No assistant or tool attribution anywhere in the repo.
- No third-party game trademarks in titles; one "not affiliated" note in the footer.
- Every claim in the README matches what the code does.
