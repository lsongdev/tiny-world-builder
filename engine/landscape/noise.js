/**
 * LandscapeEngine — noise & height sampling mixin.
 *
 * Attaches math helpers (smoothstep, hash, value-noise, fbm), terrain
 * height sampling, and strata color lookup to LandscapeEngine.prototype.
 *
 * Depends on: LandscapeEngine being defined globally (loaded before this
 * script) and window.THREE.
 */
(function (global) {
  if (!global.LandscapeEngine) {
    throw new Error('engine/landscape/noise.js: LandscapeEngine must be loaded first.');
  }

  Object.assign(global.LandscapeEngine.prototype, {
    // --- Math Helpers ---
    _smoothstep(t) { return t * t * (3 - 2 * t); },
    _clamp01(t) { return Math.max(0, Math.min(1, t)); },
    _smoothstepRange(edge0, edge1, x) {
      const t = this._clamp01((x - edge0) / (edge1 - edge0));
      return this._smoothstep(t);
    },

    _hash2(x, y) {
      const s = Math.sin((x + this.SEED_OX) * 127.1 + (y + this.SEED_OY) * 311.7) * 43758.5453;
      return s - Math.floor(s);
    },

    _srand(a, b, salt = 0) {
      const s = Math.sin(a * 12.9898 + b * 78.233 + salt * 37.719 + this.seed * 0.1417) * 43758.5453;
      return s - Math.floor(s);
    },

    _vnoise(x, y) {
      const ix = Math.floor(x), iy = Math.floor(y);
      const fx = x - ix, fy = y - iy;
      const u = this._smoothstep(fx), v = this._smoothstep(fy);
      const a = this._hash2(ix, iy);
      const b = this._hash2(ix + 1, iy);
      const c = this._hash2(ix, iy + 1);
      const d = this._hash2(ix + 1, iy + 1);
      return a * (1 - u) * (1 - v) + b * u * (1 - v) +
             c * (1 - u) * v + d * u * v;
    },

    _fbm(x, y, oct) {
      let v = 0, a = 1, f = 1, tot = 0;
      for (let i = 0; i < oct; i++) {
        v += a * this._vnoise(x * f, y * f);
        tot += a;
        a *= 0.5; f *= 2;
      }
      return v / tot;
    },

    /**
     * Flooded-planet height field: a drowned world of small, scattered islands.
     * Only used when this.flood is set (the planet underlay); the home builder's
     * canyon terrain is left untouched. Most of the domain sits below WATER_LEVEL
     * (a flat-ish seabed) with sparse archipelagos poking above into sandy isles.
     * FREQ_SCALE shrinks/multiplies the islands; HEIGHT_SCALE controls relief.
     */
    _floodHeight(x, z) {
      const fs = this.FREQ_SCALE || 1;
      const hs = this.HEIGHT_SCALE || 1;
      const f = 0.0011 * fs;
      // Large-scale archipelago regions: bands of "more islands" vs open ocean.
      const region = this._fbm(x * f * 0.30 + 19.7, z * f * 0.30 - 4.2, 3);
      // The island field itself.
      const n = this._fbm(x * f, z * f, 4);
      // Land only where the field clears a high bar, nudged by the region mask, so
      // islands stay sparse and scattered with plenty of water between them.
      let land = (n - 0.60) + (region - 0.5) * 0.22;
      if (land <= 0) {
        // Seabed dips below the waterline so the ocean plane reads as water.
        const depth = 8 + (0.6 - n) * 55;
        return Math.max(0, this.WATER_LEVEL - depth);
      }
      land = Math.pow(land, 1.25);
      let h = this.WATER_LEVEL + land * 320 * hs;                 // rise to low hills
      h += (this._fbm(x * f * 4, z * f * 4, 2) - 0.5) * 10 * hs;  // micro-relief
      return Math.max(this.WATER_LEVEL - 2, h);
    },

    /**
     * Evaluates the absolute height of the canyon terrain at grid coordinates.
     * @param {number} x - X Coordinate
     * @param {number} z - Z Coordinate
     * @returns {number} Height
     */
    getHeight(x, z) {
      if (this.flood) return this._floodHeight(x, z);
      const runwayEllipse = Math.hypot(x * 1.45, z * 0.22);
      const runwayMask = this._smoothstepRange(220, 560, runwayEllipse);
      const corridorX = 1 - this._smoothstepRange(135, 360, Math.abs(x));
      const corridorZ = 1 - this._smoothstepRange(260, 1850, Math.abs(z));
      const approachCorridor = this._clamp01(corridorX * corridorZ);

      let h = 0, amp = 1, freq = 0.0018, tot = 0;
      for (let i = 0; i < 5; i++) {
        const n = this._vnoise(x * freq, z * freq);
        h += amp * (1 - Math.abs(n * 2 - 1)); // ridged
        tot += amp;
        amp *= 0.5; freq *= 2;
      }
      h = Math.pow(h / tot, 2.4) * 260;

      // Large-scale valleys
      h += (this._fbm(x * 0.0006, z * 0.0006, 3) - 0.4) * 120;
      h = Math.max(0, h);

      // Terracing mesas
      const step = 28;
      const t = h / step;
      const base = Math.floor(t);
      const frac = t - base;
      const tr = frac < 0.72 ? 0 : this._smoothstep((frac - 0.72) / 0.28);
      h = (base + tr) * step;

      // Carve runway corridor
      h *= Math.max(runwayMask, 1 - approachCorridor * 0.96);
      h = Math.max(0, h - approachCorridor * 22);

      // Airstrip basin details
      const basinRipple = (1 - runwayMask) * (this._fbm(x * 0.006, z * 0.006, 2) - 0.5) * 5.5;
      h = Math.max(0, h + basinRipple);

      // Airfield flatness exclusion
      const runwayPad = (1 - this._smoothstepRange(18, 42, Math.abs(x)))
        * (1 - this._smoothstepRange(215, 285, Math.abs(z)));
      const apronPad = (1 - this._smoothstepRange(8, 74, Math.abs(x - 34)))
        * (1 - this._smoothstepRange(92, 210, Math.abs(z - 150)));
      const taxiPad = (1 - this._smoothstepRange(6, 18, Math.abs(x - 17)))
        * (1 - this._smoothstepRange(62, 168, Math.abs(z - 116)));
      const airfieldPad = this._clamp01(Math.max(runwayPad, apronPad, taxiPad));
      h *= 1 - airfieldPad * 0.998;
      h = Math.max(0, h - airfieldPad * 3.5);

      return h;
    },

    _strataColor(h, out) {
      for (let i = 0; i < this.STRATA.length - 1; i++) {
        if (h <= this.STRATA[i + 1].h) {
          const t = (h - this.STRATA[i].h) / (this.STRATA[i + 1].h - this.STRATA[i].h);
          out.copy(this.STRATA[i].c).lerp(this.STRATA[i + 1].c, Math.max(0, Math.min(1, t)));
          return out;
        }
      }
      out.copy(this.STRATA[this.STRATA.length - 1].c);
      return out;
    },
  });
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
