// Boot and the one loop: a fixed 60 Hz simulation feeding a render at the display's
// rate. SALTLINE: a 5v5 round-based tactical FPS on Kestrel Yard — plant the charge
// at A or B, or wipe the Sentinels. ?shot=start|buy|play|plant|end with &seed=N
// sets up a deterministic frame for a capture, renders it twice, then freezes it
// and sets window.__shotReady.
import * as THREE from 'three';
import { PALETTE } from './palette.js';
import { createWorld, SITES, SPAWNS } from './world.js';
import { createInput } from './input.js';
import { createPlayer } from './player.js';
import { createArsenal, WEAPONS, GRENADE } from './weapons.js';
import { createBots } from './bots.js';
import { createMatch, PLANT_SECONDS, DEFUSE_SECONDS, DETONATE_SECONDS } from './rounds.js';
import { SHOP } from './economy.js';
import { createEffects } from './effects.js';
import { createAudio } from './audio.js';
import { createHud } from './hud.js';
import { createSpectate } from './spectate.js';

const FIXED_STEP = 1 / 60;
const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seed = Number.parseInt(params.get('seed') ?? '1', 10) || 1;

function mulberry32(initial) {
  let a = initial;
  return function random() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const random = mulberry32(seed);

const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.getElementById('game').appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(PALETTE.canvas);
scene.fog = new THREE.Fog(new THREE.Color(PALETTE.canvas), 26, 70);
const camera = new THREE.PerspectiveCamera(74, window.innerWidth / window.innerHeight, 0.05, 160);
scene.add(camera);

const audio = createAudio();
const world = createWorld(scene);
const effects = createEffects(scene);
const match = createMatch();
const player = createPlayer(world.colliders, { x: 0, z: 15, yaw: Math.PI });
const arsenal = createArsenal(camera);
const input = createInput(renderer.domElement, onLockChange);
const raycaster = new THREE.Raycaster();
const direction = new THREE.Vector3();
const muzzle = new THREE.Vector3();
const hitPoint = new THREE.Vector3();

// The player's hitbox: an invisible box bots raycast against. It follows the body.
const playerHit = new THREE.Mesh(
  new THREE.BoxGeometry(0.68, 1.72, 0.68),
  new THREE.MeshBasicMaterial({ visible: false }),
);
playerHit.userData.part = 'torso';
scene.add(playerHit);

// The planted charge: a small box with a blinking light, visible once planted.
const charge = new THREE.Group();
const chargeBody = new THREE.Mesh(
  new THREE.BoxGeometry(0.5, 0.28, 0.34),
  new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.danger), roughness: 0.5, emissive: new THREE.Color(PALETTE.danger), emissiveIntensity: 0.4 }),
);
const chargeLight = new THREE.Mesh(
  new THREE.SphereGeometry(0.06, 8, 6),
  new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.accent) }),
);
chargeLight.position.set(0.18, 0.18, 0);
charge.add(chargeBody, chargeLight);
charge.visible = false;
scene.add(charge);

const hud = createHud({ onBuy: buyItem });
const spectate = createSpectate(camera);
const bots = createBots(scene, world, {
  now: () => elapsed,
  botShot: onBotShot,
  plantProgress: onBotPlant,
  defuseProgress: onBotDefuse,
});
const grenades = [];
const grenadeMesh = new THREE.Mesh(
  new THREE.SphereGeometry(0.09, 10, 8),
  new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.surface), roughness: 0.4, metalness: 0.5 }),
);
grenadeMesh.visible = false;
scene.add(grenadeMesh);

const body = player.state;
// The player as a bot target: one stable object. bots.scan() compares targets
// by reference to spot a new acquisition, so a fresh wrapper literal every
// step would reset the bot's reaction timer forever and no enemy would ever
// fire at the player. pos stays a live reference to the player's position.
const playerTarget = {
  pos: body.position,
  isPlayer: true,
  get alive() { return body.alive; },
};
const m = match.state;
let elapsed = 0;
let frozen = false;
let started = false;
let accumulator = 0;
let lastTime = performance.now();
let lastPhase = m.phase;
let kills = 0;
let plantHold = 0;
let beepAt = 0;

// Scoreboard rows: the player first, then every bot, most kills first.
function scoreboardRows() {
  const rows = [{
    name: 'You', team: 'vanguard',
    kills: m.kills.You || 0, deaths: m.deaths.You || 0, alive: body.alive,
  }];
  for (const bot of bots.bots) {
    rows.push({
      name: bot.name, team: bot.team,
      kills: m.kills[bot.name] || 0, deaths: m.deaths[bot.name] || 0, alive: bot.alive,
    });
  }
  rows.sort((a, b) => b.kills - a.kills || a.deaths - b.deaths);
  return rows;
}

// Death-cam: ride with a living ally, or stop spectating when the round does.
function startSpectating() {
  const allies = bots.bots.filter((b) => b.team === 'vanguard');
  const target = spectate.start(allies);
  hud.setSpectating(target ? target.name : null);
}
function stopSpectating() {
  spectate.stop();
  hud.setSpectating(null);
  if (Math.abs(camera.fov - 74) > 0.1) {
    camera.fov = 74;
    camera.updateProjectionMatrix();
  }
  arsenal.setScoped(false);
  hud.setScoped(false);
}

hud.setHealth(body.health, body.armor);
hud.setAmmo(arsenal.ammo().mag, arsenal.ammo().reserve, arsenal.def().name);
hud.setMoney(m.money);
hud.setScore(0, 0, 1, 5, 5);
hud.setObjective('Buy phase — press B to open the buy menu');
hud.onPlay(() => {
  if (shot) return;
  audio.unlock();
  if (m.over) { restartMatch(); return; }
  if (!body.alive) { hud.hideOverlay(); return; }
  input.requestLock();
});

function restartMatch() {
  match.reset();
  arsenal.reset();
  stopSpectating();
  hud.hideScoreboard();
  resetRound();
  hud.hideOverlay();
  hud.hideBanner();
  hud.feed('Match restarted — first to 7 rounds', true);
}

function resetRound() {
  const spawn = SPAWNS.vanguard[Math.floor(random() * SPAWNS.vanguard.length)];
  player.reset({ x: spawn[0], z: spawn[1], yaw: Math.PI });
  bots.reset(m.round);
  stopSpectating();
  charge.visible = false;
  plantHold = 0;
  grenades.length = 0;
  grenadeMesh.visible = false;
  hud.setHealth(body.health, body.armor);
  hud.setAmmo(arsenal.ammo().mag, arsenal.ammo().reserve, arsenal.def().name);
  hud.setMoney(m.money);
  hud.setObjective('Buy phase — press B to open the buy menu');
  hud.setRoundHistory(m.history);
  hud.hideScoreboard();
  hud.hideProgress();
  syncCamera();
}

function onLockChange(locked) {
  if (shot) return;
  audio.unlock();
  if (locked) {
    started = true;
    hud.hideOverlay();
    hud.showBuy(false);
  } else if (!m.over && body.alive && !hud.isBuyOpen()) {
    // The buy menu is the pause UI while it is open: showing the paused
    // overlay on top of it would cover the buy buttons (same stacking level,
    // overlay later in the DOM) and swallow the click to resume.
    hud.showOverlay(started ? 'paused' : 'start');
  }
}

function syncCamera() {
  if (spectate.active) {
    spectate.update();
    return;
  }
  camera.position.set(body.position.x, body.position.y + body.eye, body.position.z);
  camera.rotation.set(body.pitch, body.yaw, 0, 'YXZ');
  playerHit.position.set(body.position.x, body.position.y + 0.86, body.position.z);
}

function aimAt(point) {
  const dx = point.x - body.position.x;
  const dy = point.y - (body.position.y + body.eye);
  const dz = point.z - body.position.z;
  const length = Math.hypot(dx, dy, dz) || 1;
  body.yaw = Math.atan2(-dx, -dz);
  body.pitch = Math.asin(Math.max(-1, Math.min(1, dy / length)));
  syncCamera();
}

function muzzleWorld() {
  camera.getWorldDirection(direction);
  muzzle.copy(camera.position).addScaledVector(direction, 0.6);
  muzzle.x += Math.cos(body.yaw) * 0.2;
  muzzle.z -= Math.sin(body.yaw) * 0.2;
  muzzle.y -= 0.14;
  return muzzle;
}

function shoot(spread) {
  const def = arsenal.def();
  if (!arsenal.takeRound()) { audio.dry(); return false; }
  camera.getWorldDirection(direction);
  const pellets = def.pellets ?? 1;
  let hitAny = false;
  for (let p = 0; p < pellets; p += 1) {
    const dx = direction.x + (random() * 2 - 1) * spread;
    const dy = direction.y + (random() * 2 - 1) * spread;
    const dz = direction.z + (random() * 2 - 1) * spread;
    const dir = new THREE.Vector3(dx, dy, dz).normalize();
    raycaster.set(camera.position, dir);
    raycaster.far = def.range;
    const targets = [...bots.hitMeshes, ...world.shootables];
    const hit = raycaster.intersectObjects(targets, false)[0];
    const end = hit ? hit.point : camera.position.clone().addScaledVector(dir, def.range);
    effects.tracer(muzzleWorld(), end, false);
    if (!hit) continue;
    if (hit.object.userData.bot) {
      const bot = hit.object.userData.bot;
      const part = hit.object.userData.part;
      const amount = def.damage * (part === 'head' ? def.headMult : 1);
      const killed = bots.damage(bot, amount, part);
      hud.hitMarker(killed, shot ? 4000 : 90);
      hud.damageNumber(amount, killed);
      audio.hit();
      effects.sparksAt(hit.point, random);
      if (killed) {
        kills += 1;
        m.money += 300;
        match.recordKill('You', 'vanguard');
        match.recordDeath(bot.name);
        audio.kill();
        hud.feed(`You eliminated ${bot.name} (+$300)`, true);
        hud.setMoney(m.money);
      }
      hitAny = true;
    } else {
      effects.sparksAt(hit.point, random);
    }
  }
  arsenal.pullTrigger();
  audio.shot(arsenal.state.current);
  player.recoil(def.recoil + random() * 0.004, (random() * 2 - 1) * 0.004);
  bots.hearNoise(body.position.x, body.position.z);
  hud.setAmmo(arsenal.ammo().mag, arsenal.ammo().reserve, def.name);
  return hitAny;
}

function onBotShot(bot, dir, def) {
  const from = new THREE.Vector3(bot.pos.x, bot.pos.y + 1.45, bot.pos.z);
  raycaster.set(from, dir);
  raycaster.far = def.range;
  const targets = [playerHit, ...bots.hitMeshes.filter((mesh) => mesh.userData.bot !== bot), ...world.shootables];
  const hit = raycaster.intersectObjects(targets, false)[0];
  const end = hit ? hit.point : from.clone().addScaledVector(dir, def.range);
  effects.tracer(from, end, true);
  audio.enemyShot(Math.hypot(from.x - body.position.x, from.z - body.position.z));
  if (!hit) return;
  if (hit.object === playerHit && body.alive) {
    const amount = def.damage;
    player.damage(amount);
    audio.hurt();
    hud.damage();
    hud.setHealth(body.health, body.armor);
    if (!body.alive) {
      match.recordDeath('You');
      hud.showOverlay('dead');
      hud.feed(`${bot.name} eliminated you`, false);
      if (document.pointerLockElement) document.exitPointerLock();
      startSpectating();
    }
  } else if (hit.object.userData.bot) {
    const victim = hit.object.userData.bot;
    const amount = def.damage * (hit.object.userData.part === 'head' ? def.headMult : 1);
    if (bots.damage(victim, amount, hit.object.userData.part)) {
      match.recordKill(bot.name, bot.team);
      match.recordDeath(victim.name);
      hud.feed(`${bot.name} eliminated ${victim.name}`, victim.team === 'sentinel');
    }
  }
}

function onBotPlant(bot, site, progress) {
  if (m.bomb.state !== 'carried' || m.phase !== 'live') return;
  if (progress >= PLANT_SECONDS) {
    plantBomb(site, bot.name);
  }
}

function onBotDefuse(bot, progress) {
  if (m.bomb.state !== 'planted') return;
  if (progress >= DEFUSE_SECONDS) {
    m.bomb.state = 'defused';
    m.money += 300;
    hud.setMoney(m.money);
    hud.feed(`${bot.name} defused the charge`, false);
    match.endRound('sentinel', 'defuse');
  }
}

function plantBomb(site, planter) {
  const zone = SITES[site];
  m.bomb = { state: 'planted', site, progress: 1, detonateLeft: DETONATE_SECONDS, planter };
  charge.position.set(zone.x, 0.16, zone.z);
  charge.visible = true;
  if (planter === 'You') {
    m.money += 300;
    hud.setMoney(m.money);
    hud.feed(`You planted the charge at ${site} (+$300)`, true);
  } else {
    hud.feed(`${planter} planted the charge at ${site}`, false);
  }
  audio.plantBeep(true);
  hud.showBanner('Charge planted', `Detonation in ${DETONATE_SECONDS}s — Sentinels must defuse`, planter === 'You');
  hud.setObjective(`Charge planted at ${site} — defend it`);
  beepAt = 0;
}

function throwGrenade() {
  if (arsenal.state.grenades <= 0 || m.phase === 'buy') return;
  arsenal.state.grenades -= 1;
  camera.getWorldDirection(direction);
  grenades.push({
    pos: camera.position.clone().addScaledVector(direction, 0.8),
    vel: direction.clone().multiplyScalar(16).add(new THREE.Vector3(0, 4.5, 0)),
    fuse: GRENADE.fuse,
  });
  // Bots near the predicted landing scatter before the blast arrives.
  const land = camera.position.clone().addScaledVector(direction, 18);
  bots.fleeFrom(land.x, land.z);
  hud.setAmmo(arsenal.ammo().mag, arsenal.ammo().reserve, arsenal.def().name);
}

function explodeGrenade(g) {
  effects.explosion(g.pos);
  audio.explosion();
  const dPlayer = Math.hypot(g.pos.x - body.position.x, g.pos.y - (body.position.y + 1), g.pos.z - body.position.z);
  if (dPlayer < GRENADE.radius && body.alive) {
    player.damage(GRENADE.damage * (1 - dPlayer / GRENADE.radius) * 0.6);
    audio.hurt();
    hud.damage();
    hud.setHealth(body.health, body.armor);
    if (!body.alive) {
      match.recordDeath('You');
      hud.showOverlay('dead');
      if (document.pointerLockElement) document.exitPointerLock();
      startSpectating();
    }
  }
  for (const bot of bots.bots) {
    if (!bot.alive) continue;
    const d = Math.hypot(g.pos.x - bot.pos.x, g.pos.y - 1, g.pos.z - bot.pos.z);
    if (d < GRENADE.radius) {
      const killed = bots.damage(bot, GRENADE.damage * (1 - d / GRENADE.radius), 'torso');
      if (killed && bot.team === 'sentinel') {
        kills += 1;
        m.money += 300;
        match.recordKill('You', 'vanguard');
        match.recordDeath(bot.name);
        hud.setMoney(m.money);
        hud.feed(`Your frag eliminated ${bot.name} (+$300)`, true);
      } else if (killed) {
        match.recordDeath(bot.name);
      }
    }
  }
  bots.hearNoise(g.pos.x, g.pos.z);
}

function buyItem(id) {
  if (m.phase !== 'buy') return;
  const item = SHOP.find((entry) => entry.id === id);
  if (!item || m.money < item.price) return;
  if (id === 'grenade') {
    if (arsenal.state.grenades >= 2) return;
    arsenal.state.grenades += 1;
  } else if (id === 'armor') {
    if (body.armor >= 50) return;
    body.armor = 50;
  } else {
    if (arsenal.state.owned[id]) return;
    arsenal.buy(id);
  }
  m.money -= item.price;
  audio.buy();
  hud.setMoney(m.money);
  hud.setHealth(body.health, body.armor);
  hud.feed(`Bought ${item.name} (-$${item.price})`, true);
}

function step(dt) {
  elapsed += dt;
  const phase = m.phase;
  const alive = { vanguard: (body.alive ? 1 : 0) + bots.aliveCount('vanguard'), sentinel: bots.aliveCount('sentinel') };
  match.step(dt, alive);

  if (m.phase !== lastPhase) {
    if (m.phase === 'buy' && lastPhase === 'over') resetRound();
    if (m.phase === 'over') {
      const result = m.lastResult;
      const won = result.winner === 'vanguard';
      bots.moneyRound(result.winner);
      audio.round(won);
      hud.setRoundHistory(m.history);
      hud.showBanner(
        won ? 'Round won' : 'Round lost',
        result.reason === 'detonation' ? 'The charge detonated.' : result.reason === 'defuse' ? 'The charge was defused.' : result.reason === 'time' ? 'Time expired — Sentinels hold.' : 'Enemy team eliminated.',
        won,
      );
      hud.feed(`Round ${result.round}: ${won ? 'Vanguard' : 'Sentinel'} wins (${result.reason})`, won);
      if (m.overtime && !m.over) hud.feed('Overtime — first to 2 rounds takes the yard', true);
      if (m.over) {
        setTimeout(() => {
          hud.showScoreboard(scoreboardRows(), match.mvp());
          hud.showOverlay('match', { won: m.wins.vanguard >= 7 || (m.overtime && m.otWins.vanguard >= 2) });
        }, 1200);
      }
    }
    if (m.phase === 'live') hud.setObjective('Plant the charge at A or B — or eliminate the Sentinels');
    lastPhase = m.phase;
  }

  if (body.alive) player.step(dt, input.state.keys);
  arsenal.step(dt);
  effects.step(dt);
  if (m.phase === 'live' || m.phase === 'planted') {
    bots.step(dt, elapsed, {
      bomb: m.bomb,
      enemies: (bot) => (bot.team === 'vanguard'
        ? [...bots.bots.filter((b) => b.team === 'sentinel' && b.alive)]
        : [...bots.bots.filter((b) => b.team === 'vanguard' && b.alive), ...(body.alive ? [playerTarget] : [])]),
    });
  }
  // Grenades fly on their own clock.
  for (let i = grenades.length - 1; i >= 0; i -= 1) {
    const g = grenades[i];
    g.fuse -= dt;
    g.vel.y -= 20 * dt;
    const nx = g.pos.x + g.vel.x * dt;
    const nz = g.pos.z + g.vel.z * dt;
    const ny = g.pos.y + g.vel.y * dt;
    let blocked = false;
    for (const box of world.colliders) {
      if (nx > box.min.x && nx < box.max.x && g.pos.y > box.min.y && g.pos.y < box.max.y && nz > box.min.z && nz < box.max.z) { blocked = true; break; }
    }
    if (blocked) { g.vel.x *= -0.4; g.vel.z *= -0.4; }
    else { g.pos.x = nx; g.pos.z = nz; }
    if (ny < 0.09) { g.pos.y = 0.09; g.vel.y *= -0.4; g.vel.x *= 0.7; g.vel.z *= 0.7; }
    else g.pos.y = ny;
    if (g.fuse <= 0) {
      explodeGrenade(g);
      grenades.splice(i, 1);
    }
  }
  grenadeMesh.visible = grenades.length > 0;
  if (grenades.length) grenadeMesh.position.copy(grenades[grenades.length - 1].pos);

  // Plant / defuse channels: hold E, stay in the zone, progress fills.
  const keys = input.state.keys;
  const inA = match.inSite(body.position.x, body.position.z, 'A');
  const inB = match.inSite(body.position.x, body.position.z, 'B');
  const site = inA ? 'A' : inB ? 'B' : null;
  if (body.alive && m.phase === 'live' && m.bomb.state === 'carried' && site && keys.has('KeyE')) {
    plantHold += dt;
    hud.showProgress(`Planting charge at ${site}`, plantHold / PLANT_SECONDS);
    if (plantHold >= PLANT_SECONDS) {
      plantBomb(site, 'You');
      plantHold = 0;
      hud.hideProgress();
    }
  } else {
    plantHold = Math.max(0, plantHold - dt * 2);
    if (plantHold <= 0) hud.hideProgress();
  }

  // Plant beeps speed up as the timer runs down.
  if (m.bomb.state === 'planted') {
    chargeLight.material.color.setHex(Math.floor(elapsed * 2) % 2 ? 0xf0a830 : 0xd84a35);
    beepAt -= dt;
    if (beepAt <= 0) {
      beepAt = Math.max(0.35, m.bomb.detonateLeft / 35);
      audio.plantBeep(false);
    }
  }
}

function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min((now - lastTime) / 1000, 0.25);
  lastTime = now;
  if (!frozen) {
    const look = input.takeLook();
    if (body.alive && input.state.locked) player.look(look.x, look.y);
    const pressed = input.takePressed();
    // Scope: right mouse on the DMR narrows the field of view and steadies
    // the shot; anything else, or releasing, clears it.
    if (body.alive && input.state.locked) {
      if (arsenal.setScoped(input.state.scoping)) {
        audio.scope();
        hud.setScoped(arsenal.isScoped());
      }
      const wantFov = 74 / arsenal.zoom();
      if (Math.abs(camera.fov - wantFov) > 0.1) {
        camera.fov += (wantFov - camera.fov) * Math.min(1, dt * 14);
        camera.updateProjectionMatrix();
      }
    }
    // Tab toggles the scoreboard; E cycles the death-cam while spectating.
    if (pressed.has('Tab')) {
      if (hud.isScoreboardOpen()) hud.hideScoreboard();
      else hud.showScoreboard(scoreboardRows(), match.mvp());
    }
    if (pressed.has('KeyE') && spectate.active) {
      const target = spectate.cycle();
      hud.setSpectating(target ? target.name : null);
    }
    if (pressed.has('KeyB') && m.phase === 'buy' && body.alive) {
      hud.showBuy(!hud.isBuyOpen());
      // Closing the menu leaves the pointer unlocked (the menu exits the lock
      // so its buttons can be clicked): offer the resume overlay, otherwise
      // the player has no way back to the lock.
      if (!hud.isBuyOpen() && !document.pointerLockElement && !m.over) hud.showOverlay('paused');
    }
    if (pressed.has('KeyG')) throwGrenade();
    if (pressed.has('Digit1')) arsenal.switchTo('sidearm');
    if (pressed.has('Digit2')) arsenal.switchTo('smg');
    if (pressed.has('Digit3')) arsenal.switchTo('rifle');
    if (pressed.has('Digit4')) arsenal.switchTo('shotgun');
    if (pressed.has('Digit5')) arsenal.switchTo('dmr');
    if (pressed.has('KeyR')) { arsenal.reload(); audio.reload(); }
    const def = arsenal.def();
    // takeTrigger() is only reached on a frame where the weapon is ready, so a
    // click made during the cooldown still fires instead of being eaten.
    if (input.state.firing && arsenal.ready() && !hud.isBuyOpen() && (def.auto || input.takeTrigger())) shoot(shot ? 0 : arsenal.spread(player.groundSpeed()));
    accumulator += dt;
    // Slow machines: run up to 15 fixed steps so sim time keeps up with real
    // time instead of falling behind; the accumulator clamp bounds the catch-up.
    let steps = 0;
    while (accumulator >= FIXED_STEP && steps < 15) {
      step(FIXED_STEP);
      accumulator -= FIXED_STEP;
      steps += 1;
    }
    if (accumulator > 0.25) accumulator = 0.25;
    syncCamera();
    // HUD, every frame, from the one state. While spectating, the death-cam
    // owns the camera and the HUD shows the squad, not the fallen player.
    if (spectate.active) spectate.refresh(bots.bots.filter((b) => b.team === 'vanguard'));
    hud.setHealth(body.health, body.armor);
    const ammo = arsenal.ammo();
    hud.setAmmo(ammo.mag, ammo.reserve, arsenal.def().name);
    hud.setMoney(m.money);
    hud.setTimer(m.phase === 'planted' ? m.bomb.detonateLeft : m.phaseLeft, m.phase === 'planted');
    hud.setScore(m.wins.vanguard, m.wins.sentinel, m.round, (body.alive ? 1 : 0) + bots.aliveCount('vanguard'), bots.aliveCount('sentinel'));
    hud.setCrosshair(arsenal.spread(player.groundSpeed()));
    if (m.phase === 'buy') hud.setHint('B — buy menu  •  round starts soon');
    else if (m.bomb.state === 'planted') hud.setHint('Charge planted — defend it or defuse it');
    else if (body.alive && (match.inSite(body.position.x, body.position.z, 'A') || match.inSite(body.position.x, body.position.z, 'B'))) hud.setHint('Hold E — plant the charge');
    else hud.setHint('');
  }
  renderer.render(scene, camera);
}

function settle(steps) {
  for (let index = 0; index < steps; index += 1) step(FIXED_STEP);
}

function runShot(name) {
  hud.hideOverlay();
  hud.showBuy(false);
  body.pitch = 0;
  body.yaw = Math.PI;
  if (name === 'start') {
    body.position.set(0, 0, 15);
    settle(20);
    aimAt(new THREE.Vector3(0, 1.5, -12));
    hud.showOverlay('start');
  } else if (name === 'buy') {
    body.position.set(0, 0, 15);
    settle(20);
    aimAt(new THREE.Vector3(-6, 1.5, -6));
    m.money = 5400;
    hud.setMoney(m.money);
    hud.showBuy(true);
  } else if (name === 'play') {
    m.phase = 'live';
    m.phaseLeft = 82;
    body.position.set(0, 0, 4);
    settle(20);
    const enemy = bots.bots.find((b) => b.team === 'sentinel');
    for (let round = 0; round < 4; round += 1) {
      enemy.pos.set(2.5, 0, -6);
      enemy.body.group.position.copy(enemy.pos);
      aimAt(new THREE.Vector3(2.5, 1.4, -6));
      shoot(0);
      if (round < 3) settle(8);
    }
    settle(10);
  } else if (name === 'plant') {
    m.phase = 'live';
    m.phaseLeft = 64;
    // Stand south-west of the site with a clear lane to the plate: the old
    // framing put the camera flush against the A-long container.
    body.position.set(-20, 0, -7);
    settle(20);
    plantBomb('A', 'You');
    aimAt(new THREE.Vector3(-17, 0.5, -12));
    settle(6);
  } else {
    m.phase = 'over';
    m.phaseLeft = 3;
    m.wins.vanguard = 4;
    m.wins.sentinel = 2;
    m.round = 7;
    m.lastResult = { winner: 'vanguard', reason: 'detonation', round: 7 };
    body.position.set(-10, 0, -8);
    settle(20);
    aimAt(new THREE.Vector3(-17, 1.2, -12));
    hud.showBanner('Round won', 'The charge detonated.', true);
  }
  hud.setScore(m.wins.vanguard, m.wins.sentinel, m.round, (body.alive ? 1 : 0) + bots.aliveCount('vanguard'), bots.aliveCount('sentinel'));
  hud.setHealth(body.health, body.armor);
  hud.setMoney(m.money);
  // Frozen frames never run the HUD updater, so the timer would sit on its
  // initial 1:40 in every shot without this.
  hud.setTimer(m.phase === 'planted' ? m.bomb.detonateLeft : m.phaseLeft, m.phase === 'planted');
  paintTwiceThenReady();
}

function paintTwiceThenReady() {
  let painted = 0;
  function paint() {
    requestAnimationFrame(paint);
    syncCamera();
    renderer.render(scene, camera);
    painted += 1;
    if (painted === 2) {
      window.__shotReady = true;
      frozen = true;
    }
  }
  requestAnimationFrame(paint);
}

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});
// Tab is the scoreboard, not focus navigation, while the game runs.
window.addEventListener('keydown', (event) => {
  if (event.code === 'Tab') event.preventDefault();
});

// Debug handle for automated playtests: state, and a few verbs the tests drive.
// It is a handful of lines and ships in the game; it changes nothing in play.
window.__fps = {
  state: { player: body, bots: bots.bots, match: m, arsenal: arsenal.state },
  version: 'saltline-2',
  teleport(x, z, yaw) {
    body.position.set(x, 0, z);
    if (yaw !== undefined) body.yaw = yaw;
    syncCamera();
  },
  giveMoney(amount) {
    m.money += amount;
    hud.setMoney(m.money);
  },
  skipBuy() {
    m.phase = 'live';
    m.phaseLeft = 100;
  },
  hurtBot(index, amount) {
    const bot = bots.bots[index];
    if (bot) bots.damage(bot, amount, 'torso');
  },
  endRoundNow(winner, reason) {
    match.endRound(winner, reason);
  },
};

resetRound();
syncCamera();
if (shot) runShot(shot);
else requestAnimationFrame(frame);
