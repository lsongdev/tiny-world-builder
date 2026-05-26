# CodeSurf Workspace Memory — tinyworld

_Generated: 2026-05-26 (sixth pass)_

---

## Overview

Tiny World Builder is a single-file, no-bundler 3-D isometric world editor built on Three.js r128. The runtime is `tiny-world-builder.html` (inline CSS + JS, ~29k LoC). `LandscapeEngine.js` handles procedural underlay terrain; it has been refactored into `engine/landscape/` mixin modules (geometries, noise, shaders, water, chunks). Deployment is static: `publish.sh` → `dist/`.

---

## Durable Architecture Facts

**Core data contract**
- `world[x][z]` — intent layer; `cellMeshes['x,z']` — render layer
- All mutations via `setCell(x, z, opts)`; sparse-safe reads via `getWorldCell()` / `ensureWorldCell()`
- Never write to `world[x][z]` directly outside init

**Planet underlay** (commits 373c4d7 → b3fccae, committed and clean)
- Separate `planetLandscapeEngine` instance; treated as decorative backdrop — no shadows, no pointer picks
- `BACKDROP_MODE`, `CHUNK_BUILD_BUDGET_NEAR/FAR` in `LandscapeEngine.js` and `engine/landscape/chunks.js`
- Warmup drain via `setTimeout` to avoid clipped horizons on first load
- `setPlanetFog()` defensively ensures uniform holders before mutating
- `tickPlanetLandscapeStream()` replaces direct `planetLandscapeEngine.update()` call
- `world.schema.json` now includes `planetLandscape` serialisation fields
- `models/Building_1.glb` added to `models/`

**Water flow system** (commit 8936613, committed and clean)
- `waterTextureFlowStates`, `applyFlowingWaterUVs`, `waterFlowMaterial`, `tickWaterTextureFlow()`
- `waterFlow` field on cells (default `'auto'`); persisted in import/export/patching; editable via UI for selected water tiles
- Render resolution scale min lowered to 0.25; backdrop/vignette/mist ranges and tilt blur increased

**Ghost world generation**
- Deterministic, seeded (`ghostHash` / `cellRand`), connection-aware across board edges
- Cached in `ghostBoardCells` keyed by `'bx,bz'`; panning away and back reproduces identical content
- Full SKILL.md exists — not yet in AGENTS.md routing

**Engine landscape modules** (`engine/landscape/`)
- `geometries.js`, `noise.js`, `shaders.js`, `water.js`, `chunks.js`
- `chunks.js` skips full staging and shadow-map participation for underlay meshes

**`world.schema.json`** — tracks serialisable world state shape including `planetLandscape` block

---

## Skills Registry

AGENTS.md routing table verified at 11 entries. Two skill files exist on disk but are not routed:

- **Missing from AGENTS.md:** `tinyworld-ghost-world-gen` (ghost board gen, path/road/river continuity, seeded RNG) and `threejs-primitive-reconstructor` (image-to-Three.js primitive scene generation)

---

## Tooling Note

- **Playwright MCP** — confirmed in deferred-tool list (`mcp__plugin_playwright_playwright__*`); browser automation available for `tinyworld-visual-qa` checks

---

## Open Threads

- Add both missing skills to AGENTS.md routing
- Confirm `waterFlow` default `'auto'` round-trips safely against pre-existing saves (no schema migration guard observed)
- Verify which features (minimap, seasons, time-of-day, stamp panel) are fully committed vs. WIP — `1055bab` added Stamp panel but several `WIP` commits followed
- `PORT-NOTES.md` and `status.MD` exist at repo root — review for tracked decisions before adding new systems
- `plugins/` directory at repo root — contents and integration pattern not yet documented in skills or memory
