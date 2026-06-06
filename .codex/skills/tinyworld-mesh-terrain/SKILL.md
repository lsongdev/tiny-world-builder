---
name: tinyworld-mesh-terrain
description: Use when changing the Mesh Terrain sculptor — the opt-in voxel-mesh landscape designer that paints per-voxel materials and pull/push-sculpts a fine surface, then bakes it into world[x][z] terrain. Module engine/world/46-mesh-terrain.js.
---

# Tiny World Mesh Terrain Sculptor

A self-contained, opt-in landscape designer in `engine/world/46-mesh-terrain.js`.
It is an alternative to per-tile `terrainFloors` stacking: lay a fine voxel mesh
over the whole home board, paint materials per voxel, pull/push the surface into
shape, then bake the result into the normal world so it renders, saves, and can
be built on.

## Why it is structured this way

- **One IIFE, no top-level names.** The whole module is wrapped in
  `(function meshTerrainSculptorBoot() { … })();`. Its inner identifiers stay
  below the 2-space top-level indent, so the `tools/check.js` cross-file
  duplicate-declaration guard ignores them and they cannot collide with other
  modules. Keep new code inside the IIFE.
- **Own localStorage key, no schema change.** Editor state persists under
  `tinyworld:meshTerrain:v1` (mesh) and `tinyworld:meshTerrain:prefs:v1`
  (tool/brush prefs). The world schema (`world.schema.json` + embedded
  `WORLD_SCHEMA`) is untouched, so the schema-parity check stays green. Do not
  add persisted fields to the world save for this feature.
- **CSS injected from JS.** Styles are appended as a `<style id="mesh-terrain-styles">`
  so the guarded `styles/tiny-world.css` is never edited. New chrome (a floating
  toggle button + panel) uses new ids/classes; that does not trip presence-based
  check.js guards.
- **Zero impact when off.** Nothing is added to the scene and no listeners are
  attached until `enter()`. `exit()` detaches everything and disposes meshes.

## Data model

- `N = GRID * effVpt` voxels per board side (effVpt clamped so `N <= MAX_N`).
- `heights`: `Float32Array((N+1)^2)` — per-vertex Y delta above `surfaceY` (TOP_H).
- `mats`: `Uint8Array(N^2)` — per-voxel material index into `MATERIALS`
  (ids match real terrain names: grass/sand/water/stone/dirt/snow/lava).
- Geometry is **non-indexed** (each quad owns 6 verts) so colors are sharp per
  voxel and per-face flat normals give the low-poly facet look. `surfaceMesh`
  is a single `MeshLambertMaterial({vertexColors:true, side:DoubleSide})` mesh.
- Board is centred at the origin: vertex `(c,r)` world XZ = `c*spacing - half`,
  `r*spacing - half`, where `spacing = GRID/N`, `half = GRID/2`.

## Interaction

- Input is intercepted by **window capture-phase** pointer listeners (the
  existing handlers are bubble-phase on `renderer.domElement`, so capture runs
  first). Engage an edit only when `e.target === renderer.domElement` and the
  ray hits the surface; then `stopPropagation()`. Otherwise let the event flow
  so camera orbit/zoom still work. Never engage over panel/toolbar chrome.
- **Sculpt**: drag the surface up/down. The grabbed vertex moves by the screen
  dy mapped to world units (`perPixelWorldY`, ortho vs perspective aware);
  neighbours follow with a smoothstep `falloff(dist/brushRadius)` — the
  "tension". Reapply from a `startHeights` snapshot each move so it does not
  compound.
- **Paint**: drag to set every voxel whose centre is within `brushRadius` to the
  selected material.

## Bake (Apply)

`bake()` walks each board tile, takes the **dominant** painted material and the
**average** corner height (quantised to the 0.20 level step, clamped 1..MAX_FLOORS),
and calls `setCell(tx, tz, {terrain, terrainFloors, …})`. It **preserves** any
existing object on the tile (passes through `kind`/`floors`/transform/etc.), so
objects ride up onto the new terrain. Then it dispatches
`tinyworld:world-changed` and calls `saveState()` if present.

Known MVP limitation: bake is per-tile, so sub-tile paint collapses to the
dominant material per tile and heights quantise to 0.20 steps. Preserving full
sub-tile detail as a first-class persisted surface (with object placement
sampling the mesh height) is the natural next iteration.

## QA checklist (needs a browser — cannot be verified by npm test)

- Toggle opens the panel and `enter()` lays a flat grass mesh over the board;
  the underlying home tiles hide while editing and restore on Cancel.
- Sculpt drag pulls a smooth hill/valley; neighbours taper with the brush.
- Paint lays the selected material; water/stone/etc. read correctly.
- Orbit/zoom still work when dragging empty space or scrolling.
- Apply bakes terrain + height through `setCell`; existing objects survive and
  sit on the new heights; the world saves and reloads.
- Cancel discards with no world change; clicking toolbar/settings is not hijacked.
