// The DOM HUD: crosshair, hit marker, damage numbers, health, ammo, money, timer,
// score, round history, killfeed, scoreboard, buy menu, plant/defuse progress and
// the round banners. It never touches the simulation; main.js pushes numbers in
// and reads the buy clicks out.
import { SHOP } from './economy.js';
import { WEAPONS } from './weapons.js';

export function createHud(hooks) {
  const $ = (id) => document.getElementById(id);
  const overlay = $('overlay');
  const title = $('overlay-title');
  const copy = $('overlay-copy');
  const play = $('play');
  const ammoMag = $('ammo-mag');
  const ammoReserve = $('ammo-reserve');
  const ammoEl = $('ammo');
  const weaponName = $('weapon-name');
  const healthFill = $('health-fill');
  const healthNum = $('health-num');
  const armorNum = $('armor-num');
  const moneyEl = $('money');
  const timerEl = $('timer');
  const scoreV = $('score-v');
  const scoreS = $('score-s');
  const roundEl = $('round');
  const aliveV = $('alive-v');
  const aliveS = $('alive-s');
  const killfeed = $('killfeed');
  const objectiveEl = $('objective');
  const banner = $('banner');
  const bannerTitle = $('banner-title');
  const bannerSub = $('banner-sub');
  const progress = $('progress');
  const progressFill = $('progress-fill');
  const progressLabel = $('progress-label');
  const buyEl = $('buy');
  const buyMoney = $('buy-money');
  const buyRound = $('buy-round');
  const buyGrid = $('buy-grid');
  const vignette = $('vignette');
  const crosshair = $('crosshair');
  const hitmarker = $('hitmarker');
  const hint = $('hint');
  const damageLayer = $('damage-layer');
  const roundHistoryEl = $('round-history');
  const scoreboardEl = $('scoreboard');
  const scoreboardBody = $('scoreboard-body');
  const scoreboardMvp = $('scoreboard-mvp');
  const scopeOverlay = $('scope-overlay');
  const spectateChip = $('spectate-chip');

  let last = {};
  let hitTimer = 0;
  let bannerTimer = 0;
  let buyOpen = false;
  let damageNext = 0;
  const damageSlots = [];
  for (let i = 0; i < 6; i += 1) {
    const slot = document.createElement('div');
    slot.className = 'damage-number';
    damageLayer.appendChild(slot);
    damageSlots.push(slot);
  }

  for (const item of SHOP) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'buy-item';
    button.dataset.id = item.id;
    button.innerHTML = `<b>${item.name}</b><span>$${item.price}</span><i>${item.note}</i>`;
    button.addEventListener('click', () => hooks.onBuy(item.id));
    buyGrid.appendChild(button);
  }

  function setText(el, value, key) {
    if (last[key] === value) return;
    last[key] = value;
    el.textContent = value;
  }

  return {
    setHealth(health, armor) {
      setText(healthNum, String(health), 'hp');
      setText(armorNum, armor > 0 ? `+${armor}` : '', 'ar');
      healthFill.style.width = `${health}%`;
      healthFill.classList.toggle('low', health <= 30);
    },
    setAmmo(mag, reserve, name) {
      setText(ammoMag, String(mag), 'mag');
      setText(ammoReserve, `/ ${reserve}`, 'res');
      setText(weaponName, name, 'wn');
      ammoEl.classList.toggle('empty', mag === 0);
    },
    setMoney(value) {
      setText(moneyEl, `$${value}`, 'money');
      setText(buyMoney, `$${value}`, 'bmoney');
      for (const button of buyGrid.children) {
        const item = SHOP.find((entry) => entry.id === button.dataset.id);
        button.disabled = value < item.price;
      }
    },
    setTimer(seconds, planted) {
      const left = Math.max(0, Math.ceil(seconds));
      setText(timerEl, `${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`, 'timer');
      timerEl.classList.toggle('planted', planted);
    },
    setScore(v, s, round, aliveVCount, aliveSCount) {
      setText(scoreV, String(v), 'sv');
      setText(scoreS, String(s), 'ss');
      setText(roundEl, `ROUND ${round}`, 'round');
      setText(buyRound, String(round), 'bround');
      setText(aliveV, `${aliveVCount} alive`, 'av');
      setText(aliveS, `${aliveSCount} alive`, 'as');
    },
    // Round history: one pip per finished round, gold for a Vanguard round,
    // teal for a Sentinel round, so the match's shape reads at a glance.
    setRoundHistory(history) {
      const key = history.join('');
      if (last.history === key) return;
      last.history = key;
      roundHistoryEl.innerHTML = '';
      for (const winner of history) {
        const pip = document.createElement('i');
        pip.className = winner === 'vanguard' ? 'pip win' : 'pip loss';
        roundHistoryEl.appendChild(pip);
      }
    },
    setObjective(text) {
      setText(objectiveEl, text, 'obj');
    },
    setCrosshair(spread) {
      crosshair.style.setProperty('--gap', `${4 + spread * 260}px`);
    },
    hitMarker(killed, holdMs = 90) {
      hitmarker.classList.add('on');
      hitmarker.classList.toggle('kill', killed);
      clearTimeout(hitTimer);
      hitTimer = setTimeout(() => hitmarker.classList.remove('on', 'kill'), holdMs);
    },
    // Damage numbers: the exact damage of a hit floats up from the crosshair
    // and fades, so a player learns what each gun does without a spreadsheet.
    damageNumber(amount, killed) {
      const slot = damageSlots[damageNext];
      damageNext = (damageNext + 1) % damageSlots.length;
      slot.textContent = killed ? `${Math.round(amount)} †` : String(Math.round(amount));
      slot.classList.toggle('kill', killed);
      slot.classList.remove('show');
      // Reflow restarts the float animation on a reused slot.
      void slot.offsetWidth;
      slot.classList.add('show');
    },
    damage() {
      vignette.classList.add('on');
      setTimeout(() => vignette.classList.remove('on'), 180);
    },
    feed(text, good) {
      const line = document.createElement('div');
      line.className = good ? 'feed-line good' : 'feed-line';
      line.textContent = text;
      killfeed.prepend(line);
      while (killfeed.children.length > 4) killfeed.removeChild(killfeed.lastChild);
      setTimeout(() => line.remove(), 6000);
    },
    showBanner(titleText, sub, win) {
      bannerTitle.textContent = titleText;
      bannerSub.textContent = sub;
      banner.classList.toggle('win', win);
      banner.classList.toggle('lose', !win);
      banner.hidden = false;
      clearTimeout(bannerTimer);
      bannerTimer = setTimeout(() => { banner.hidden = true; }, 3800);
    },
    hideBanner() {
      banner.hidden = true;
    },
    showProgress(label, fraction) {
      progress.hidden = false;
      progressLabel.textContent = label;
      progressFill.style.width = `${Math.min(100, Math.max(0, fraction * 100))}%`;
    },
    hideProgress() {
      progress.hidden = true;
    },
    setHint(text) {
      setText(hint, text, 'hint');
    },
    // Scoreboard: every combatant's kills and deaths, most kills first, with
    // the match MVP named at the top. Shown on demand (Tab) and at match end.
    showScoreboard(rows, mvp) {
      scoreboardBody.innerHTML = '';
      for (const row of rows) {
        const tr = document.createElement('tr');
        tr.className = row.team;
        const cells = [row.name, row.team === 'vanguard' ? 'Vanguard' : 'Sentinel', String(row.kills), String(row.deaths), row.alive ? 'alive' : 'down'];
        for (const value of cells) {
          const td = document.createElement('td');
          td.textContent = value;
          tr.appendChild(td);
        }
        scoreboardBody.appendChild(tr);
      }
      scoreboardMvp.textContent = mvp ? `MVP — ${mvp}` : '';
      scoreboardEl.hidden = false;
    },
    hideScoreboard() {
      scoreboardEl.hidden = true;
    },
    isScoreboardOpen() {
      return !scoreboardEl.hidden;
    },
    // Scope: the DMR's sight picture — a dark ring, a fine cross and no
    // view model — while the right mouse button is held.
    setScoped(on) {
      scopeOverlay.hidden = !on;
      crosshair.classList.toggle('scoped', on);
    },
    // Spectating: who the death-cam rides with, and how to cycle.
    setSpectating(name) {
      if (!name) {
        spectateChip.hidden = true;
        return;
      }
      spectateChip.textContent = `Spectating ${name} — press E to cycle`;
      spectateChip.hidden = false;
    },
    showBuy(open) {
      buyOpen = open;
      buyEl.hidden = !open;
      if (open) document.exitPointerLock?.();
    },
    isBuyOpen() {
      return buyOpen;
    },
    showOverlay(mode, data) {
      const texts = {
        start: ['SALTLINE', 'Kestrel Yard — plant the charge at A or B, or wipe the Sentinels. First to 7 rounds takes the yard.', 'Click to play'],
        paused: ['SALTLINE', 'Paused. Click to resume.', 'Click to resume'],
        dead: ['You are down', 'Your squad fights on. Next round starts soon.', 'Keep watching'],
        match: [data?.won ? 'Yard taken' : 'Yard lost', data?.won ? 'Vanguard takes Kestrel Yard.' : 'Sentinel holds Kestrel Yard.', 'Play again'],
      };
      const [t, c, a] = texts[mode] || texts.start;
      title.textContent = t;
      copy.textContent = c;
      play.textContent = a;
      overlay.hidden = false;
      play.focus();
    },
    hideOverlay() {
      overlay.hidden = true;
    },
    onPlay(handler) {
      play.addEventListener('click', handler);
    },
  };
}
