# Tiny World Builder

A self-contained 3D voxel world editor in a single HTML file. No build, no
dependencies installed locally — just open `tiny-world-builder.html` in a
browser. Three.js r128 is pulled from cdnjs at runtime.

## Run

```bash
open tiny-world-builder.html
# or serve it
python3 -m http.server 8000
```

## Controls

| Action            | Input                                  |
| ----------------- | -------------------------------------- |
| Place             | click a cell                           |
| Erase             | `E` then click, or pick the eraser     |
| Orbit             | drag                                   |
| Zoom              | scroll wheel                           |
| Stack/enhance item | click the same object tool on an existing object (max 8) |
| Switch tool       | `1`–`9`, then letter shortcuts shown in the toolbar |
| Toggle camera     | `P` or `I` (perspective ⇄ ortho)       |
| Reset to preset   | `R`                                    |
| Clear to grass    | `C`                                    |

## Tools

`Grass` · `Path` · `Dirt` · `Water` · `House` · `Tree` · `Fence` · `Rock` ·
`Bridge` · `Crop` · `Corn` · `Wheat` · `Pumpkin` · `Carrot` · `Sunflower` ·
`Tuft` · `Erase`.

Terrain/object rules are normalized by the renderer: crops force dirt
underneath, bridges force water, and ordinary objects do not float on water.
Paths, shorelines, water foam, bridges, fences, castle walls, houses, and
rocks are adjacency-aware — placing a neighbor re-renders surrounding cells
so roads join, rivers get banks, bridge direction updates, fence walls connect,
house clusters form L/T/+/square buildings, and rock cells grow into craggy
outcrops.

## Architecture

Single `<script>` block, ~1600 lines of vanilla JS, organised by section
comments (`// -------- xyz --------`). The model is split cleanly:

- **`world[x][z]`** — intent: `{ terrain, kind, floors }` per cell.
- **`cellMeshes['x,z']`** — rendered Three.js groups for each cell.
- **`setCell(x, z, opts)`** — single mutation entry point. Updates `world`,
  rebuilds the cell's tile/object meshes, and re-renders any neighbors that
  care about adjacency (fence/house clusters).

House clusters use BFS (`bfsHouseCluster`) plus `tryComposite` (L/T/+) and
`trySquare` to decide whether a group of house cells should render as a
unified structure or stretched rectangles.

A shared `dropAnims` queue ease-outs new tiles/objects into place. Other
per-frame animations (tree sway, crop bob, smoke origin) check
`obj.userData.landing` so they yield while a piece is still falling in.

See [AGENTS.md](./AGENTS.md) for guidance on extending the codebase.

## Files

```
tiny-world-builder.html          the app
tiny-world-builder BACKUP.html   byte-identical snapshot from 2026-05-09
README.md                        this file
AGENTS.md                        guidance for AI coding agents
```
