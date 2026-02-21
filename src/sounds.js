// Web Audio API sound pack - no external files needed
let audioCtx = null;

function getCtx() {
  if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  return audioCtx;
}

function playTone(freq, duration, type = "sine", volume = 0.3) {
  try {
    const ctx = getCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.value = freq;
    osc.type = type;
    gain.gain.setValueAtTime(volume, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + duration);
  } catch (_) {}
}

export function playCorrect() {
  playTone(880, 0.08, "sine", 0.2);
  setTimeout(() => playTone(1100, 0.06, "sine", 0.15), 40);
}

export function playWrong() {
  playTone(180, 0.15, "sawtooth", 0.15);
  setTimeout(() => playTone(120, 0.2, "sawtooth", 0.12), 80);
}

export function playVictory() {
  const notes = [523, 659, 784, 1047];
  notes.forEach((freq, i) => {
    setTimeout(() => playTone(freq, 0.2, "sine", 0.2), i * 120);
  });
}
