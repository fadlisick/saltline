// The bots: 4 allies and 5 enemies, one 5v5. Each bot takes a role every round —
// entry, support, lurker, anchor, awper, roamer — and the role picks its route,
// its buy and how it fights, so a round reads like a team with a plan instead
// of nine strangers. Each bot runs a small state machine — route, hold, engage,
// plant, defuse, investigate, flee — over the waypoint graph, with line-of-sight
// checks, a reaction time, burst fire and aim error, and ears: a loud gunshot
// pulls nearby bots toward the noise, and a grenade blast pushes them away.
// Bots buy with the same economy as the player, so a bot that keeps dying stays
// on a pistol; a bot that banks rounds buys up.
import * as THREE from 'three';
import { PALETTE } from './palette.js';
import { WEAPONS } from './weapons.js';
import { ROUTES, HOLDS, SPAWNS, SITES, findRoute, nearestNode, nodePosition } from './world.js';

const RADIUS = 0.34;
const HEIGHT = 1.72;
const EYE = 1.55;
const ROUTE_SPEED = 4.6;
const FIGHT_SPEED = 3.1;
const FLEE_SPEED = 5.4;
const VISION_RANGE = 46;
const VISION_HALF_FOV = 1.05;
const LOS_EVERY = 0.15;
const FLEE_RADIUS = 8;

const ALLY_NAMES = ['Mara', 'Ivo', 'Sena', 'Tariq'];
const ENEMY_NAMES = ['Vex', 'Rook', 'Nyx', 'Hale', 'Odin'];
// One role per bot, in spawn order. Vanguard pushes a site as a pack with a
// lurker working mid; Sentinel anchors both sites, posts an awper on the long
// mid angle and keeps two roamers to rotate.
const ALLY_ROLES = ['entry', 'support', 'lurker', 'anchor'];
const ENEMY_ROLES = ['anchor', 'anchor', 'awper', 'roamer', 'roamer'];

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

function buildBody(team) {
  const group = new THREE.Group();
  const vest = new THREE.MeshStandardMaterial({ color: new THREE.Color(team === 'vanguard' ? PALETTE.vanguard : PALETTE.sentinel), roughness: 0.7 });
  const cloth = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.hairline), roughness: 0.9 });
  const skin = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.ink), roughness: 0.6 });
  const legL = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.75, 0.16), cloth);
  legL.position.set(-0.11, 0.375, 0);
  const legR = legL.clone();
  legR.position.x = 0.11;
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.72, 0.3), vest);
  torso.position.y = 1.11;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.155, 12, 10), skin);
  head.position.y = 1.62;
  const gun = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.09, 0.55), cloth);
  gun.position.set(0.2, 1.15, -0.3);
  group.add(legL, legR, torso, head, gun);
  group.traverse((mesh) => {
    if (mesh.isMesh) { mesh.castShadow = true; mesh.receiveShadow = true; }
  });
  return { group, torso, head };
}

export function createBots(scene, world, hooks) {
  const colliders = world.colliders;
  const shootables = world.shootables;
  const bots = [];
  const hitMeshes = [];
  const probe = new THREE.Box3();
  const eyeTmp = new THREE.Vector3();
  const dirTmp = new THREE.Vector3();

  function overlaps(x, y, z) {
    probe.min.set(x - RADIUS, y + 0.04, z - RADIUS);
    probe.max.set(x + RADIUS, y + HEIGHT - 0.04, z + RADIUS);
    for (const collider of colliders) if (probe.intersectsBox(collider)) return true;
    return false;
  }

  function makeBot(id, name, team, kind, seed) {
    const body = buildBody(team);
    scene.add(body.group);
    const role = kind === 'ally'
      ? ALLY_ROLES[bots.filter((b) => b.team === 'vanguard').length % ALLY_ROLES.length]
      : ENEMY_ROLES[bots.filter((b) => b.team === 'sentinel').length % ENEMY_ROLES.length];
    const bot = {
      id, name, team, kind, role,
      pos: new THREE.Vector3(),
      yaw: 0, pitch: 0,
      health: 100, armor: 0, alive: true,
      weapon: 'sidearm', money: 800,
      state: 'route', route: [], routeIndex: 0, holdNode: null, holdTime: 0,
      target: null, lastSeen: 0, reactAt: 0, burstLeft: 0, burstTimer: 0,
      trackTime: 0, strafeDir: 1, strafeTimer: 0, losTimer: Math.random() * LOS_EVERY,
      plantProgress: 0, defuseProgress: 0, fall: 0, deadAt: 0,
      fleeX: 0, fleeZ: 0, fleeTime: 0, retakeLane: null, pushSite: null,
      skill: 0.45 + mulberry32(seed)() * 0.35,
      random: mulberry32(seed * 7919 + 13),
      raycaster: new THREE.Raycaster(),
      body, hitMeshes: [body.torso, body.head],
    };
    // An awper lives on long angles: quicker eyes, steadier aim. A lurker
    // reads the map a little better than a straight-line rusher.
    if (role === 'awper') bot.skill = Math.min(0.92, bot.skill + 0.15);
    if (role === 'lurker') bot.skill = Math.min(0.9, bot.skill + 0.05);
    bot.raycaster.far = 90;
    body.torso.userData = { bot, part: 'torso' };
    body.head.userData = { bot, part: 'head' };
    hitMeshes.push(body.torso, body.head);
    bots.push(bot);
    return bot;
  }

  ALLY_NAMES.forEach((name, i) => makeBot(`ally-${i}`, name, 'vanguard', 'ally', 100 + i * 17));
  ENEMY_NAMES.forEach((name, i) => makeBot(`enemy-${i}`, name, 'sentinel', 'enemy', 500 + i * 23));

  // Buys follow the role: the awper saves for the DMR, the lurker likes the
  // cheap SMG for mid fights, the anchor likes the shotgun up close, and
  // everyone else defaults to the rifle. A bot that keeps dying stays poor.
  function buy(bot) {
    const m = bot.money;
    const afford = (weapon, armor) => {
      const cost = WEAPONS[weapon].price + (armor ? 650 : 0);
      if (m < cost) return false;
      bot.weapon = weapon;
      bot.armor = armor ? 50 : 0;
      bot.money -= cost;
      return true;
    };
    if (bot.role === 'awper') {
      if (afford('dmr', true)) return;
      if (afford('rifle', true)) return;
    } else if (bot.role === 'lurker') {
      if (afford('rifle', true)) return;
      if (afford('smg', true)) return;
    } else if (bot.role === 'anchor') {
      if (afford('rifle', true)) return;
      if (afford('shotgun', true)) return;
      if (afford('smg', false)) return;
    } else if (afford('rifle', true)) {
      return;
    } else if (afford('smg', false)) {
      return;
    } else if (afford('shotgun', false)) {
      return;
    }
    bot.weapon = 'sidearm';
    bot.armor = 0;
  }

  // Roles pick the round's plan. Vanguard pushes one site as a pack (entry and
  // support on the same lane), the lurker works mid or the connector, and the
  // anchor posts mid to cut rotations. Sentinel anchors a site each, posts the
  // awper on the long mid angle and leaves the roamers to rotate on noise.
  function assign(bot, round) {
    bot.retakeLane = null;
    if (bot.team === 'vanguard') {
      if (bot.role === 'lurker') {
        bot.pushSite = null;
        bot.route = [...ROUTES[bot.random() < 0.5 ? 'MID' : 'CONN']];
      } else if (bot.role === 'anchor') {
        bot.pushSite = null;
        bot.route = ['AS', 'MID1', 'MID2', 'MID3', 'MID4'];
      } else {
        bot.pushSite = bot.random() < 0.5 ? 'A' : 'B';
        bot.route = [...ROUTES[bot.pushSite]];
      }
      bot.state = 'route';
    } else if (bot.role === 'awper') {
      bot.route = [nearestNode(bot.pos.x, bot.pos.z), 'DM'];
      bot.holdNode = 'DM';
      bot.state = 'route';
    } else if (bot.role === 'anchor') {
      const site = bot.id === 'enemy-0' ? 'A' : 'B';
      const hold = HOLDS[site][Math.floor(bot.random() * 3)];
      bot.holdNode = hold;
      bot.route = [nearestNode(bot.pos.x, bot.pos.z), hold];
      bot.state = 'route';
    } else {
      const site = bot.random() < 0.5 ? 'A' : 'B';
      const hold = HOLDS[site][Math.floor(bot.random() * 3)];
      bot.holdNode = hold;
      bot.route = [nearestNode(bot.pos.x, bot.pos.z), hold];
      bot.state = 'route';
    }
    bot.routeIndex = 0;
    bot.target = null;
    bot.plantProgress = 0;
    bot.defuseProgress = 0;
  }

  function reset(round) {
    for (const bot of bots) {
      const spawn = SPAWNS[bot.team][bots.filter((b) => b.team === bot.team).indexOf(bot) % 5];
      bot.pos.set(spawn[0], 0, spawn[1]);
      bot.yaw = bot.team === 'vanguard' ? Math.PI : 0;
      bot.health = 100;
      bot.alive = true;
      bot.fall = 0;
      bot.body.group.visible = true;
      bot.body.group.rotation.set(0, bot.yaw, 0);
      bot.body.group.position.copy(bot.pos);
      buy(bot);
      assign(bot, round);
    }
  }

  function eyePos(bot, out) {
    return out.set(bot.pos.x, bot.pos.y + EYE, bot.pos.z);
  }

  function canSee(bot, enemyPos, enemyEyeY) {
    const dx = enemyPos.x - bot.pos.x;
    const dy = enemyEyeY - (bot.pos.y + EYE);
    const dz = enemyPos.z - bot.pos.z;
    const dist = Math.hypot(dx, dy, dz);
    if (dist > VISION_RANGE) return null;
    const yawTo = Math.atan2(-dx, -dz);
    let diff = yawTo - bot.yaw;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    if (Math.abs(diff) > VISION_HALF_FOV) return null;
    bot.raycaster.set(eyePos(bot, eyeTmp), dirTmp.set(dx / dist, dy / dist, dz / dist));
    const hit = bot.raycaster.intersectObjects(shootables, false)[0];
    if (hit && hit.distance < dist - 0.6) return null;
    return { dist, yawTo, pitchTo: Math.asin(Math.max(-1, Math.min(1, dy / dist))) };
  }

  function scan(bot, enemies, time) {
    let best = null;
    let bestD = Infinity;
    for (const enemy of enemies) {
      if (!enemy.alive) continue;
      const seen = canSee(bot, enemy.pos, enemy.pos.y + EYE);
      if (seen && seen.dist < bestD) { bestD = seen.dist; best = { enemy, ...seen }; }
    }
    if (best) {
      if (bot.target !== best.enemy) {
        bot.target = best.enemy;
        bot.reactAt = time + 0.35 + (1 - bot.skill) * 0.45 + bot.random() * 0.2;
        bot.trackTime = 0;
        bot.burstLeft = 0;
      }
      bot.lastSeen = time;
      return best;
    }
    if (bot.target && time - bot.lastSeen > 1.2) bot.target = null;
    return null;
  }

  function moveToward(bot, x, z, speed, dt) {
    const dx = x - bot.pos.x;
    const dz = z - bot.pos.z;
    const dist = Math.hypot(dx, dz);
    if (dist < 0.15) return true;
    const stepX = (dx / dist) * speed * dt;
    const stepZ = (dz / dist) * speed * dt;
    const targetYaw = Math.atan2(-dx, -dz);
    let diff = targetYaw - bot.yaw;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    bot.yaw += Math.max(-3.2 * dt, Math.min(3.2 * dt, diff));
    const nx = bot.pos.x + stepX;
    if (!overlaps(nx, bot.pos.y, bot.pos.z)) bot.pos.x = nx;
    const nz = bot.pos.z + stepZ;
    if (!overlaps(bot.pos.x, bot.pos.y, nz)) bot.pos.z = nz;
    return dist < 0.5;
  }

  function shootAt(bot, seen, time, dt) {
    const def = WEAPONS[bot.weapon];
    bot.pitch += (seen.pitchTo - bot.pitch) * Math.min(1, dt * 10);
    let diff = seen.yawTo - bot.yaw;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    bot.yaw += Math.max(-2.6 * dt, Math.min(2.6 * dt, diff));
    if (time < bot.reactAt) return;
    bot.trackTime += dt;
    bot.burstTimer -= dt;
    if (bot.burstLeft <= 0 && bot.burstTimer <= 0) {
      bot.burstLeft = 3 + Math.floor(bot.random() * 3);
      bot.burstTimer = 0.55 + bot.random() * 0.5;
    }
    if (bot.burstLeft > 0 && bot.burstTimer > 0) {
      const gap = def.gap * 1.35;
      if (bot.burstTimer % gap < dt) {
        bot.burstLeft -= 1;
        // A scoped long shot is steadier: the awper's error shrinks with range.
        const rangeBonus = bot.weapon === 'dmr' && seen.dist > 18 ? 0.55 : 1;
        const error = (0.035 - bot.skill * 0.02) * (1 - Math.min(1, bot.trackTime / 1.5) * 0.5) * rangeBonus;
        const dir = dirTmp.set(
          -Math.sin(bot.yaw) * Math.cos(bot.pitch) + (bot.random() * 2 - 1) * error,
          Math.sin(bot.pitch) + (bot.random() * 2 - 1) * error,
          -Math.cos(bot.yaw) * Math.cos(bot.pitch) + (bot.random() * 2 - 1) * error,
        ).normalize();
        hooks.botShot(bot, dir, def);
      }
    }
  }

  function stepBot(bot, dt, time, ctx) {
    if (!bot.alive) {
      if (bot.fall < 1) {
        bot.fall = Math.min(1, bot.fall + dt / 0.4);
        bot.body.group.rotation.x = -bot.fall * 1.45;
        bot.body.group.position.y = -bot.fall * 0.1;
      }
      return;
    }
    // Fleeing a grenade overrides everything for a beat, then the bot resumes
    // from the nearest node.
    if (bot.state === 'flee') {
      bot.fleeTime -= dt;
      if (bot.fleeTime <= 0 || moveToward(bot, bot.fleeX, bot.fleeZ, FLEE_SPEED, dt)) {
        bot.state = 'route';
        bot.route = [nearestNode(bot.pos.x, bot.pos.z)];
        bot.routeIndex = 0;
      }
      bot.body.group.position.copy(bot.pos);
      bot.body.group.rotation.set(0, bot.yaw, 0);
      return;
    }
    const enemies = ctx.enemies(bot);
    bot.losTimer -= dt;
    let seen = null;
    if (bot.losTimer <= 0) {
      bot.losTimer = LOS_EVERY;
      seen = scan(bot, enemies, time);
    } else if (bot.target && bot.target.alive) {
      seen = canSee(bot, bot.target.pos, bot.target.pos.y + EYE);
      if (seen) bot.lastSeen = time;
    }

    // Bomb duty overrides wandering: planters push the site, defenders converge.
    // The retake staggers: half the defenders come through mid, half through
    // their lane, so they do not file into the same crossfire one by one.
    const bomb = ctx.bomb;
    if (bomb.state === 'planted' && bot.team === 'sentinel' && bot.state !== 'defuse') {
      if (!bot.retakeLane) bot.retakeLane = bot.random() < 0.5 ? 'mid' : 'lane';
      const from = nearestNode(bot.pos.x, bot.pos.z);
      const site = SITES[bomb.site];
      bot.route = bot.retakeLane === 'mid'
        ? findRoute(from, 'MID4')
        : findRoute(from, nearestNode(site.x, site.z));
      bot.routeIndex = 0;
      bot.state = 'defuse';
    }
    if (bomb.state === 'planted' && bot.team === 'vanguard' && bot.state !== 'hold') {
      bot.state = 'hold';
      bot.holdNode = bomb.site;
    }

    if (seen) {
      bot.state = 'engage';
      shootAt(bot, seen, time, dt);
      // Strafe while fighting so a bot is not a standing target. The awper
      // holds still instead: it is a long-angle gun, not a duelist.
      if (bot.weapon !== 'dmr') {
        bot.strafeTimer -= dt;
        if (bot.strafeTimer <= 0) {
          bot.strafeTimer = 0.7 + bot.random() * 0.9;
          bot.strafeDir = bot.random() < 0.5 ? -1 : 1;
        }
        const side = Math.cos(bot.yaw) * bot.strafeDir;
        const fwd = Math.sin(bot.yaw) * bot.strafeDir;
        const nx = bot.pos.x + side * FIGHT_SPEED * dt;
        const nz = bot.pos.z + fwd * FIGHT_SPEED * dt;
        if (!overlaps(nx, bot.pos.y, bot.pos.z)) bot.pos.x = nx;
        if (!overlaps(bot.pos.x, bot.pos.y, nz)) bot.pos.z = nz;
      }
    } else if (bot.state === 'engage') {
      bot.state = bot.team === 'vanguard' ? 'route' : 'hold';
    }

    if (!seen) {
      // Route walking serves 'route' and 'defuse' alike: a defusing bot walks
      // its retake lane first, then closes on the site in the defuse branch.
      if ((bot.state === 'route' || bot.state === 'defuse') && bot.route.length) {
        const node = nodePosition(bot.route[Math.min(bot.routeIndex, bot.route.length - 1)]);
        if (moveToward(bot, node.x, node.z, ROUTE_SPEED, dt)) {
          bot.routeIndex += 1;
          if (bot.routeIndex >= bot.route.length) {
            if (bot.state === 'route') {
              bot.state = 'hold';
              bot.holdNode = bot.route[bot.route.length - 1];
              bot.holdTime = 0;
            } else {
              bot.route = [];
            }
          }
        }
      } else if (bot.state === 'defuse') {
        const site = SITES[bomb.site];
        if (site && Math.hypot(site.x - bot.pos.x, site.z - bot.pos.z) < 1.6) {
          bot.defuseProgress += dt;
          hooks.defuseProgress(bot, bot.defuseProgress);
        } else if (site) {
          moveToward(bot, site.x, site.z, ROUTE_SPEED, dt);
        }
      } else if (bot.state === 'hold') {
        bot.holdTime += dt;
        // Attackers holding a site plant the charge.
        if (bot.team === 'vanguard' && bomb.state === 'carried' && bot.holdNode in SITES) {
          const site = SITES[bot.holdNode];
          if (Math.hypot(site.x - bot.pos.x, site.z - bot.pos.z) < site.r) {
            bot.plantProgress += dt;
            hooks.plantProgress(bot, bot.holdNode, bot.plantProgress);
          }
        }
        // Look around while holding: slow sweeps, so a held corner is not blind.
        bot.yaw += Math.sin(time * 0.5 + bot.id.charCodeAt(0)) * 0.12 * dt;
      }
    }

    bot.body.group.position.copy(bot.pos);
    bot.body.group.rotation.set(0, bot.yaw, 0);
    // Walk cycle: legs swing with speed, so movement reads on screen.
    const speed = Math.hypot(bot.pos.x - (bot.prevX ?? bot.pos.x), bot.pos.z - (bot.prevZ ?? bot.pos.z)) / Math.max(dt, 0.001);
    bot.prevX = bot.pos.x;
    bot.prevZ = bot.pos.z;
    const swing = Math.min(1, speed / ROUTE_SPEED) * 0.5 * Math.sin(time * 9 + bot.id.charCodeAt(0));
    bot.body.group.children[0].rotation.x = swing;
    bot.body.group.children[1].rotation.x = -swing;
  }

  function hearNoise(x, z) {
    for (const bot of bots) {
      if (!bot.alive || bot.target || bot.state === 'flee') continue;
      const d = Math.hypot(x - bot.pos.x, z - bot.pos.z);
      if (d < 26 && bot.state !== 'defuse') {
        bot.route = findRoute(nearestNode(bot.pos.x, bot.pos.z), nearestNode(x, z));
        bot.routeIndex = 0;
        bot.state = 'route';
      }
    }
  }

  // A grenade going off sends nearby bots running from the blast instead of
  // standing in it. Fleeing bots do not hear noise until they stop.
  function fleeFrom(x, z) {
    for (const bot of bots) {
      if (!bot.alive || bot.state === 'defuse') continue;
      const dx = bot.pos.x - x;
      const dz = bot.pos.z - z;
      const d = Math.hypot(dx, dz);
      if (d < FLEE_RADIUS) {
        const away = Math.max(d, 0.5);
        bot.fleeX = bot.pos.x + (dx / away) * 7;
        bot.fleeZ = bot.pos.z + (dz / away) * 7;
        bot.fleeX = Math.max(-23, Math.min(23, bot.fleeX));
        bot.fleeZ = Math.max(-17, Math.min(17, bot.fleeZ));
        bot.fleeTime = 0.9;
        bot.state = 'flee';
      }
    }
  }

  function damage(bot, amount, part) {
    if (!bot.alive) return false;
    let rest = amount;
    if (bot.armor > 0) {
      const absorbed = Math.min(bot.armor, rest * 0.5);
      bot.armor -= absorbed;
      rest -= absorbed;
    }
    bot.health = Math.max(0, bot.health - rest);
    if (bot.health === 0) {
      bot.alive = false;
      bot.deadAt = hooks.now();
      bot.target = null;
      return true;
    }
    return false;
  }

  return {
    bots,
    hitMeshes,
    reset,
    hearNoise,
    fleeFrom,
    damage,
    step(dt, time, ctx) {
      for (const bot of bots) stepBot(bot, dt, time, ctx);
    },
    aliveCount(team) {
      return bots.filter((b) => b.team === team && b.alive).length;
    },
    moneyRound(winnerTeam) {
      for (const bot of bots) {
        bot.money += bot.team === winnerTeam ? 3250 : 1900;
      }
    },
  };
}
