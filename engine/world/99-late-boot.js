  // -------- late boot (deferred forward-ref-safe calls) --------
  // Calls relocated here from earlier modules whose original top-level
  // position (valid under the single-script build's hoisting) now runs before
  // their dependencies' modules have loaded. Running them once at the end —
  // after every module is defined — reproduces the original behaviour.

  // Was at module 02 top level; reaches syncCloudPopulation/clouds (module 23).
  // Guarded internally (no-op until clouds exist), so an extra end-of-load
  // sync is safe and idempotent.
  applyCloudSettings();

  // Render-settings panel wiring (module 21). Was an IIFE that ran at module
  // load and reached forward into module 27 (syncPlanetUnderlayToggle) and
  // syncAiSettings. Runs identically here, after every module is defined.
  setupRenderSettings();

  // Build the cloud sea now if it was left enabled in a previous session
  // (default is off, so this is usually a no-op).
  if (typeof setCloudSeaEnabled === 'function' && typeof renderCloudSea !== 'undefined') {
    setCloudSeaEnabled(renderCloudSea);
  }
