// All sound is synthesised with WebAudio: no audio files, no network. The context
// starts suspended and resumes on the first click, so nothing plays before the player
// opts in. Every call guards the context, so headless captures stay silent.
export function createAudio() {
  let ctx = null;
  let master = null;
  let noiseBuffer = null;

  function ensure() {
    if (ctx) {
      if (ctx.state === 'suspended') ctx.resume().catch(() => {});
      return ctx;
    }
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0.5;
      master.connect(ctx.destination);
      const length = ctx.sampleRate * 0.5;
      noiseBuffer = ctx.createBuffer(1, length, ctx.sampleRate);
      const data = noiseBuffer.getChannelData(0);
      for (let i = 0; i < length; i += 1) data[i] = Math.random() * 2 - 1;
    } catch {
      ctx = null;
    }
    return ctx;
  }

  function noise(when, duration, filterFreq, gainValue, type = 'lowpass') {
    if (!ctx || !noiseBuffer) return;
    const source = ctx.createBufferSource();
    source.buffer = noiseBuffer;
    source.loop = true;
    const filter = ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.value = filterFreq;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(gainValue, when);
    gain.gain.exponentialRampToValueAtTime(0.001, when + duration);
    source.connect(filter).connect(gain).connect(master);
    source.start(when);
    source.stop(when + duration + 0.02);
  }

  function tone(when, freq, duration, gainValue, type = 'sine') {
    if (!ctx) return;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.value = freq;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(gainValue, when);
    gain.gain.exponentialRampToValueAtTime(0.001, when + duration);
    osc.connect(gain).connect(master);
    osc.start(when);
    osc.stop(when + duration + 0.02);
  }

  return {
    unlock() {
      ensure();
    },
    shot(kind) {
      if (!ensure()) return;
      const t = ctx.currentTime;
      noise(t, kind === 'dmr' ? 0.32 : 0.14, kind === 'shotgun' ? 900 : 2400, kind === 'dmr' ? 0.9 : 0.55);
      tone(t, kind === 'dmr' ? 70 : 120, 0.1, 0.3, 'square');
    },
    enemyShot(distance) {
      if (!ensure()) return;
      const t = ctx.currentTime;
      const gain = Math.max(0.06, 0.5 - distance * 0.012);
      noise(t, 0.12, 1600, gain);
    },
    dry() {
      if (!ensure()) return;
      tone(ctx.currentTime, 900, 0.04, 0.12, 'square');
    },
    reload() {
      if (!ensure()) return;
      const t = ctx.currentTime;
      tone(t, 500, 0.05, 0.2, 'square');
      tone(t + 0.35, 700, 0.05, 0.2, 'square');
    },
    hit() {
      if (!ensure()) return;
      tone(ctx.currentTime, 1400, 0.05, 0.25, 'sine');
    },
    kill() {
      if (!ensure()) return;
      const t = ctx.currentTime;
      tone(t, 880, 0.08, 0.25, 'sine');
      tone(t + 0.08, 1320, 0.12, 0.25, 'sine');
    },
    hurt() {
      if (!ensure()) return;
      const t = ctx.currentTime;
      noise(t, 0.18, 500, 0.4);
      tone(t, 110, 0.18, 0.3, 'sawtooth');
    },
    plantBeep(final) {
      if (!ensure()) return;
      tone(ctx.currentTime, final ? 1600 : 1100, final ? 0.25 : 0.08, 0.25, 'sine');
    },
    explosion() {
      if (!ensure()) return;
      const t = ctx.currentTime;
      noise(t, 0.9, 300, 1);
      tone(t, 45, 0.8, 0.8, 'sine');
    },
    round(win) {
      if (!ensure()) return;
      const t = ctx.currentTime;
      const notes = win ? [523, 659, 784] : [392, 330, 262];
      notes.forEach((freq, i) => tone(t + i * 0.12, freq, 0.18, 0.25, 'triangle'));
    },
    buy() {
      if (!ensure()) return;
      const t = ctx.currentTime;
      tone(t, 660, 0.06, 0.2, 'sine');
      tone(t + 0.07, 990, 0.09, 0.2, 'sine');
    },
    scope() {
      if (!ensure()) return;
      tone(ctx.currentTime, 1800, 0.03, 0.15, 'sine');
    },
  };
}
