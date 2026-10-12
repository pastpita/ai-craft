# World Behaviour Upgrade

Goal: a first-time visitor should see, within seconds, villagers *doing work* — not wandering.

## Visible work loops

| Loop | Steps the player sees | Blocks that change |
|---|---|---|
| **Farm** | walk to field → **till** grass into farmland → **plant** seeds → **tend** sprouts → **harvest** ripe wheat → **carry** to storehouse | grass → farmland → sprout → crop → air |
| **New fields** | when food runs short and every plot is planted, a farmer pegs out a new field next to the village and tills it cell by cell | grass → farmland, water channel every fourth row |
| **Wood** | walk to forest edge → **chop** (leaves, then trunk from the top) → **carry** logs → deposit; stumps regrow | log/leaves → air → regrowth |
| **Mine / quarry** | walk into the mine or quarry → **mine** ore or stone → carry → deposit | ore/stone → stone/air |
| **Build** | builder **fetches** materials at the storehouse → **carries** them → **places** blocks in order: foundation, walls, roof, interior | air → planks/cobble/brick/thatch … |
| **Night** | everyone **walks home** at dusk and sleeps | — |
| **Growth** | new homes on free plots, workshops, civic buildings, road upgrades when a village tiers up | lots fill in over days |

## Task descriptor

Every resident carries a live `task`:

```
CURRENT TASK   Placing blocks: walls of Ivo's cottage (54 / 143)
REASON         Ivo saved 180 coins and commissioned a bigger home
```

- Computed by the host each minute from the plan, gather/build stage, project and goals.
- Broadcast as a small live channel (`k`), so every viewer sees task changes within two seconds.
- Shown in: labels over heads (watch mode), the inspector, the Mind Profile, the homepage hero.

## Inspection panel (click a villager)

Name · role · personality traits · current need · CURRENT TASK · REASON · recent memory · relationships · inventory / carried load · skills (builder, farmer, miner, trader …).

## Gestures

| Action | Animation |
|---|---|
| chop / mine / place | overhead swing |
| till / plant | crouch + reach down |
| tend | sweep with arms low |
| carry | both arms forward, coloured crate (wood brown, stone grey, wheat gold …) |
| sleep | lying down |

## Data changes

- `S.farms[nodeId]`: crop state per farmland cell (`0` bare, `1` sprout, `2` ripe) and planting time.
- `S.fields`: player-visible fields created during play (cells, tilled count); rebuilt into world nodes on load.
- New block `sprout` (id 31) with its own texture.
- `a.task = { t, r }` on every resident; live channel `k` for followers.
