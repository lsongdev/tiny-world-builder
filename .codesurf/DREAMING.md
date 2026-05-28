The file was already updated to a clean, accurate state by a concurrent process. The content I read confirms all facts match my research: HEAD `dddcddb`, 38,410 lines, crowd 3D actor replacement completed, 3 uncommitted files, OpenClaw health status, all 17 skills confirmed. The file is already saved correctly.

---

# CodeSurf Workspace Memory — tinyworld

_Generated: 2026-05-28 (sixteenth pass)_

---

## Overview

Tiny World Builder is a single-file, no-bundler 3-D isometric world editor built on Three.js r128. The runtime is `tiny-world-builder.html` (inline CSS + JS; ~38,410 lines). `LandscapeEngine.js` handles procedural continuous terrain; internals in `engine/landscape/` mixin modules (chunks.js, geometries.js, noise.js, shaders.js, water.js). Deployment is static: `publish.sh` → `dist/`. `npm test` runs ESLint + HTMLHint.

---

## Durable Architecture Facts

**Core data contract**
- `world[x][z]` — intent layer; `cellMeshes['x,z']` — render layer
- All mutations via `setCell(x, z, opts)`; sparse-safe reads via `getWorldCell()` / `ensureWorldCell()`
- Never write to `world[x][z]` directly outside init

**Three.js r128 pinned.** No bundler, no npm runtime deps. Materials in `M.*` are shared; clone before mutating color. Do not bump Three.js version.

**World schema** — `world.schema.json` (v4) formally describes the save format: sparse `cells` array (compact tuples or objects), optional `islands` array, `cameraMode`, `toolId`, `useLandscapeEngine`, `landscapeMeshMode/landscapeMeshBiome`. Grid sizes 8–48.

---

## Branch State

**main** — HEAD `dddcddb` — **ahead 1 of remote, not yet pushed**

| Commit | Summary |
|---|---|
| `dddcddb` | Checkpoint TinyWorld visual and model work (crowd 3D actors, new models, `world.schema.json`, `voxel_lift_engine.html`) |
| `33a72b9` | Add island utility underside & cylinder cache |
| `22ef51e` | Add targeted underside debris bursts |
| `9bea000` | Add under-island debris, rocket smoke & waterfall tweaks |
| `ed08603` | Updated editing controls ← previous memory pass HEAD |

**Working tree (uncommitted, 3 files):** `tiny-world-builder.html`, `.codex/skills/tinyworld-island-and-planes/SKILL.md`, `.codex/skills/tinyworld-render-performance/SKILL.md`

**Stale branches (safe to prune):** `asset-system-slice`, `worktree-agent-a17895f4`, `worktree-agent-a35bb1ef`, `worktree-agent-a6b44378` — all 131+ commits behind main at `acfb18b`

---

## Recent Feature Work

**Crowd Layer — 3D Character Actor Replacement** (in `dddcddb`): GLTF animation clips cached in model stamp cache; `tiny-crowd-layer.js` now exposes 3D actors and hides 2.5D sprites when an animated GLB/GLTF character stamp is available; character detection widened to accept neutral filenames while excluding buildings/aircraft/boats/engines/traps/terrain. `tools/model-stamps.js` updated.

**Island Utility Underside Dressing** (in `33a72b9`): `addIslandUtilityUnderside()` procedurally adds pipes, cable trays, clamps, junction boxes, cable drops to `homeBorderGroup`. `getCylinderGeometry()` geometry cache; `vcylinder` gains `rx/rz/noShadow` options; underside meshes skip shadow map cost.

**Under-Island Debris & Particles** (in `9bea000`, `22ef51e`): targeted debris bursts, rocket smoke, waterfall tweaks.

**New artifacts:** `world.schema.json` (formal v4 schema), `voxel_lift_engine.html` (standalone tool), new character/trap models in `models/`, `voxelboats.fbx` removed.

---

## Skills Inventory

All 17 local skills confirmed in `.codex/skills/`. **AGENTS.md routing gap (unresolved):** `tinyworld-ghost-world-gen` and `threejs-primitive-reconstructor` exist on disk but are absent from the AGENTS.md routing table.

---

## Active In-Progress Work

**Properties Panel Overhaul** (design decided, not yet committed): category tabs + compact icon-button rows, history stack / undo-redo, custom constrained transform gizmo (no TransformControls — r128 pinned, no bundler). Skills: `tinyworld-single-file`, `tinyworld-asset-editing`, `tinyworld-visual-qa`.

---

## OpenClaw / Cron Health

| Agent / Cron | Status |
|---|---|
| MC Gateway `894a3d5b` | `[assistant turn failed before producing content]` — unresolved |
| VibeClaw Wallpaper Generator | Same failure, multiple consecutive turns |
| VibeClaw Article Generator | Same failure, multiple consecutive turns |
| Tom Doerr Tweet Tracker | Running; Chrome profile not authenticated for X.com |
| Lead heartbeats (Ava, board `c3f78d0c`) | Healthy — HEARTBEAT_OK |

wacli also unauthenticated — no WhatsApp notification fallback.

---

## Open Threads

- Push main to remote (`dddcddb` is 1 ahead)
- Commit uncommitted skill files + working `tiny-world-builder.html` edits
- Implement Properties Panel overhaul (tabs, icon buttons, undo/redo, gizmo)
- Patch `makeModelStamp()` to consume `opts.appearance`
- Add `tinyworld-ghost-world-gen` + `threejs-primitive-reconstructor` to AGENTS.md routing table
- Document `world.schema.json` in AGENTS.md
- Prune stale worktree branches
- Diagnose OpenClaw MC Gateway / VibeClaw cron repeated assistant-turn failures
- Authenticate Chrome profile for X.com; authenticate wacli for WhatsApp
- LandscapeEngine visual QA; Stamp panel undo + rotation/flip; NPC memorySummary cap; Seasons `M.*` audit; `plugins/`/`tools/` skill docs
