The file structure is confirmed. The recent sessions are all trivial test/diagnostic Codex sessions (PONG, confirmed, count to 50, /tmp write test) with no tinyworld-specific activity. The module count and skills are unchanged from the previous cycle. I'll write the updated DREAMING.md now, preserving all durable facts and keeping open threads current.

# CodeSurf Workspace Memory — tinyworld

Generated: 2026-06-01

---

## Overview

Tiny World Builder is a vanilla ES6, no-bundler 3D world editor built on Three.js r128. The app shell lives in `tiny-world-builder.html` (~1.4k lines); business logic is split across 44 ordered modules under `engine/world/` (00–41 + 09b + 99-late-boot.js), plus `engine/landscape/`. Total JS is approximately 40k+ lines. Deployed via Vercel and Netlify from `dist/` produced by `publish.sh`.

---

## Durable Facts

**Architecture**
- Primary file: `tiny-world-builder.html` — HTML shell, boot config, and ordered `<script src>` tags only
- Engine modules: `engine/world/00-prelude.js` through `engine/world/99-late-boot.js` — 44 files total (00–41 + 09b + 99-late-boot.js), loaded in strict numeric order
  - `38-multiplayer-partykit.js` — PartyKit real-time shared building; activated via `?party=`/`?room=`/`?collab=` URL params; chunked snapshot reassembly; `applyingRemote`/`applyingRemoteEnv` flags prevent re-broadcast loops
  - `39-atmosphere-effects.js` — Atmosphere effects extracted into own module; PointLight/SpotLight predicate fixed; cache invalidates on placeable-light registration/removal
  - `40-shield-system.js` — Voxel blast shield port; scene-level overlay; PointLight cap 12; configurable panel geometry
  - `41-flight-combat.js` + `engine/world/flight-combat-math.mjs` — Guns, targeting HUD, missiles for flight sim; reads `window.__flightJet`; uniform target adapter interface; health system (MAX_HEALTH=100); muzzle flash deferred
  - `flight-combat-math.mjs` is an ES module (not a classic script) — import semantics differ from the rest of the engine
- Skills on disk: 20 `.codex/skills/` directories — 19 `tinyworld-*` plus `threejs-primitive-reconstructor`; all 19 tinyworld-* skills are routed in AGENTS.md; `threejs-primitive-reconstructor` and `tinyworld-ghost-world-gen` are on disk but absent from AGENTS.md routing
- Three.js pinned to r128; bumping is risky (shadows and material color spaces changed in newer releases)
- All engine modules share one global scope — load order matters; duplicate top-level identifiers throw `SyntaxError` and silently kill the declaring module while others keep loading; prefix module-local scratch globals (e.g. `_fl…`)

**Data layer contract (never break these)**
- `world[x][z]` — intent: `{ terrain, terrainFloors, kind, floors }`
- `cellMeshes['x,z']` — render: `{ tile: Group, object: Group|null }`
- All mutations go through `setCell(x, z, opts)`
- Materials in `M.*` are shared across many meshes — never mutate in place, clone first
- `userData.landing` guards drop-in animations — never remove these checks
- `disposeGroup(group)` disposes geometries but not shared materials; per-particle smoke clones its material and disposes on death — follow that pattern for any unique-per-instance material

**Build and deploy**
- No bundler, no npm runtime deps; `npm test` for static checks, `npm run build` for dist generation
- `publish.sh` copies `engine/`, `styles/`, `vendor/` into `dist/`; Vercel (`vercel.json`) and Netlify (`netlify.toml`) serve from `dist/`
- Edits auto-commit; main auto-pushes to GitHub → Netlify prod — branches do not guarantee isolation

**Module load gotchas**
- Home grid starts at 8×8; settings can expose up to 48×48; avoid synchronous broad rebuilds at larger sizes
- `orthoCam`, `softCam`, `persCam` exist; `camera` is a reference swapped by `togglePerspective()` / `setCameraMode()`
- Stunt-plane flight uses the existing `stunt-plane` model-stamp via the Stamps system — not a bespoke tool/kind

---

## Active Subsystems

| Module | Status | Notes |
|--------|--------|-------|
| `38-multiplayer-partykit.js` | Shipped, unrouted | No skill, no AGENTS.md entry |
| `39-atmosphere-effects.js` | Shipped, unrouted | No skill, no AGENTS.md entry |
| `40-shield-system.js` | Shipped, unrouted | No skill, no AGENTS.md entry |
| `41-flight-combat.js` | Shipped, unrouted | No skill, no AGENTS.md entry |
| `34-flight-sim.js` | Shipped, routed | Skill: `tinyworld-flight-sim` |
| All other engine modules (00–37, 09b, 99) | Shipped, routed | See AGENTS.md skill routing table |

---

## Open Threads

- **Three unrouted subsystems need skills and AGENTS.md routing entries**: multiplayer (38), shield system (40), flight combat (41)
- **`tinyworld-ghost-world-gen`** skill on disk but absent from AGENTS.md routing — wire or remove
- **`threejs-primitive-reconstructor`** skill on disk but absent from AGENTS.md routing — wire or remove
- **`fork-improvements-report.md`** at repo root (present on disk) — eight improvement areas; review/action status unknown
- **`.claude/workflows/split-god-file.js`** — purpose/status unconfirmed; investigate before acting
- **Blast door concept** — mentioned in prior sessions; waiting on user mockup; no code yet

---

## Hard Constraints (non-negotiable)

- No emoji anywhere — strictly prohibited in UI, code, and output
- No PNG icons for tools — tinyworld main uses SVG glyphs only; never reintroduce the PNG baked-icon system
- Do not rebuild existing components; reuse as-is
- Verify UI/interaction via 3D math (positions, bbox, ray-math), not browser screenshots or synthetic clicks
- Never mutate `world[x][z]` directly outside of init; always use `setCell`
- Never rename `world`, `cellMeshes`, or `setCell`
- Never remove `userData.landing` checks
- Do not touch `tiny-world-builder BACKUP.html` if it exists locally
- `npm test` must pass before declaring any change done

---

## Recent Session Notes

No tinyworld code changes in the most recent session batch. Sessions were diagnostic Codex ping/test runs (PONG, confirmed, echo, count to 50, /tmp write test) with no workspace modifications.
