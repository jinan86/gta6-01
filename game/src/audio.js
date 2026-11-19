// All sound is synthesized with WebAudio — no audio files, no network.
// Engine hum, a two-tone police siren, gunshots, punches, pickup chimes,
// and a looping synth "radio" (bass + lead sequencer, 3 stations).
const STATIONS = [
  { name: 'BAY FM 88 — Sunset Drive', bpm: 96, root: 110, scale: [0, 3, 5, 7, 10, 12], wave: 'sawtooth' },
  { name: 'PIER 9 — Harbor Nights', bpm: 78, root: 98, scale: [0, 2, 3, 7, 8, 12], wave: 'triangle' },
  { name: 'SOLARA — Night Cruise', bpm: 120, root: 130.8, scale: [0, 2, 4, 7, 9, 12], wave: 'square' },
];

export function createAudio() {
  let ctx = null;
  let master = null;
  let engineOsc = null;
  let engineGain = null;
  let sirenOsc = null;
  let sirenGain = null;
  let musicGain = null;
  let station = 0;
  let muted = false;
  let musicTimer = null;
  let stepIndex = 0;
  let lastBeat = 0;

  function ensure() {
    if (ctx) return true;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = muted ? 0 : 0.5;
      master.connect(ctx.destination);
      engineOsc = ctx.createOscillator();
      engineOsc.type = 'sawtooth';
      engineOsc.frequency.value = 55;
      engineGain = ctx.createGain();
      engineGain.gain.value = 0;
      engineOsc.connect(engineGain);
      engineGain.connect(master);
      engineOsc.start();
      sirenOsc = ctx.createOscillator();
      sirenOsc.type = 'sine';
      sirenOsc.frequency.value = 700;
      sirenGain = ctx.createGain();
      sirenGain.gain.value = 0;
      sirenOsc.connect(sirenGain);
      sirenGain.connect(master);
      sirenOsc.start();
      musicGain = ctx.createGain();
      musicGain.gain.value = 0.16;
      musicGain.connect(master);
      return true;
    } catch {
      return false;
    }
  }

  function note(freq, when, dur, type, vol, dest) {
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.value = freq;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0, when);
    gain.gain.linearRampToValueAtTime(vol, when + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, when + dur);
    osc.connect(gain);
    gain.connect(dest || master);
    osc.start(when);
    osc.stop(when + dur + 0.05);
  }

  function musicStep() {
    if (!ctx || muted) return;
    const st = STATIONS[station];
    const beat = 60 / st.bpm / 2;
    const now = ctx.currentTime;
    if (now - lastBeat < beat * 0.9) return;
    lastBeat = now;
    const semis = st.scale[stepIndex % st.scale.length] + 12 * Math.floor(stepIndex / st.scale.length) % 24;
    const freq = st.root * Math.pow(2, semis / 12);
    if (stepIndex % 2 === 0) note(st.root / 2, now, beat * 1.8, 'sine', 0.5, musicGain);
    if (stepIndex % 4 === 2) note(freq, now, beat * 1.2, st.wave, 0.22, musicGain);
    if (stepIndex % 8 === 7) note(freq * 2, now, beat, 'sine', 0.12, musicGain);
    stepIndex += 1;
  }

  return {
    unlock() {
      if (ensure() && ctx.state === 'suspended') ctx.resume();
      if (musicTimer === null) musicTimer = window.setInterval(musicStep, 60);
    },
    setMuted(value) {
      muted = value;
      if (master) master.gain.value = muted ? 0 : 0.5;
    },
    isMuted() { return muted; },
    nextStation() {
      station = (station + 1) % STATIONS.length;
      stepIndex = 0;
      return STATIONS[station].name;
    },
    stationName() { return STATIONS[station].name; },
    setEngine(speedRatio, inCar) {
      if (!ctx) return;
      engineGain.gain.value = inCar ? 0.05 + speedRatio * 0.09 : 0;
      engineOsc.frequency.value = 55 + speedRatio * 140;
    },
    setSiren(on, time) {
      if (!ctx) return;
      sirenGain.gain.value = on ? 0.035 : 0;
      if (on) sirenOsc.frequency.value = 650 + 250 * Math.sin(time * 4);
    },
    blip(freq, dur, type, vol) {
      if (!ensure()) return;
      note(freq, ctx.currentTime, dur, type || 'sine', vol || 0.3);
    },
    gunshot() {
      if (!ensure()) return;
      const dur = 0.18;
      const buffer = ctx.createBuffer(1, ctx.sampleRate * dur, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < data.length; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
      const src = ctx.createBufferSource();
      src.buffer = buffer;
      const gain = ctx.createGain();
      gain.gain.value = 0.5;
      src.connect(gain);
      gain.connect(master);
      src.start();
      note(90, ctx.currentTime, 0.12, 'sine', 0.4);
    },
    punch() {
      if (!ensure()) return;
      note(70, ctx.currentTime, 0.12, 'sine', 0.5);
      note(180, ctx.currentTime, 0.06, 'triangle', 0.25);
    },
    chime() {
      if (!ensure()) return;
      note(880, ctx.currentTime, 0.15, 'sine', 0.3);
      note(1318, ctx.currentTime + 0.09, 0.2, 'sine', 0.3);
    },
    crash() {
      if (!ensure()) return;
      note(55, ctx.currentTime, 0.3, 'sawtooth', 0.4);
      note(40, ctx.currentTime + 0.05, 0.25, 'square', 0.25);
    },
  };
}
