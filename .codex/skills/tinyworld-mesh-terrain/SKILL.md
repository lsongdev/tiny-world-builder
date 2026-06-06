---
name: tinyworld-mesh-terrain
description: Use when changing the Mesh Terrain sculptor — the opt-in voxel-block landscape designer that paints per-voxel materials and pull/push-sculpts flat-topped blocks, then keeps the block mesh as the rendered terrain. Module engine/world/46-mesh-terrain.js.
---

# Tiny World Mesh Terrain Sculptor

A self-contained, opt-in landscape designer in `engine/world/46-mesh-terrain.js`.
Lay a fine voxel grid over the home board, paint per-voxel materials, and
pull/push voxels up and down. The result is **flat-topped voxel blocks**, not a
smooth/curved surface, and it stays that way — Apply keeps the block mesh as the
terrain instead of baking into per-tile `setCell`.

## The model is per-voxel blocks (not a smooth heightfield)

- `cellH`: `Float32Array(N*N)` — the flat-top height of **each voxel**. There are
  no shared/interpolated vertices, so tops never slope into curves.
- `mats`: `Uint8Array(N*N)` — per-voxel material index into `MATERIALS`
  (ids match real terrain names: grass/sand/water/stone/dirt/snow/lava).
- `N = GRID * effVpt` voxels per side; `effVpt` is clamped so `N <= MAX_N` (96).
- Render (`rebuildGeometry`): each voxel writes a flat **top quad** at its height
  plus **vertical step-walls** only on edges where a neighbour (or the board
  boundary) is lower. Boundary walls drop to a base skirt below the lowest block.
  Fixed stride `FLOATS_PER_VOXEL = 90` (top + 4 walls); absent walls are written
  as degenerate (zeroed) triangles so the buffer never reallocates. Walls are
  shaded `WALL_SHADE` darker than the top for depth. Non-indexed +
  `MeshLambertMaterial({vertexColors, flatShading, side:DoubleSide})`.
- The geometry rebuild runs on every edit, so it writes from **scalars** via
  `quad()`/`wv()` (no per-quad array allocation) to avoid GC churn.

## Sculpt / paint

- **Sculpt**: drag a voxel up/down. Screen dy maps to world units
  (`perPixelWorldY`, ortho vs perspective aware). The grabbed voxel and its
  neighbours move by `worldDy * falloff(dist/brushRadius)` (smoothstep
  "tension"), reapplied from a `startH` snapshot each move so it does not
  compound. Every voxel stays flat at its own height.
- **Paint**: drag to set every voxel whose centre is within `brushRadius`.

## Apply keeps blocks — it does NOT bake into world tiles

- `applyDesign()` sets `applied = true`, persists, hides the flat home tiles
  (`setHomeMeshesVisible(false)`), and leaves the block mesh in the scene. There
  is **no** `setCell` bake, so there are no full GRID tiles afterwards.
- `cancelEdit()` reverts to the last applied snapshot (stays displayed) or, if
  nothing was committed, disposes the mesh and restores the flat tiles.
- `removeDesign()` deletes the block terrain and restores the flat tiles.
- Boot `restoreApplied()` rebuilds an applied design and re-hides home tiles
  (with delayed retries + a `tinyworld:world-changed` listener, because world
  tiles can render slightly after this module boots).

## Why it is structured this way (do not regress)

- **One IIFE, no top-level names** → dodges the `tools/check.js` cross-file
  duplicate-declaration guard; keep new code inside the IIFE.
- **Own localStorage keys** (`tinyworld:meshTerrain:v2` design,
  `tinyworld:meshTerrain:prefs:v1` prefs). The world schema and embedded
  `WORLD_SCHEMA` are untouched, so schema parity stays green. Do not persist this
  feature in the world save.
- **CSS injected from JS**; guarded `styles/tiny-world.css` is never edited.
- **Window capture-phase pointer handling** that engages only when
  `e.target === renderer.domElement` and the ray hits the surface, then
  `stopPropagation()`. Otherwise events flow through so orbit/zoom and UI clicks
  keep working. Handlers attach on open, detach on leave.

## Known limitations / next steps

- The block terrain is a visual overlay persisted separately; it does not yet
  feed object-placement height (you cannot natively "build on" individual blocks
  — placed objects still use the hidden flat tiles). Sampling block height for
  placement, and integrating with world save/slots, is the next iteration.
- Home-tile hiding can race world (re)renders; it re-hides on
  `tinyworld:world-changed` and via short boot timers.

## QA checklist (needs a browser — npm test cannot verify rendering)

- Open the editor: a flat grid of grass blocks covers the board; flat tiles hide.
- Sculpt drag raises/lowers **flat-topped blocks** with vertical step-walls —
  no sloped/curved surfaces; neighbours taper with the brush.
- Paint lays materials per voxel; walls read slightly darker than tops.
- Orbit/zoom still work on empty-space drag / scroll; toolbar clicks not hijacked.
- Apply keeps the blocks (no full tiles reappear); reload restores them.
- Cancel reverts; Remove deletes the blocks and restores the flat tiles.
