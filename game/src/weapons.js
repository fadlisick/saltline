// The armoury: five guns and one grenade. Each weapon owns its numbers — damage,
// headshot multiplier, fire rate, magazine, reload, spread, recoil and price — and
// its own view model. The DMR is the only scoped gun: hold right mouse to look
// down its sight (narrower field of view, near-zero spread, slower move). main.js
// owns the ray; bots.js owns the same numbers for bots.
import * as THREE from 'three';
import { PALETTE } from './palette.js';

export const WEAPONS = {
  sidearm: {
    name: 'VK-9 Sidearm', price: 0, damage: 26, headMult: 3.4, gap: 0.16, auto: false,
    mag: 12, reserve: 36, reload: 1.3, spreadStill: 0.003, spreadMove: 0.024,
    recoil: 0.006, kick: 0.03, range: 60, tracer: 0.5,
  },
  smg: {
    name: 'Rattler-9 SMG', price: 1500, damage: 22, headMult: 3.2, gap: 0.075, auto: true,
    mag: 32, reserve: 96, reload: 1.7, spreadStill: 0.004, spreadMove: 0.03,
    recoil: 0.007, kick: 0.04, range: 55, tracer: 0.5,
  },
  rifle: {
    name: 'Kestrel AR', price: 2700, damage: 30, headMult: 3.6, gap: 0.096, auto: true,
    mag: 30, reserve: 90, reload: 1.9, spreadStill: 0.0022, spreadMove: 0.028,
    recoil: 0.009, kick: 0.055, range: 80, tracer: 0.6,
  },
  shotgun: {
    name: 'Scatter-12', price: 1900, damage: 13, headMult: 2.2, gap: 0.85, auto: false,
    mag: 7, reserve: 21, reload: 2.4, spreadStill: 0.02, spreadMove: 0.05,
    recoil: 0.03, kick: 0.12, range: 26, pellets: 8, tracer: 0.35,
  },
  dmr: {
    name: 'Longshot DMR', price: 4200, damage: 82, headMult: 3.8, gap: 1.1, auto: false,
    mag: 5, reserve: 15, reload: 2.6, spreadStill: 0.0004, spreadMove: 0.05,
    recoil: 0.035, kick: 0.14, range: 120, tracer: 1,
    zoom: 3.2, scopedSpreadStill: 0.0001, scopedSpreadMove: 0.012,
  },
};
export const GRENADE = { name: 'Spark Frag', price: 300, damage: 120, radius: 6, fuse: 1.6 };
export const ARMOR = { name: 'Plate Vest', price: 650 };
export const WEAPON_ORDER = ['sidearm', 'smg', 'rifle', 'shotgun', 'dmr'];

function buildModel(kind, camera) {
  const grip = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.hairline), roughness: 0.7, metalness: 0.2 });
  const body = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.ink), roughness: 0.5, metalness: 0.35 });
  const dark = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.surface), roughness: 0.6, metalness: 0.3 });
  const model = new THREE.Group();
  const add = (w, h, d, x, y, z, mat = body) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    mesh.position.set(x, y, z);
    model.add(mesh);
    return mesh;
  };
  if (kind === 'sidearm') {
    add(0.05, 0.09, 0.22, 0, 0, -0.1);
    add(0.045, 0.1, 0.06, 0, -0.08, 0.04, grip);
    add(0.02, 0.03, 0.06, 0, 0.055, -0.18, dark);
  } else if (kind === 'smg') {
    add(0.07, 0.09, 0.34, 0, 0, -0.08);
    add(0.04, 0.04, 0.2, 0, 0.02, -0.3, dark);
    add(0.05, 0.11, 0.05, 0, -0.09, 0.02, grip);
    add(0.06, 0.07, 0.16, 0, -0.02, 0.22, grip);
    add(0.03, 0.03, 0.08, 0, 0.06, -0.12, dark);
  } else if (kind === 'shotgun') {
    add(0.09, 0.1, 0.5, 0, 0, -0.12);
    add(0.06, 0.06, 0.46, 0, -0.02, -0.14, dark);
    add(0.075, 0.09, 0.24, 0, -0.02, 0.26, grip);
  } else if (kind === 'dmr') {
    add(0.08, 0.09, 0.62, 0, 0, -0.16);
    add(0.05, 0.05, 0.5, 0, 0.03, -0.2, grip);
    add(0.07, 0.06, 0.1, 0, 0.08, -0.05, dark);
    add(0.075, 0.08, 0.2, 0, -0.02, 0.3, grip);
    // Scope tube and its lens glint: the DMR is the scoped gun.
    add(0.05, 0.05, 0.22, 0, 0.1, -0.14, dark);
    add(0.045, 0.045, 0.02, 0, 0.1, -0.26, grip);
  } else {
    add(0.09, 0.1, 0.42, 0, 0, -0.1);
    add(0.045, 0.045, 0.4, 0, 0.025, -0.3, grip);
    add(0.075, 0.08, 0.22, 0, -0.02, 0.28, grip);
    add(0.05, 0.05, 0.12, 0, 0.06, -0.08, dark);
  }
  model.position.set(0.24, -0.2, -0.42);
  camera.add(model);
  const flash = new THREE.Mesh(
    new THREE.PlaneGeometry(0.24, 0.24),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.accent), transparent: true, opacity: 0.9, depthWrite: false, side: THREE.DoubleSide }),
  );
  flash.position.set(0.24, -0.18, -0.95);
  flash.visible = false;
  camera.add(flash);
  const flashLight = new THREE.PointLight(new THREE.Color(PALETTE.accent), 0, 5);
  flashLight.position.set(0.24, -0.16, -0.6);
  camera.add(flashLight);
  return { model, flash, flashLight };
}

export function createArsenal(camera) {
  const models = {};
  for (const kind of WEAPON_ORDER) {
    const built = buildModel(kind, camera);
    built.model.visible = false;
    models[kind] = built;
  }
  const state = {
    owned: { sidearm: { mag: 12, reserve: 36 } },
    current: 'sidearm',
    cooldown: 0,
    reloadLeft: 0,
    reloadKind: null,
    flash: 0,
    kick: 0,
    grenades: 0,
    scoped: false,
  };

  function showCurrent() {
    for (const [kind, built] of Object.entries(models)) {
      built.model.visible = kind === state.current && !state.scoped;
    }
  }

  function def() {
    return WEAPONS[state.current];
  }

  function step(dt) {
    state.cooldown = Math.max(0, state.cooldown - dt);
    state.flash = Math.max(0, state.flash - dt);
    state.kick += (0 - state.kick) * Math.min(1, dt * 14);
    const built = models[state.current];
    built.model.position.z = -0.42 + state.kick;
    built.model.rotation.x = state.kick * 2.2;
    built.flash.visible = state.flash > 0;
    built.flash.rotation.z = state.flash * 30;
    built.flashLight.intensity = state.flash > 0 ? 18 : 0;
    if (state.reloadLeft > 0) {
      state.reloadLeft = Math.max(0, state.reloadLeft - dt);
      built.model.rotation.x = -0.55 * Math.min(1, (def().reload - state.reloadLeft) * 2);
      if (state.reloadLeft === 0 && state.reloadKind) {
        const slot = state.owned[state.reloadKind];
        const need = WEAPONS[state.reloadKind].mag - slot.mag;
        const take = Math.min(need, slot.reserve);
        slot.mag += take;
        slot.reserve -= take;
        state.reloadKind = null;
      }
    }
  }

  return {
    state,
    def,
    step,
    ready() {
      const slot = state.owned[state.current];
      return slot && slot.mag > 0 && state.cooldown === 0 && state.reloadLeft === 0;
    },
    pullTrigger() {
      state.cooldown = def().gap;
      state.flash = 0.06;
      state.kick = def().kick;
    },
    takeRound() {
      const slot = state.owned[state.current];
      if (!slot || slot.mag <= 0) return false;
      slot.mag -= 1;
      return true;
    },
    reload() {
      const slot = state.owned[state.current];
      if (state.reloadLeft > 0 || !slot || slot.mag === def().mag || slot.reserve === 0) return;
      state.reloadLeft = def().reload;
      state.reloadKind = state.current;
    },
    // Spread: a scoped DMR is nearly exact even on the move; anything else
    // follows the weapon's own still/move spread.
    spread(speed) {
      const d = def();
      if (state.scoped && d.zoom) {
        return d.scopedSpreadStill + Math.min(1, speed / 5.2) * d.scopedSpreadMove;
      }
      return d.spreadStill + Math.min(1, speed / 5.2) * d.spreadMove;
    },
    // Scope: only the DMR zooms, only while it is the current gun and not
    // reloading. Scoping hides the view model so the sight picture is clean.
    setScoped(on) {
      const want = Boolean(on && def().zoom && state.reloadLeft === 0);
      if (want === state.scoped) return false;
      state.scoped = want;
      showCurrent();
      return true;
    },
    isScoped() {
      return state.scoped;
    },
    zoom() {
      return state.scoped && def().zoom ? def().zoom : 1;
    },
    switchTo(kind) {
      if (!state.owned[kind] || kind === state.current) return false;
      state.current = kind;
      state.reloadLeft = 0;
      state.reloadKind = null;
      state.scoped = false;
      showCurrent();
      return true;
    },
    buy(kind) {
      if (state.owned[kind]) return false;
      state.owned[kind] = { mag: WEAPONS[kind].mag, reserve: WEAPONS[kind].reserve };
      return true;
    },
    ammo() {
      const slot = state.owned[state.current];
      return slot ? { mag: slot.mag, reserve: slot.reserve } : { mag: 0, reserve: 0 };
    },
    refillAll() {
      for (const kind of Object.keys(state.owned)) {
        state.owned[kind] = { mag: WEAPONS[kind].mag, reserve: WEAPONS[kind].reserve };
      }
      state.cooldown = 0;
      state.reloadLeft = 0;
      state.reloadKind = null;
      state.flash = 0;
      state.kick = 0;
      state.scoped = false;
      showCurrent();
    },
    reset() {
      state.owned = { sidearm: { mag: 12, reserve: 36 } };
      state.current = 'sidearm';
      state.grenades = 0;
      state.cooldown = 0;
      state.reloadLeft = 0;
      state.reloadKind = null;
      state.flash = 0;
      state.kick = 0;
      state.scoped = false;
      showCurrent();
    },
  };
}
