// Rounds and the match: buy phase, live round, plant and defuse, round end, first
// to 7 wins the match — or, at 6–6, overtime: first to 2 overtime rounds takes
// the yard, with a fresh $4,000 each side. One state object, one step function;
// main.js renders what it says and plays the sounds. The bomb is the objective
// beyond killing. The match keeps its own history (one winner per round, for the
// HUD's round strip) and its kill ledger (for the scoreboard's MVP).
import { SITES } from './world.js';

export const BUY_SECONDS = 18;
export const ROUND_SECONDS = 100;
export const PLANT_SECONDS = 3;
export const DEFUSE_SECONDS = 5;
export const DETONATE_SECONDS = 35;
export const END_SECONDS = 4;
export const WIN_ROUNDS = 7;
export const OT_WIN_ROUNDS = 2;
export const OT_MONEY = 4000;

export function createMatch() {
  const match = {
    round: 1,
    wins: { vanguard: 0, sentinel: 0 },
    phase: 'buy',
    phaseLeft: BUY_SECONDS,
    bomb: { state: 'carried', site: null, progress: 0, detonateLeft: 0, planter: null },
    money: 800,
    lossStreak: 0,
    lastResult: null,
    over: false,
    overtime: false,
    otWins: { vanguard: 0, sentinel: 0 },
    history: [],
    kills: {},
    deaths: {},
  };

  function startRound() {
    match.phase = 'buy';
    match.phaseLeft = BUY_SECONDS;
    match.bomb = { state: 'carried', site: null, progress: 0, detonateLeft: 0, planter: null };
  }

  function recordKill(name, team) {
    match.kills[name] = (match.kills[name] || 0) + 1;
    match.kills[`__team:${name}`] = team;
  }

  function recordDeath(name) {
    match.deaths[name] = (match.deaths[name] || 0) + 1;
  }

  function mvp() {
    let best = null;
    let bestKills = -1;
    for (const [name, kills] of Object.entries(match.kills)) {
      if (name.startsWith('__team:')) continue;
      if (kills > bestKills) { bestKills = kills; best = name; }
    }
    return best;
  }

  function endRound(winner, reason) {
    match.phase = 'over';
    match.phaseLeft = END_SECONDS;
    // A round won from 6–6 does not end the match: it opens overtime, and
    // counts as that side's first overtime round.
    const wasTied6 = match.wins.vanguard === 6 && match.wins.sentinel === 6;
    match.wins[winner] += 1;
    match.history.push(winner);
    match.lastResult = { winner, reason, round: match.round };
    const playerWon = winner === 'vanguard';
    match.money += playerWon ? 3250 : 1900 + Math.min(1000, match.lossStreak * 500);
    match.lossStreak = playerWon ? 0 : match.lossStreak + 1;
    if (match.overtime) {
      match.otWins[winner] += 1;
      if (match.otWins[winner] >= OT_WIN_ROUNDS) match.over = true;
    } else if (wasTied6) {
      match.overtime = true;
      match.otWins[winner] = 1;
      match.money = Math.max(match.money, OT_MONEY);
    } else if (match.wins[winner] >= WIN_ROUNDS) {
      match.over = true;
    }
  }

  function nextRound() {
    match.round += 1;
    startRound();
  }

  function step(dt, alive) {
    if (match.phase === 'over') {
      match.phaseLeft -= dt;
      if (match.phaseLeft <= 0) {
        if (match.over) return;
        nextRound();
      }
      return;
    }
    if (match.phase === 'buy') {
      match.phaseLeft -= dt;
      if (match.phaseLeft <= 0) {
        match.phase = 'live';
        match.phaseLeft = ROUND_SECONDS;
      }
      return;
    }
    // live or planted: the clock runs, and the round can end four ways. Once the
    // charge is planted the bomb timer governs, not the round timer, and a dead
    // attacking team does not end the round while it ticks.
    if (match.bomb.state === 'planted') {
      match.phase = 'planted';
      match.bomb.detonateLeft -= dt;
      if (match.bomb.detonateLeft <= 0) { endRound('vanguard', 'detonation'); return; }
      if (alive.sentinel === 0) { endRound('vanguard', 'elimination'); return; }
      return;
    }
    match.phaseLeft -= dt;
    if (alive.vanguard === 0) { endRound('sentinel', 'elimination'); return; }
    if (alive.sentinel === 0) { endRound('vanguard', 'elimination'); return; }
    if (match.phaseLeft <= 0) endRound('sentinel', 'time');
  }

  function plantAt(site) {
    const zone = SITES[site];
    return zone;
  }

  return {
    state: match,
    startRound,
    endRound,
    nextRound,
    step,
    plantAt,
    recordKill,
    recordDeath,
    mvp,
    inSite(x, z, site) {
      const zone = SITES[site];
      return Math.hypot(zone.x - x, zone.z - z) < zone.r;
    },
    reset() {
      match.round = 1;
      match.wins = { vanguard: 0, sentinel: 0 };
      match.money = 800;
      match.lossStreak = 0;
      match.lastResult = null;
      match.over = false;
      match.overtime = false;
      match.otWins = { vanguard: 0, sentinel: 0 };
      match.history = [];
      match.kills = {};
      match.deaths = {};
      startRound();
    },
  };
}
