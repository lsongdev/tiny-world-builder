/**
 * Standalone Landscape Engine for Three.js — core class.
 *
 * Generates procedural terraced canyons, biomes (desert/grassland/snow),
 * streaming chunk terrain, water, and flora. Supports realistic and
 * low-poly modes. Compatible with both global <script> tag inclusion and
 * ES module bundlers.
 *
 * The original 1300+ line god file has been broken up into focused
 * mixin modules that attach methods to LandscapeEngine.prototype:
 *
 *   - engine/landscape/noise.js       math helpers, getHeight, _strataColor
 *   - engine/landscape/shaders.js     terrain shader materials
 *   - engine/landscape/geometries.js  shared geos, flora builders, terrainMat
 *   - engine/landscape/water.js       reflective water plane
 *   - engine/landscape/chunks.js      chunk builders & build-queue plumbing
 *
 * When loaded via <script> tags in the browser, those mixin files must be
 * included after this core file but before any `new LandscapeEngine(...)`
 * call. When consumed from Node or a bundler, require them in the same
 * order:
 *
 *   require('./LandscapeEngine.js');
 *   require('./engine/landscape/noise.js');
 *   require('./engine/landscape/shaders.js');
 *   require('./engine/landscape/geometries.js');
 *   require('./engine/landscape/water.js');
 *   require('./engine/landscape/chunks.js');
 */

// Handle either global THREE or bundler-imported THREE
const THREE = (typeof window !== 'undefined' && window.THREE) ? window.THREE : null;

class LandscapeEngine {
  /**
   * @param {Object} config
   * @param {THREE.Scene} config.scene - Target Three.js Scene
   * @param {number} [config.seed=8472] - Random number seed for terrain/placement
   * @param {string} [config.initialBiome='grassland'] - 'grassland', 'desert', or 'snow'
   * @param {string} [config.styleMode='realistic'] - 'realistic' or 'lowpoly'
   * @param {THREE.Color} [config.fogColorOut] - Color object updated with current fog color
   */
  constructor({ scene, seed = 8472, initialBiome = 'grassland', styleMode = 'realistic', fogColorOut = null }) {
    if (!THREE) {
      throw new Error('LandscapeEngine: Three.js (THREE) must be loaded first.');
    }
    this.scene = scene;
    this.seed = seed;
    this.currentBiomeName = initialBiome;
    this.styleMode = styleMode; // 'realistic' or 'lowpoly'
    this.fogColorOut = fogColorOut;

    // Clip bounds (world-space AABB). When enabled, fragments outside
    // the box are discarded, producing clean flat faces at the boundary.
    this._clipEnabled = false;
    this._clipMin = new THREE.Vector3(-1e6, -1e6, -1e6);
    this._clipMax = new THREE.Vector3( 1e6,  1e6,  1e6);
    this._clipPlanes = [];

    // Grid Settings
    this.CHUNK_SIZE = 600;
    this.CHUNK_RES = 60;
    this.RENDER_RADIUS = 3; // 7x7 high-detail grid around target

    this.FAR_CHUNK_SIZE = 1800;
    this.FAR_CHUNK_RES = 90;
    this.FAR_RADIUS = 4; // 9x9 far LOD grid

    this.AIRFIELD_FLAT_RADIUS = 230;
    this.AIRFIELD_FLAT_R2 = this.AIRFIELD_FLAT_RADIUS * this.AIRFIELD_FLAT_RADIUS;
    this.AIRFIELD_SURFACE_Y = 0.08;

    this.WATER_LEVEL = 4.0;
    this.WATER_EXTENT = 24000;
    this.WATER_RUNWAY_R = 420;

    // Active collections
    this.chunks = new Map();
    this.farChunks = new Map();
    this.pendingChunkBuilds = [];
    this.pendingChunkKeys = new Set();
    this.pendingFarChunkBuilds = [];
    this.pendingFarChunkKeys = new Set();

    // Configuration constants
    this.SEED_OX = (this.seed * 17.31) % 1000;
    this.SEED_OY = (this.seed * 23.79) % 1000;

    // Biome Settings
    this.BIOMES = {
      desert: {
        strata: [
          { h: -10, c: 0x3a2218 }, { h:   6, c: 0x5a3220 },
          { h:  22, c: 0x8a4d2e }, { h:  42, c: 0xb16b40 },
          { h:  60, c: 0xc78854 }, { h:  92, c: 0xd49868 },
          { h: 130, c: 0xdfb486 }, { h: 180, c: 0xe2c79c },
          { h: 260, c: 0xdcc7a4 },
        ],
        cliffTint: 0x7a3c22,
        fogColor: 0xe8b888,
        skyTop: 0x4a7ca8, skyBottom: 0xffd4a0,
        groundTint: 0x6a4830, ambient: 0x2a2520,
        lowPolyAmbient: 0x3a3328,
        sunColor: 0xfff1d4,
        hasCactus: true, pineChance: 0.55, shrubChance: 0.85,
      },
      snow: {
        strata: [
          { h: -10, c: 0x2a2a30 }, { h:   6, c: 0x404050 },
          { h:  22, c: 0x5a5f6a }, { h:  42, c: 0x8088a0 },
          { h:  60, c: 0xb4c0cf }, { h:  92, c: 0xd4dde6 },
          { h: 130, c: 0xe8edf2 }, { h: 180, c: 0xf6f8fb },
          { h: 260, c: 0xffffff },
        ],
        cliffTint: 0x3a3a4a,
        fogColor: 0xbfd0e0,
        skyTop: 0x5a7ca8, skyBottom: 0xdae4ec,
        groundTint: 0x5a6878, ambient: 0x2a303a,
        lowPolyAmbient: 0x3a4250,
        sunColor: 0xf4f2ec,
        hasCactus: false, pineChance: 0.75, shrubChance: 0.25,
      },
      grassland: {
        strata: [
          { h: -10, c: 0x2a3818 }, { h:   6, c: 0x3e5e22 },
          { h:  22, c: 0x548030 }, { h:  42, c: 0x6a9040 },
          { h:  60, c: 0x7e9448 }, { h:  92, c: 0x8c9458 },
          { h: 130, c: 0x90886a }, { h: 180, c: 0xa09c88 },
          { h: 260, c: 0xb4b0a0 },
        ],
        cliffTint: 0x4a3820,
        fogColor: 0xc4d8c0,
        skyTop: 0x6090c0, skyBottom: 0xdee8c8,
        groundTint: 0x405030, ambient: 0x2a3820,
        lowPolyAmbient: 0x3a4828,
        sunColor: 0xfff4d0,
        hasCactus: false, pineChance: 0.7, shrubChance: 0.85,
      },
    };

    this.currentBiome = { ...this.BIOMES[this.currentBiomeName] };
    this.STRATA = this.currentBiome.strata.map(s => ({ h: s.h, c: new THREE.Color(s.c) }));
    this.CLIFF_TINT = new THREE.Color(this.currentBiome.cliffTint);

    // Sun direction vector
    this.sunDir = new THREE.Vector3(0.58, 0.76, 0.28).normalize();

    // These are defined by the mixin modules listed at the top of this file.
    // They run synchronously inside the constructor, so all mixins must be
    // loaded before `new LandscapeEngine(...)` is called.
    if (typeof this._initSharedShaders !== 'function' ||
        typeof this._initSharedGeometries !== 'function' ||
        typeof this._initWater !== 'function') {
      throw new Error(
        'LandscapeEngine: required mixins not loaded. Include engine/landscape/{noise,shaders,geometries,water,chunks}.js before constructing.'
      );
    }
    this._initSharedShaders();
    this._initSharedGeometries();
    this._initWater();
  }

  // --- Public Interface ---

  /**
   * Sets the active biome name and re-maps all color palettes.
   * @param {string} name - 'desert', 'grassland', or 'snow'
   */
  setBiome(name) {
    if (!this.BIOMES[name]) return;
    this.currentBiomeName = name;
    this.currentBiome = { ...this.BIOMES[name] };
    this.STRATA = this.currentBiome.strata.map(s => ({ h: s.h, c: new THREE.Color(s.c) }));
    this.CLIFF_TINT = new THREE.Color(this.currentBiome.cliffTint);

    const uniforms = this.sandMat.uniforms;
    uniforms.sunColor.value.setHex(this.currentBiome.sunColor);
    uniforms.ambientColor.value.setHex(this.currentBiome.ambient);
    uniforms.skyTint.value.setHex(this.currentBiome.skyTop);
    uniforms.groundTint.value.setHex(this.currentBiome.groundTint);
    uniforms.fogColor.value.setHex(this.currentBiome.fogColor);

    const lpUniforms = this.sandMatLowPoly.uniforms;
    lpUniforms.sunColor.value.setHex(this.currentBiome.sunColor);
    lpUniforms.ambientColor.value.setHex(this.currentBiome.lowPolyAmbient);
    lpUniforms.skyTint.value.setHex(this.currentBiome.skyTop);
    lpUniforms.groundTint.value.setHex(this.currentBiome.groundTint);
    lpUniforms.fogColor.value.setHex(this.currentBiome.fogColor);

    this.waterMat.uniforms.skyTop.value.setHex(this.currentBiome.skyTop);
    this.waterMat.uniforms.skyBottom.value.setHex(this.currentBiome.skyBottom);
    this.waterMat.uniforms.fogColor.value.setHex(this.currentBiome.fogColor);

    if (this.fogColorOut) {
      this.fogColorOut.setHex(this.currentBiome.fogColor);
    }

    this.clearChunks();
  }

  /**
   * Switches visual style mode.
   * @param {string} mode - 'realistic' or 'lowpoly'
   */
  setStyleMode(mode) {
    if (mode !== 'realistic' && mode !== 'lowpoly') return;
    this.styleMode = mode;
    this.clearChunks();
  }

  /**
   * Sets a world-space AABB clip box. Fragments outside the box are discarded
   * on the XZ plane, creating clean flat faces at the boundary.
   * @param {THREE.Vector3} min - Minimum corner of the clip box
   * @param {THREE.Vector3} max - Maximum corner of the clip box
   */
  setClipBounds(min, max) {
    this._clipEnabled = true;
    this._clipMin.copy(min);
    this._clipMax.copy(max);

    // Update shader uniforms (all three share the same Vector3 refs)
    const mats = [this.sandMat, this.sandMatLowPoly, this.waterMat];
    for (const m of mats) {
      m.uniforms.clipEnabled.value = 1.0;
    }
    if (this.terrainMat && this.terrainMat.userData && this.terrainMat.userData.clipEnabled) {
      this.terrainMat.userData.clipEnabled.value = 1.0;
    }

    // Build native clipping planes for Lambert/Phong materials (rocks, flora).
    // Four planes forming an XZ box: +X, -X, +Z, -Z.
    this._clipPlanes = [
      new THREE.Plane(new THREE.Vector3(-1, 0, 0), max.x),  // x <= max.x
      new THREE.Plane(new THREE.Vector3( 1, 0, 0), -min.x), // x >= min.x
      new THREE.Plane(new THREE.Vector3( 0, 0,-1), max.z),  // z <= max.z
      new THREE.Plane(new THREE.Vector3( 0, 0, 1), -min.z), // z >= min.z
    ];
    const builtinMats = [this.rockMat, this.rockMatLowPoly, this.floraMat, this.floraMatLow, this.terrainMat];
    for (const m of builtinMats) {
      m.clippingPlanes = this._clipPlanes;
    }
  }

  /**
   * Clears the clip box so the terrain extends to the horizon.
   */
  clearClipBounds() {
    this._clipEnabled = false;
    this._clipMin.set(-1e6, -1e6, -1e6);
    this._clipMax.set( 1e6,  1e6,  1e6);
    const mats = [this.sandMat, this.sandMatLowPoly, this.waterMat];
    for (const m of mats) {
      m.uniforms.clipEnabled.value = 0.0;
    }
    if (this.terrainMat && this.terrainMat.userData && this.terrainMat.userData.clipEnabled) {
      this.terrainMat.userData.clipEnabled.value = 0.0;
    }
    this._clipPlanes = [];
    const builtinMats = [this.rockMat, this.rockMatLowPoly, this.floraMat, this.floraMatLow, this.terrainMat];
    for (const m of builtinMats) {
      m.clippingPlanes = null;
    }
  }

  /**
   * Clears out all loaded and pending chunks to force rebuilds.
   */
  clearChunks() {
    for (const c of this.chunks.values()) {
      this.scene.remove(c.group);
      c.geo.dispose();
    }
    this.chunks.clear();

    for (const fc of this.farChunks.values()) {
      this.scene.remove(fc.group);
      fc.geo.dispose();
    }
    this.farChunks.clear();

    this.pendingChunkBuilds = [];
    this.pendingChunkKeys.clear();
    this.pendingFarChunkBuilds = [];
    this.pendingFarChunkKeys.clear();
  }

  /**
   * Updates streaming chunks and shifts water based on the camera position.
   * Call this inside your requestAnimationFrame / physics update loop.
   * @param {THREE.Vector3} focusPos - Camera or player coordinate position
   * @param {number} dt - Delta time since last update (seconds)
   */
  update(focusPos, dt) {
    const px = focusPos.x;
    const pz = focusPos.z;

    // --- 1. Water positioning ---
    this.waterMat.uniforms.time.value += dt;
    this.waterMat.uniforms.cameraPos.value.copy(focusPos);
    const step = 40;
    this.waterMesh.position.x = Math.round(px / step) * step;
    this.waterMesh.position.z = Math.round(pz / step) * step;

    // --- 2. High-Detail Chunks Streaming ---
    const pcx = Math.floor(px / this.CHUNK_SIZE);
    const pcz = Math.floor(pz / this.CHUNK_SIZE);
    const wantedNear = new Set();

    for (let dz = -this.RENDER_RADIUS; dz <= this.RENDER_RADIUS; dz++) {
      for (let dx = -this.RENDER_RADIUS; dx <= this.RENDER_RADIUS; dx++) {
        const cx = pcx + dx;
        const cz = pcz + dz;
        const key = `${cx},${cz}`;
        wantedNear.add(key);
        if (!this.chunks.has(key)) {
          this._queueChunkBuild(
            this.pendingChunkBuilds,
            this.pendingChunkKeys,
            this.chunks,
            cx, cz,
            Math.abs(dx) + Math.abs(dz)
          );
        }
      }
    }

    this._trimPendingChunkBuilds(this.pendingChunkBuilds, this.pendingChunkKeys, wantedNear);

    for (const [key, c] of this.chunks) {
      if (!wantedNear.has(key)) {
        this.scene.remove(c.group);
        c.geo.dispose();
        this.chunks.delete(key);
      }
    }

    // --- 3. Far LOD Chunks Streaming ---
    const fpcx = Math.floor(px / this.FAR_CHUNK_SIZE);
    const fpcz = Math.floor(pz / this.FAR_CHUNK_SIZE);
    const wantedFar = new Set();

    for (let dz = -this.FAR_RADIUS; dz <= this.FAR_RADIUS; dz++) {
      for (let dx = -this.FAR_RADIUS; dx <= this.FAR_RADIUS; dx++) {
        const cx = fpcx + dx;
        const cz = fpcz + dz;

        const worldXMin = cx * this.FAR_CHUNK_SIZE;
        const worldXMax = (cx + 1) * this.FAR_CHUNK_SIZE;
        const worldZMin = cz * this.FAR_CHUNK_SIZE;
        const worldZMax = (cz + 1) * this.FAR_CHUNK_SIZE;

        const nearXMin = (pcx - this.RENDER_RADIUS) * this.CHUNK_SIZE - 200;
        const nearXMax = (pcx + this.RENDER_RADIUS + 1) * this.CHUNK_SIZE + 200;
        const nearZMin = (pcz - this.RENDER_RADIUS) * this.CHUNK_SIZE - 200;
        const nearZMax = (pcz + this.RENDER_RADIUS + 1) * this.CHUNK_SIZE + 200;

        const fullyInside = (worldXMin >= nearXMin && worldXMax <= nearXMax &&
                             worldZMin >= nearZMin && worldZMax <= nearZMax);

        if (fullyInside) continue;

        const key = `${cx},${cz}`;
        wantedFar.add(key);

        if (!this.farChunks.has(key)) {
          this._queueChunkBuild(
            this.pendingFarChunkBuilds,
            this.pendingFarChunkKeys,
            this.farChunks,
            cx, cz,
            Math.abs(dx) + Math.abs(dz)
          );
        }
      }
    }

    this._trimPendingChunkBuilds(this.pendingFarChunkBuilds, this.pendingFarChunkKeys, wantedFar);

    for (const [key, fc] of this.farChunks) {
      if (!wantedFar.has(key)) {
        this.scene.remove(fc.group);
        fc.geo.dispose();
        this.farChunks.delete(key);
      }
    }

    this._processChunkBuildQueues(2, 2);
  }

  /**
   * Cleans up all materials, textures, and geometry to prevent WebGL memory leaks.
   */
  dispose() {
    this.clearChunks();
    this.scene.remove(this.waterMesh);
    this.waterGeo.dispose();
    this.waterMat.dispose();

    this.sandMat.dispose();
    this.sandMatLowPoly.dispose();
    this.terrainMat.dispose();
    this.rockMat.dispose();
    this.rockMatLowPoly.dispose();
    this.rockGeo.dispose();

    this.pineGeo.dispose();
    this.cactusGeo.dispose();
    this.shrubGeo.dispose();
    this.boulderGeo.dispose();

    this.floraMat.dispose();
    this.floraMatLow.dispose();
  }
}

// Publish the class globally first so the mixin scripts can attach methods
// to its prototype. Then export for CommonJS/bundler consumers.
if (typeof window !== 'undefined') {
  window.LandscapeEngine = LandscapeEngine;
}
if (typeof exports !== 'undefined') {
  exports.LandscapeEngine = LandscapeEngine;
} else if (typeof module !== 'undefined' && module.exports) {
  module.exports = { LandscapeEngine };
}
