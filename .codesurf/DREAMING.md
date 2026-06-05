The file is clean and accurate. Here is the full replacement content for `.codesurf/DREAMING.md`:

---

# CodeSurf Workspace Memory — tinyworld

Generated: 2026-06-05

---

## Overview

Tiny World Builder is a vanilla ES6, no-bundler 3D world editor built on Three.js r128. The app shell lives in `tiny-world-builder.html` (~1.4k lines); business logic is split across ~48 ordered modules under `engine/world/` (00–44 + 09b + 99-late-boot.js + `flight-combat-math.mjs` as an ES module), plus `engine/landscape/`. Total JS is approximately 40k+ lines. Deployed via Vercel and Netlify from `dist/` produced by `publish.sh`.

---

## Durable Facts

**Architecture**
- Primary file: `tiny-world-builder.html` — HTML shell, boot config, ordered `<script src>` tags only
- Engine modules: 48 JS files total — numbered 00–44 + 09b + 99-late-boot.js + `flight-combat-math.mjs` (ES module, not a classic script); all classic scripts share one global scope
- Duplicate top-level identifiers silently kill the declaring module without affecting others; prefix module-local scratch globals (e.g. `_fl…` for flight)
- Skills on disk: 20 `.codex/skills/` directories — 19 `tinyworld-*` plus `threejs-primitive-reconstructor`; both `threejs-primitive-reconstructor` and `tinyworld-ghost-world-gen` are on disk but absent from AGENTS.md routing
- Three.js pinned to r128; materials in `M.*` are shared — clone before mutating color

**Module reference (key additions since 2026-06-04)**
- `42-account-wallet-players.js` — account/JWT/cloud-save (subscription system removed 2026-05-31)
- `43-drag-drop-import.js` — GLB/model drag-drop import pipeline
- `44-sub-object-edit.js` — part-level selection, hover hulls, transform delegation for voxel objects

**Wallet / cloud-save (subscription system removed 2026-05-31)**
- Subscription tiers, upgrade prompts, paywall gate, premium flags, and `SUBSCRIPTION_TIER` global removed from engine and prelude
- Only neutral JWT save/load and anonymous fallback remain; wallet status text is "Account cloud unavailable"

**Island side faces / strata**
- `13-distant-dressing-ghost.js` — `M.boardSideEdge` applied directly on all four full-height side faces
- `textures/island-side-strata-gpt.png` (1024×192) loaded as `CanvasTexture` with shadow-lift processing and shader clamp; stone/castle masonry block sizing, colors, UV scale refined

**Island warp-in arrival (shipped 2026-06-05, ccf8a49)**
- `startEditableIslandWarpArrival` / `tickEditableIslandWarpArrivals` in `14-editable-islands-moorings.js`
- Blue/white streak → ring/flash → overshoot → settle; runs after LOD updates; skipped when `skipSave` set
- Tests in `tools/check.js`; documented in `tinyworld-island-and-planes` SKILL.md

**Default world (a8ce7f9)**
- `default_island.json` is the default world on fresh session and Reset; procedural fallback if file is missing

**Cloud sea render order (verified 2026-06-02)**
- `31-cloud-sea.js` — `renderOrder = 18`, depth test on; enforced by `tools/check.js` guard; do not revert

**Terrain adjacency**
- Stone and path are one `sameTerrainEdgeFamily`; no border bricks/risers between adjacent stone/path cells

---

## Recent Major Features (2026-06-04/05)

**Sub-object editing (module 44)**
- Part overrides support `rx/ry/rz` rotations; gizmo delegates to `window.__tinyworldSubEdit` when active
- Layers panel shows part rows; radial secondary menu: Explode / Move / Scale / Recolor
- Gated off in Play mode; voxel-builds only

**Build / Play mode toggle**
- `window.__tinyworldIsPlayMode()` / `window.__tinyworldMode`; persisted under `BUILD_PLAY_LS`
- Play mode gates: place/erase, shortcuts, `mpEditAllowed`, hover-terrain, sub-edit
- `document.body.classList` gains `tw-play-mode`; implemented in `30-ui-boot-wiring.js`

**Model stamp persistence (IndexedDB)**
- User-dropped GLBs persist via `persistDroppedModelStampAssets` in `09-model-stamp-loader.js`; restored on boot
- `applyPersistedMaterialSettingsOnBoot()` in `04-textures.js` wired into `99-late-boot.js`

**PBR → Lambert material adaptation**
- `MeshStandardMaterial`/`MeshPhysicalMaterial` GLBs converted to `MeshLambertMaterial` with TinyWorld lighting
- Samples texture encoding, drops broken AO/normal maps, preserves base maps/vertex colors/emissive/skinning
- Import safety lights added to `02-cameras-lighting.js`

**UI polish**
- `assets/twlogo-wordmark.png` / `assets/twlogo.png` replace textual brand
- Showcase exit: icon-only circular X button (ARIA-labeled, Escape shortcut)
- Escape sequence: exit sub-edit → clear selection → disarm hot tool

---

## Object Palette

**Terrain (10):** grass, sand, water, snow, lava, stone, dark stone, dirt, wood, ice

**Objects (60+):** houses, trees, mountains, fences, roads; vehicles (car, boat, submarine); ferris wheel (0.5 rpm, `userData.ferrisWheelGroup`); landmarks (lighthouse, castle, ruins, volcano, observatory, radio tower); energy (solar panel array); air (hot air balloon, airship); windmill; baseball diamond, horse racetrack; characters (Explorer, Merchant, Scholar, Wizard, Warrior, Knight)

**Stamps:** only `stunt_plane.glb` remains in `models/` — `treasure_chest.glb` removed with legacy demo assets (6db8afa). Stunt-plane is the canonical flyable plane. User-dropped GLBs persist via IndexedDB.

**AI Agents tab:** 6 pre-made agents (Aria, Nova, Sage, Rex, Luna, Byte); stationary — no pathfinding system.

---

## Memory Constraints

- No emoji in any UI, code, or output
- Reuse existing components; never reimplement
- Verify UI/interactions in the real app, not synthetic events
- Verify 3D correctness via positions/bbox/ray-math, not screenshots
- SVG glyphs only — no PNG baked-icon system
- CodeSurf auto-commits and auto-pushes to main → Netlify prod; branches do not guarantee isolation
- Only HEAVY (rocket) engines have plume/glow; lift/turbo are propeller-only; plume must stay frustum-visible
- Stone/path are one edge family — no bricks/risers between adjacent stone/path cells

---

## Open Threads

- AGENTS.md routing section says "44 files (00–41)" — stale; actual count is 48; modules 38–41 need skill routing, 42–44 need AGENTS.md mention
- `tinyworld-ghost-world-gen` and `threejs-primitive-reconstructor` skills on disk, not routed in AGENTS.md
- `fork-improvements-report.md` at repo root — eight improvement areas, action status unknown
- `.claude/workflows/split-god-file.js` — purpose/status unconfirmed
- Blast door concept — waiting on user mockup; no code yet
- Day/night cycle — `39-atmosphere-effects.js` exists, no time-progression wired
- NPC/agent pathfinding — Characters and AI Agents are stationary; no movement system
