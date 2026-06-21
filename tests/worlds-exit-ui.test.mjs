import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const universeJs = readFileSync(new URL('../engine/world/46-worlds-universe.js', import.meta.url), 'utf8');
const roomJs = readFileSync(new URL('../engine/world/47-worlds-room.js', import.meta.url), 'utf8');
const hudJs = readFileSync(new URL('../engine/world/48-worlds-harvest-hud.js', import.meta.url), 'utf8');
const lobbyPresentationJs = readFileSync(new URL('../engine/world/58-lobby-presentation.js', import.meta.url), 'utf8');
const cctvPlacementJs = readFileSync(new URL('../engine/world/63-cctv-placement.js', import.meta.url), 'utf8');
const cctvViewJs = readFileSync(new URL('../engine/world/67-cctv-view.js', import.meta.url), 'utf8');

test('explicit island exits open the world picker instead of exposing a restored selector board', () => {
  assert.match(roomJs, /WS\.exitToWorldPicker\s*=\s*function\s*\(\)/);
  assert.match(roomJs, /function openWorldPickerFromGate\(\)[\s\S]*WS\.exitToWorldPicker\(\)/);
  assert.match(hudJs, /WS\.exitToWorldPicker\(\)/);
});

test('island exit HUD does not reuse the account sign-out icon', () => {
  assert.match(hudJs, /tw-hud-back-worlds/);
  assert.match(hudJs, /T\('worlds\.backToWorlds'\)/);
  assert.match(hudJs, /ic\('reply', 16\)/);
  assert.doesNotMatch(hudJs, /tw-hud-leave[\s\S]*ic\('leave', 16\)/);
});

test('room teardown does not restore builder state as a minimap side effect', () => {
  const match = roomJs.match(/function hideBaseMinimap\(hide\) \{([\s\S]*?)\n    \}/);
  assert.ok(match, 'hideBaseMinimap function exists');
  assert.doesNotMatch(match[1], /restoreFreeform|clearActiveTinyverseSession/);
});

test('legacy multi-gate picker boards are not restored behind the world picker', () => {
  assert.match(universeJs, /function looksLikeLegacyPickerBoard\(state\)/);
  assert.match(universeJs, /stargates >= 4/);
  assert.match(universeJs, /applyState\(looksLikeLegacyPickerBoard\(savedFreeform\) \? \{ v: 4, gridSize: 8, cells: \[\] \} : savedFreeform\)/);
});

test('world minimap uses the same front/back orientation for drawing and clicks', () => {
  assert.match(roomJs, /function mapCellRect\(x, z\)/);
  assert.match(roomJs, /gridSize - 1 - z/);
  assert.match(roomJs, /function mapCanvasPointToCell\(px, py, width, height\)/);
  assert.match(roomJs, /const cz = gridSize - 1 - row/);
  assert.doesNotMatch(roomJs, /fillRect\(x \* CELL, z \* CELL, CELL, CELL\)/);
});

test('lobby big screen and CCTV only mount in the configured lobby world', () => {
  for (const src of [lobbyPresentationJs, cctvPlacementJs]) {
    assert.match(src, /window\.__TW_LOBBY_WORLD_SLUG \|\| 'tidewater-bay'/);
    assert.match(src, /function isLobbyWorld\(w\)/);
    assert.match(src, /String\(w\.slug \|\| ''\)\.toLowerCase\(\) === LOBBY_WORLD_SLUG/);
    assert.doesNotMatch(src, /d\.world\.slug === 'tinyverse-nexus'/);
  }
  assert.match(lobbyPresentationJs, /if \(!activeLobbyRoom\) \{ hide\(\); return; \}/);
  assert.match(cctvPlacementJs, /if \(!currentWorldIsLobby\) return;/);
  assert.match(cctvViewJs, /requestedWorldSlug && requestedWorldSlug !== lobbyWorldSlug/);
});
