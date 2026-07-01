// Unit tests for setCell normalization rules — the core data contract.
// These test the terrain/kind coercion, floors defaults, buildingType/fenceSide
// clearing, and extras carrying that setCell enforces. The render functions are
// stubbed so we test the logic without Three.js.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildEngineFns } from './helpers/extract-fn.mjs';
import path from 'node:path';

const file = path.resolve('engine/world/17-tile-renderers.js');

const preamble = `
  const GRID = 8;
  const TILE = 1;
  const MAX_FLOORS = 8;
  const CROP_KINDS = new Set(['crop', 'corn', 'wheat', 'pumpkin', 'carrot', 'sunflower']);
  let world = [];
  const cellMeshes = {};
  const cellMeshesGrid = [];
  function initCellMeshesGrid() { cellMeshesGrid.length = 0; for (let x = 0; x < GRID; x++) cellMeshesGrid[x] = new Array(GRID); }
  initCellMeshesGrid();
  function getOrCreateCellMeshEntry(x, z) {
    const key = x + ',' + z;
    let entry = cellMeshes[key];
    if (!entry) { entry = cellMeshes[key] = { tile: null, object: null, extras: [], x, z }; if (x>=0&&x<GRID&&z>=0&&z<GRID) cellMeshesGrid[x][z] = entry; }
    return entry;
  }
  function getCellMeshEntry(x, z) { return cellMeshes[x + ',' + z] || null; }
  function hasCellTileMesh(x, z) { const e = cellMeshes[x + ',' + z]; return !!(e && e.tile); }
  function getWorldCell(x, z) { return (world[x] && world[x][z]) || { terrain: 'grass', kind: null, floors: 1, buildingType: null, fenceSide: null, extras: [], appearance: null, waterFlow: 'auto', terrainFloors: 1 }; }
  function ensureWorldCell(x, z) { if (!world[x]) world[x] = []; if (!world[x][z]) world[x][z] = { terrain: 'grass', kind: null, floors: 1, buildingType: null, fenceSide: null, extras: [], appearance: null, waterFlow: 'auto', terrainFloors: 1 }; return world[x][z]; }
  function defaultCell() { return { terrain: 'grass', kind: null, floors: 1, buildingType: null, fenceSide: null, extras: [], appearance: null, waterFlow: 'auto', terrainFloors: 1 }; }
  function normalizeFenceSide(side) { return side || 'n'; }
  function normalizeAppearance(a) { return a || null; }
  function normalizeCellEconomy(e) { return e || null; }
  function normalizeWaterFlow(w) { return w || 'auto'; }
  function sameAppearance(a, b) { return JSON.stringify(a) === JSON.stringify(b); }
  function sameCellEconomy(a, b) { return JSON.stringify(a) === JSON.stringify(b); }
  function terrainLevelForCell(cell) { return cell.terrainFloors || 1; }
  function tileLevelForCell(cell) { return (cell.terrainFloors || 1) + (cell.floors ? cell.floors - 1 : 0); }
  function repaintProfileBegin() { return 0; }
  function repaintProfileEnd() {}
  const _renderLog = [];
  function pushWorldHistorySnapshot() {}
  function saveState() {}
  function emitCellWebhook() {}
  function notifyWorldChanged() {}
  function renderCellTile(x, z) { _renderLog.push({ type: 'tile', x, z }); }
  function renderCellObject(x, z) { _renderLog.push({ type: 'object', x, z }); }
  function renderCellExtras(x, z) { _renderLog.push({ type: 'extras', x, z }); }
  function shouldRenderCellMesh() { return true; }
  function isVehicleDrivableCell(cell) { return cell && cell.terrain === 'path' && !cell.kind; }
  function refreshVehiclesForWorldObstacleChange() {}
  function isOutsideHomeGrid(x, z) { return x < 0 || x >= GRID || z < 0 || z >= GRID; }
  function isEditableIslandCell() { return false; }
  function positiveMod(a, b) { return ((a % b) + b) % b; }
  function cellRenderPositionForCell(x, z) { return { x: x - GRID/2 + 0.5, z: z - GRID/2 + 0.5 }; }
  function tilePos(x, z) { return { x: x - GRID/2 + 0.5, z: z - GRID/2 + 0.5 }; }
  function isLandscapeMeshActive() { return false; }
  function isCarriagePumpkin() { return false; }
  function isCropCell(cell) { return !!(cell && CROP_KINDS.has(cell.kind)); }
  function isCastleFence() { return false; }
  function getRockNeighbors() { return {}; }
  function getBridgeOrientation() { return 'x'; }
  function getPathNeighbors() { return {}; }
  function getCastleWallNeighbors() { return {}; }
  function fenceStyleForCell() { return 'wood'; }
  function findHouseCluster(x, z) { return { isAnchor: true, anchorX: x, anchorZ: z, kind: 'solo', length: 1, orientation: 'x', topology: null }; }
  function bfsHouseCluster(x, z) { return [{ x, z }]; }
  function findFenceRenderSpan(x, z) { return { anchorX: x, anchorZ: z }; }
  const _cropPositions = new Set();
  const _maxPumpkinPositions = new Set();
  function addCropPosition(x, z) { _cropPositions.add(x + ',' + z); }
  function removeCropPosition(x, z) { _cropPositions.delete(x + ',' + z); }
  function updateCarriageAfterChange(x, z, wasMax, isMax) {
    const key = x + ',' + z;
    if (wasMax && !isMax) _maxPumpkinPositions.delete(key);
    if (!wasMax && isMax) _maxPumpkinPositions.add(key);
  }
  function eachMaxPumpkin(cb) { for (const key of _maxPumpkinPositions) { const [px, pz] = key.split(',').map(Number); cb(px, pz); } }
  function eachMaxPumpkin(cb) {}
  function addCropPosition() {}
  function removeCropPosition() {}
  function updateCarriageAfterChange() {}
  function scheduleHomeBorderEdgeRefresh() {}
  function setActiveWindowOverride() {}
  let selectedTool = null;
  let suppressSave = false;
  function __resetWorld() {
    world = [];
    for (let x = 0; x < GRID; x++) {
      world[x] = [];
      for (let z = 0; z < GRID; z++) {
        world[x][z] = { terrain: 'grass', kind: null, floors: 1, buildingType: null, fenceSide: null, extras: [], appearance: null, waterFlow: 'auto', terrainFloors: 1 };
      }
    }
  }
  function __getWorldCell(x, z) { return world[x] && world[x][z]; }
  function __getRenderLog() { return _renderLog.slice(); }
  function __clearRenderLog() { _renderLog.length = 0; }
  function __getCropPositions() { return Array.from(_cropPositions); }
  function __getMaxPumpkinPositions() { return Array.from(_maxPumpkinPositions); }
  globalThis.__resetWorld = __resetWorld;
  globalThis.__getWorldCell = __getWorldCell;
  globalThis.__getRenderLog = __getRenderLog;
  globalThis.__clearRenderLog = __clearRenderLog;
  globalThis.__getCropPositions = __getCropPositions;
  globalThis.__getMaxPumpkinPositions = __getMaxPumpkinPositions;
`;

const { setCellImpl } = buildEngineFns(file, ['setCellImpl'], preamble);

test('setCell coerces bridge kind to water terrain', () => {
  globalThis.__resetWorld();
  setCellImpl(2, 3, { kind: 'bridge' });
  const c = globalThis.__getWorldCell(2, 3);
  assert.equal(c.kind, 'bridge');
  assert.equal(c.terrain, 'water');
});

test('setCell coerces crop kinds to dirt terrain', () => {
  globalThis.__resetWorld();
  setCellImpl(1, 1, { kind: 'corn' });
  const c = globalThis.__getWorldCell(1, 1);
  assert.equal(c.kind, 'corn');
  assert.equal(c.terrain, 'dirt');
});

test('setCell coerces house on water/path/lava to grass', () => {
  globalThis.__resetWorld();
  setCellImpl(0, 0, { kind: 'house', terrain: 'water' });
  const c = globalThis.__getWorldCell(0, 0);
  assert.equal(c.kind, 'house');
  assert.equal(c.terrain, 'grass');
});

test('setCell clears kind when terrain is water and kind is not water-compatible', () => {
  globalThis.__resetWorld();
  setCellImpl(0, 0, { terrain: 'water', kind: 'tree' });
  const c = globalThis.__getWorldCell(0, 0);
  assert.equal(c.terrain, 'water');
  assert.equal(c.kind, null);
});

test('setCell keeps kind when terrain is water and kind is rock', () => {
  globalThis.__resetWorld();
  setCellImpl(0, 0, { terrain: 'water', kind: 'rock' });
  const c = globalThis.__getWorldCell(0, 0);
  assert.equal(c.terrain, 'water');
  assert.equal(c.kind, 'rock');
});

test('setCell coerces house on water to grass (house cannot sit on water)', () => {
  globalThis.__resetWorld();
  setCellImpl(0, 0, { terrain: 'water', kind: 'house' });
  const c = globalThis.__getWorldCell(0, 0);
  assert.equal(c.kind, 'house');
  assert.equal(c.terrain, 'grass');
});

test('setCell clears kind when terrain is lava and kind is not rock', () => {
  globalThis.__resetWorld();
  setCellImpl(0, 0, { terrain: 'lava', kind: 'tree' });
  const c = globalThis.__getWorldCell(0, 0);
  assert.equal(c.terrain, 'lava');
  assert.equal(c.kind, null);
});

test('setCell defaults floors to 1 on fresh kind placement', () => {
  globalThis.__resetWorld();
  setCellImpl(0, 0, { kind: 'house' });
  const c = globalThis.__getWorldCell(0, 0);
  assert.equal(c.floors, 1);
});

test('setCell preserves floors when same kind without specifying', () => {
  globalThis.__resetWorld();
  setCellImpl(0, 0, { kind: 'house', floors: 3 });
  assert.equal(globalThis.__getWorldCell(0, 0).floors, 3);
  setCellImpl(0, 0, { kind: 'house' });
  assert.equal(globalThis.__getWorldCell(0, 0).floors, 3);
});

test('setCell clears buildingType when kind changes to non-house', () => {
  globalThis.__resetWorld();
  setCellImpl(0, 0, { kind: 'house', buildingType: 'manor' });
  assert.equal(globalThis.__getWorldCell(0, 0).buildingType, 'manor');
  setCellImpl(0, 0, { kind: 'tree' });
  const c = globalThis.__getWorldCell(0, 0);
  assert.equal(c.kind, 'tree');
  assert.equal(c.buildingType, null);
});

test('setCell clears fenceSide when kind changes to non-fence', () => {
  globalThis.__resetWorld();
  setCellImpl(0, 0, { kind: 'fence', fenceSide: 'n' });
  assert.equal(globalThis.__getWorldCell(0, 0).fenceSide, 'n');
  setCellImpl(0, 0, { kind: 'tree' });
  const c = globalThis.__getWorldCell(0, 0);
  assert.equal(c.kind, 'tree');
  assert.equal(c.fenceSide, null);
});

test('setCell carries extras when not explicitly set', () => {
  globalThis.__resetWorld();
  setCellImpl(0, 0, { kind: 'tree', extras: [{ kind: 'fence', fenceSide: 'n' }] });
  assert.equal(globalThis.__getWorldCell(0, 0).extras.length, 1);
  setCellImpl(0, 0, { kind: 'tree' });
  assert.equal(globalThis.__getWorldCell(0, 0).extras.length, 1);
});

test('setCell resets rotationY to 0 on fresh kind', () => {
  globalThis.__resetWorld();
  setCellImpl(0, 0, { kind: 'tree', rotationY: 1.5 });
  assert.equal(globalThis.__getWorldCell(0, 0).rotationY, 1.5);
  setCellImpl(0, 0, { kind: 'rock' });
  const c = globalThis.__getWorldCell(0, 0);
  assert.equal(c.kind, 'rock');
  assert.equal(c.rotationY, 0);
});

test('setCell resets appearance to null on fresh kind', () => {
  globalThis.__resetWorld();
  setCellImpl(0, 0, { kind: 'tree', appearance: { color: '#ff0000' } });
  assert.ok(globalThis.__getWorldCell(0, 0).appearance);
  setCellImpl(0, 0, { kind: 'rock' });
  assert.equal(globalThis.__getWorldCell(0, 0).appearance, null);
});
