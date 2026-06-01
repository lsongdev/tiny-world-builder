// engine/world/41-flight-combat.js
// -------- flight combat: guns, targeting HUD, missiles --------
// Scene-space combat for the stunt plane. Hooked from 34-flight-sim.js via
// optional globals (same pattern as window.__tinyworldMultiplayer.broadcastFlight).
// Reads the rendered plane transform off window.__flightJet each tick; never
// touches the sim-space flight physics.
(function flightCombatModule() {
  'use strict';
  if (typeof THREE === 'undefined') return;

  // Step 1 muzzle-flash path: 23-particles-clouds.js exposes only weather/splash
  // emitters (emitSplash, emitWeatherBuildSurface, emitRainSurface, etc.) via
  // module-private closures — none are published as globals. No reusable burst
  // emitter is reachable from this module. Tracer meshes carry the visual for
  // now; muzzle flash deferred to a later refinement task.

  let active = false;
  let jet = null; // window.__flightJet while flying

  // ---- tracers ----
  const TRACER_POOL = 48;
  const TRACER_SPEED = 46;     // scene units/sec
  const TRACER_LIFE = 0.55;
  const FIRE_COOLDOWN = 0.11;
  let tracerGroup = null;
  const tracers = [];
  let fireCooldown = 0;
  let shotsFired = 0;
  const gunMuzzleL = new THREE.Vector3(); // jet-local offsets, set in onEnter
  const gunMuzzleR = new THREE.Vector3();
  const _muzzleWorld = new THREE.Vector3();
  const _fireDir = new THREE.Vector3();
  const _tracerQuat = new THREE.Quaternion();
  const _projForward = new THREE.Vector3(0, 0, 1);

  function ensureTracerPool() {
    if (tracerGroup) return;
    tracerGroup = new THREE.Group();
    tracerGroup.name = 'tw_flight_tracers';
    scene.add(tracerGroup);
    const geo = new THREE.BoxGeometry(0.03, 0.03, 0.6);
    const mat = new THREE.MeshBasicMaterial({
      color: 0xffce6a, toneMapped: false, transparent: true,
      opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false,
    });
    for (let i = 0; i < TRACER_POOL; i++) {
      const m = new THREE.Mesh(geo, mat.clone());
      m.visible = false;
      m.renderOrder = 30;
      m.raycast = () => {};
      tracerGroup.add(m);
      tracers.push({ mesh: m, vel: new THREE.Vector3(), life: 0, active: false });
    }
  }

  function spawnTracer(origin, dir) {
    const t = tracers.find(s => !s.active);
    if (!t) return;
    t.active = true;
    t.life = TRACER_LIFE;
    t.vel.copy(dir).multiplyScalar(TRACER_SPEED);
    t.mesh.position.copy(origin);
    t.mesh.quaternion.copy(_tracerQuat.setFromUnitVectors(_projForward, dir));
    t.mesh.visible = true;
  }

  function updateTracers(dt) {
    for (const t of tracers) {
      if (!t.active) continue;
      t.life -= dt;
      if (t.life <= 0) { t.active = false; t.mesh.visible = false; continue; }
      t.mesh.position.addScaledVector(t.vel, dt);
    }
  }

  function fireGuns() {
    if (!jet) return;
    const dir = window.__flightSceneForward
      ? window.__flightSceneForward(_fireDir)
      : _fireDir.set(0, 0, -1);
    for (const local of [gunMuzzleL, gunMuzzleR]) {
      _muzzleWorld.copy(local);
      jet.localToWorld(_muzzleWorld);
      spawnTracer(_muzzleWorld, dir);
      attemptInstantHit(_muzzleWorld, dir); // no-op until a later task
    }
    shotsFired++;
  }

  function attemptInstantHit(origin, dir) { /* implemented in a later task */ }

  // ---- bbox-derived muzzle offsets ----
  // NOTE: bbox.setFromObject yields world-space extents (jet scale already
  // applied). gunMuzzleL/R are treated as jet-local offsets and converted via
  // jet.localToWorld in fireGuns — valid approximation assuming jet local axes
  // are roughly world-aligned at size measurement time.
  // If browser check shows tracers spawning behind the plane, flip noseZ sign.
  const _bbox = new THREE.Box3();
  const _bsize = new THREE.Vector3();

  function onEnter(flyingJet) {
    jet = flyingJet || window.__flightJet || null;
    active = true;
    fireCooldown = 0;
    shotsFired = 0;
    ensureTracerPool();
    if (jet) {
      jet.updateMatrixWorld(true);
      _bbox.setFromObject(jet);
      _bbox.getSize(_bsize);
      // jet carries FLIGHT_MODEL_FWD_FIX so the VISUAL nose is +Z in jet-local.
      // Muzzles sit out along local X (wings) and toward the visual nose (+Z).
      const halfSpan = (_bsize.x * 0.5) * 0.62;
      const noseZ = (_bsize.z * 0.5) * 0.55;
      const dropY = -_bsize.y * 0.05;
      gunMuzzleL.set(-halfSpan, dropY, noseZ);
      gunMuzzleR.set(halfSpan, dropY, noseZ);
    }
  }

  function onExit() {
    active = false;
    jet = null;
  }

  function tick(dt) {
    if (!active || !(dt > 0)) return;
    fireCooldown = Math.max(0, fireCooldown - dt);
    const keys = window.__flightKeys || {};
    const firing = !!keys['Space'] || !!window.__flightFireHeld;
    if (firing && fireCooldown <= 0) {
      fireGuns();
      fireCooldown = FIRE_COOLDOWN;
    }
    updateTracers(dt);
  }

  function telemetry() {
    const dir = (active && window.__flightSceneForward)
      ? window.__flightSceneForward(_fireDir).clone() : null;
    return {
      active, hasJet: !!jet, shotsFired,
      fireDir: dir ? { x: dir.x, y: dir.y, z: dir.z } : null,
      muzzleL: jet ? jet.localToWorld(gunMuzzleL.clone()).toArray() : null,
      muzzleR: jet ? jet.localToWorld(gunMuzzleR.clone()).toArray() : null,
    };
  }

  window.__flightCombat = { onEnter, onExit, tick, telemetry };
})();
