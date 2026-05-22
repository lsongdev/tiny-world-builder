# Workspace Overview

**Project**: Tiny World Builder — a single-file browser app (`tiny-world-builder.html`) for painting low-poly 3D voxel worlds on a Three.js r128 scene. No bundler, no npm runtime dependencies. Deployed to Vercel/Netlify from `dist/` via `publish.sh`. App is large (~16k+ LoC).

---

# Durable Facts

## App Architecture
- **Intent layer**: `world[x][z]` — `{ terrain, terrainFloors, kind, floors, buildingType, fenceSide, extras }`
- **Render layer**: `cellMeshes['x,z']` — `{ tile: Group, object: Group|null }`
- **Central mutation path**: `setCell(x, z, opts)` — normalizes, writes world, rebuilds meshes, refreshes adjacency neighbors, autosaves, fires webhooks. Never write `world[x][z]` directly outside of init.
- **Grid**: home grid starts 8×8, configurable up to 48×48. `HOME_GRID_MAX` is the ceiling constant.
- **Storage**: key `tinyworld:v1`, schema version 4. Cells serialized sparsely. `applyState()` accepts both tuple export and object-form schema cells.
- **Three.js**: r128 pinned. `MeshLambertMaterial`, `ExtrudeGeometry`, shadow setup all assume r128 semantics — do not bump.
- **Shared materials**: `M.*` are shared across many meshes. Clone before mutating color. `disposeGroup()` disposes geometries, not materials (shared).
- **Deploy**: `npm run build` → `publish.sh` → `dist/`. `npm test` = `check` (syntax) + `smoke`.

## Procedural Pixel-Art Textures
- `createPixelTexture(type, scale = 16)` — supported types now include: `checkered`, `noise`, `brick`, `shingles`, `ripples`, `leaves`, `wood`, `grass`
- `applyWorldUVs(material, texture, textureScale)` — runs once at init, safe to write `M.*` directly in that context only
- **Organic Grass Texture toggle**: `render-textured-grass` localStorage key + UI checkbox. When on, grass materials use `texGrass` (dense pixel-art grass blades) instead of `texCheckered`.

## LandscapeEngine Coordinate Helpers (2026-05-22)
- `isLandscapeMeshActive()` — new consolidated helper; use everywhere instead of re-inlining the triple check
- Placement snaps, vehicle Y, weather surface, and ghost board restore all correctly resolve against `landscapeHeightAtCell` in landscape mode
- Ghost board restore after load: `applyState` checks `shouldRestoreLandscapeMesh` and re-inits landscape mesh if needed

## Object Style Toggle
- Non-voxel-build objects in selection preview now show a Voxel/Normal chip

---

# Active Subsystems

## LandscapeEngine
Opt-in via `Terrain style = Landscape`. No discrete tile meshes render in this mode. Supports realistic (Lambert + shadows + fog) and low-poly (cel shader) sub-modes. Auto-expands on first pan up to 48×48. Clip bounds drive `renderVisibleDistance`.

## Ghost Board System
`makeGhostWorld(boardX, boardZ)` is deterministic, cached, connection-aware. Skill at `.codex/skills/tinyworld-ghost-world-gen/SKILL.md` — **not yet in AGENTS.md routing table**.

## Scratch / QA Scripts
- `scratch/visual_qa.js` — headless Chrome CDP script for automated visual QA
- `scratch/chrome_debugger*.js`, `scratch/test_unit.js` — supporting CDP and unit test utilities

## OpenClaw Cron Jobs
- Heartbeat + Urgent Email Alert: HEARTBEAT_OK
- Tom Doerr Tweet Tracker: **BLOCKED** (CLI version mismatch — upgrade OpenClaw CLI)
- VibeClaw Skills Scout: running, 9 items found
- MC Gateway (`894a3d5b`): persistent failures — connection refused / assistant turn failures

---

# Open Threads

- **Visual QA pending**: landscape snaps, ghost board restore, organic grass toggle, tree textures — all pass `npm test` but not browser-confirmed
- **AGENTS.md gap**: `tinyworld-ghost-world-gen` skill not listed in routing table
- **MC Gateway instability**: root cause unknown
- **Tom Doerr tracker blocked**: upgrade OpenClaw CLI to fix
- **VibeClaw items to evaluate**: AutoCoder v3, Copilot Extensions GA, Cursor background agents, Anthropic 4-series models
- **Docs/schema drift**: README and AGENTS.md understate app size (16k+ LoC, 48×48 max)
