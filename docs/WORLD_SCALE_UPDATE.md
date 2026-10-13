# World Scale Update

A larger valley, five biomes, building styles per settlement and landmarks the residents raise themselves. The world clock runs at half speed.

## World

| | Before | Now |
|---|---|---|
| Size | 208 × 44 × 208 blocks | 320 × 60 × 320 blocks (2.4× the area) |
| Layout | settlements, river, mountain, forests | the same layout scaled by 1.5, settlements 25% wider, a mountain range up to 30 blocks high, a lake, a jungle |
| Clock | 1 world day = 20 real minutes | 1 world day = 40 real minutes (`Sync.RATE = 0.6`) |
| Population cap | 70 per city | 100 per city (500 in the valley) |

## Biomes

Every column has a biome (`World.biomeAt(x, z)`): the land around each settlement, warped by noise so borders wander, plus the mountain, the lake, a jungle in the south-west and a snowy northern edge.

| Biome | Ground | Terrain | Flora |
|---|---|---|---|
| snow (Highvale) | snowy grass, snow on hills | high hills | spruce forests |
| badlands (Ironridge) | red sand over banded terracotta | flat-topped mesas | dead trees, a few oaks |
| swamp (Rivergate) | swamp grass, mud | flat, with pools | swamp oaks with vines, reeds |
| meadow (Greenhollow) | grass | rolling | oak and birch, flowers, tall grass |
| desert (Ashfield) | sand over sandstone | dunes | cacti, dead bushes, a palm oasis |
| jungle | grass | hills | giant 2×2 trees with vines, palms |
| mountain | stone, snow above 20 blocks | peaks | spruce on the lower slopes |
| lake | sand shores | water up to 5 deep | palms and birch on the shore |

34 new blocks with original procedural textures: snow, snowy grass, spruce / birch / jungle wood and leaves, cactus, red sand, three terracottas, sandstone, cut sandstone, mud, mud brick, swamp grass, flowers, tall grass, dead bush, reeds, vines, ice, stained glass, clock face, gold block, dark planks, mossy cobble, marble, copper roof, lantern.

## Building styles

Each settlement has a style (`World.VILLAGES[i].style`): wood, stone and fine wall materials, corner posts, trim, roof materials, roof shape and ground. Blueprints name a material class (`mat: 'wood' | 'stone' | 'fine'`) and the style turns it into real blocks. Roof shapes: gable, steep, hip, flat with parapet, dome, spire (`World.roofCells`). Homes add chimneys, balconies, turrets and door lanterns by tier. In the snow the first homes are igloos; homes take local names (mud-brick hut, sandstone house, lodge, palace).

## Landmarks

Eleven landmark generators in `civ.js` (`LANDMARK`): fountain, windmill with sails, statue, lighthouse, clock tower, observatory, greenhouse, step pyramid, cathedral, castle keep, arena. `Civ.growth` starts one at a time when the settlement has the stage, the right land and money in the treasury; the treasury pays what it can and builders place every block. Decorative details that need a material nobody has are left out instead of stopping the work.

## Storage

* Projects started from a blueprint store only their site clearing; the rest is drawn again from the lot, the spec and the settlement's style on load (`packed: 'gen'`, `Civ.regenBlocks`). Material swaps are re-applied.
* Places and properties built during play moved to their own document, `world/estate`.
* Snapshots carry the world id; snapshots of an earlier world are not shown.
* `Sync.SCHEMA = 4`: an older world is re-founded on the first visit.
