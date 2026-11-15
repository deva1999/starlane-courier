// Starlane Courier — sound, all of it synthesised with WebAudio: no audio
// files, nothing to load, and every note is this game's own. Short blips
// answer each action, and a small two-bar loop hums along under a run.
// Browsers only allow sound after a gesture, so the context wakes on
// start; the screenshot scenes and tests stay silent by never waking it.

/** Note frequencies for the little pickup arpeggio (a bright major run). */
const ARP = [523.25, 659.25, 783.99, 1046.5];
/** The music loop: a gentle bass pulse and a sparse lead, in C major. */
const BASS = [130.81, 0, 196.0, 0, 174.61, 0, 196.0, 0];
const LEAD = [392.0, 0, 523.25, 0, 659.25, 0, 523.25, 440.0];

export function createAudio() {
  let context = null;
  let master = null;
  let muted = false;
  let musicTimer = null;
  let step = 0;

  /** Wake the context (call from a click or keypress). Safe to repeat. */
  function wake() {
    if (context) {
      if (context.state === 'suspended') context.resume();
      return;
    }
    const Ctor = window.AudioContext || window.webkitAudioContext;
    if (!Ctor) return;
    context = new Ctor();
    master = context.createGain();
    master.gain.value = muted ? 0 : 0.5;
    master.connect(context.destination);
  }

  /** One oscillator note with a quick envelope. */
  function tone(freq, at, seconds, type, volume, glideTo) {
    if (!context || muted) return;
    const osc = context.createOscillator();
    const gain = context.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, at);
    if (glideTo) osc.frequency.exponentialRampToValueAtTime(glideTo, at + seconds);
    gain.gain.setValueAtTime(0, at);
    gain.gain.linearRampToValueAtTime(volume, at + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.001, at + seconds);
    osc.connect(gain).connect(master);
    osc.start(at);
    osc.stop(at + seconds + 0.05);
  }

  /** A filtered noise puff, for the crash and the jump's rush of air. */
  function noise(at, seconds, volume, from, to) {
    if (!context || muted) return;
    const length = Math.max(1, Math.floor(context.sampleRate * seconds));
    const buffer = context.createBuffer(1, length, context.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / length);
    const source = context.createBufferSource();
    source.buffer = buffer;
    const filter = context.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(from, at);
    filter.frequency.exponentialRampToValueAtTime(to, at + seconds);
    const gain = context.createGain();
    gain.gain.value = volume;
    source.connect(filter).connect(gain).connect(master);
    source.start(at);
  }

  function now() {
    return context ? context.currentTime : 0;
  }

  return {
    wake,
    /** The pickup chime climbs with the combo. */
    star(combo) {
      if (!context) return;
      const base = ARP[Math.min(ARP.length - 1, Math.floor((combo - 1) / 2))];
      tone(base, now(), 0.16, 'triangle', 0.35);
      tone(base * 2, now() + 0.05, 0.12, 'sine', 0.18);
    },
    shield() {
      if (!context) return;
      tone(880, now(), 0.2, 'sine', 0.3);
      tone(1318.5, now() + 0.08, 0.24, 'sine', 0.25);
    },
    near() {
      if (!context) return;
      tone(1567.98, now(), 0.07, 'square', 0.08);
    },
    jump() {
      if (!context) return;
      noise(now(), 0.18, 0.12, 500, 2400);
    },
    slide() {
      if (!context) return;
      noise(now(), 0.22, 0.1, 1600, 300);
    },
    shieldBreak() {
      if (!context) return;
      tone(392, now(), 0.3, 'sawtooth', 0.2, 98);
      noise(now(), 0.25, 0.2, 900, 150);
    },
    crash() {
      if (!context) return;
      tone(110, now(), 0.5, 'sawtooth', 0.35, 40);
      noise(now(), 0.45, 0.3, 700, 90);
    },
    startMusic() {
      if (!context || musicTimer) return;
      const tick = () => {
        if (!muted) {
          const at = now() + 0.03;
          const i = step % 8;
          if (BASS[i]) tone(BASS[i], at, 0.22, 'triangle', 0.16);
          if (LEAD[i]) tone(LEAD[i], at, 0.18, 'sine', 0.07);
        }
        step += 1;
      };
      tick();
      musicTimer = window.setInterval(tick, 240);
    },
    stopMusic() {
      if (musicTimer) window.clearInterval(musicTimer);
      musicTimer = null;
      step = 0;
    },
    toggleMute() {
      muted = !muted;
      if (master) master.gain.value = muted ? 0 : 0.5;
      return muted;
    },
    isMuted() {
      return muted;
    },
  };
}
