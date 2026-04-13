// チップチューン効果音（Web Audio API）
let audioCtx = null;

function getCtx() {
  if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  return audioCtx;
}

function playTone(freq, duration = 0.1, type = 'square', volume = 0.15) {
  if (localStorage.getItem('ccr-sound') === 'off') return;
  try {
    const ctx = getCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    gain.gain.value = volume;
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + duration);
  } catch (_) {}
}

export function soundBoot() {
  playTone(523, 0.08); // C5
  setTimeout(() => playTone(659, 0.08), 80); // E5
  setTimeout(() => playTone(880, 0.18), 160); // A5（最後ちょい高め）
}

export function soundSessionStart() {
  // 没入感：周波数スイープ + 和音レイヤー
  if (localStorage.getItem('ccr-sound') === 'off') return;
  try {
    const ctx = getCtx();
    const now = ctx.currentTime;

    // スイープ：低音から高音へ滑らかに上昇
    const sweep = ctx.createOscillator();
    const sweepGain = ctx.createGain();
    sweep.type = 'sine';
    sweep.frequency.setValueAtTime(150, now);
    sweep.frequency.exponentialRampToValueAtTime(800, now + 0.6);
    sweepGain.gain.setValueAtTime(0.12, now);
    sweepGain.gain.exponentialRampToValueAtTime(0.001, now + 0.8);
    sweep.connect(sweepGain);
    sweepGain.connect(ctx.destination);
    sweep.start(now);
    sweep.stop(now + 0.8);

    // 和音：ふわっと広がる（少し遅れて）
    [523, 659, 784].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0, now + 0.3);
      gain.gain.linearRampToValueAtTime(0.08, now + 0.45);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 1.2);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now + 0.3);
      osc.stop(now + 1.2);
    });

    // 高音キラッ（最後）
    const sparkle = ctx.createOscillator();
    const sparkleGain = ctx.createGain();
    sparkle.type = 'sine';
    sparkle.frequency.value = 1320;
    sparkleGain.gain.setValueAtTime(0, now + 0.5);
    sparkleGain.gain.linearRampToValueAtTime(0.1, now + 0.55);
    sparkleGain.gain.exponentialRampToValueAtTime(0.001, now + 1.0);
    sparkle.connect(sparkleGain);
    sparkleGain.connect(ctx.destination);
    sparkle.start(now + 0.5);
    sparkle.stop(now + 1.0);
  } catch (_) {}
}

export function soundComplete() {
  playTone(784, 0.08); // G5
  setTimeout(() => playTone(988, 0.08), 80); // B5
  setTimeout(() => playTone(1175, 0.15), 160); // D6
}

export function soundError() {
  playTone(330, 0.12, 'sawtooth'); // E4
  setTimeout(() => playTone(262, 0.2, 'sawtooth'), 120); // C4
}

export function soundClick() {
  playTone(880, 0.05, 'square', 0.12); // A5 少し長め・音量UP
}

export function soundNotification() {
  playTone(880, 0.06); // A5
  setTimeout(() => playTone(1109, 0.1), 80); // C#6
}

// --- BGM ---
let bgmCtx = null;
let bgmNodes = []; // { osc, gain }[]
let bgmScheduleTimer = null;
let bgmPlaying = false;
let bgmNextTime = 0;

const BGM_VOLUME = 0.03;
const BGM_BPM = 120;
const BGM_BEAT = 60 / BGM_BPM; // 0.5s
const BGM_BAR = BGM_BEAT * 4;   // 2s
const BGM_LOOKAHEAD = BGM_BAR * 4 + 0.1; // schedule 4小節先まで

// C major arpeggio (C4, E4, G4, C5) + bass (C3)
// 16th notes: 各拍を4分割。1小節=16ステップ
const MELODY = [
  // C4=261.63, E4=329.63, G4=392.00, C5=523.25, E5=659.25, G5=784.00
  // 小節1
  { step: 0,  freq: 523.25, dur: 0.12 }, // C5
  { step: 2,  freq: 659.25, dur: 0.10 }, // E5
  { step: 4,  freq: 784.00, dur: 0.10 }, // G5
  { step: 6,  freq: 659.25, dur: 0.10 }, // E5
  { step: 8,  freq: 523.25, dur: 0.12 }, // C5
  { step: 10, freq: 659.25, dur: 0.10 }, // E5
  { step: 12, freq: 784.00, dur: 0.10 }, // G5
  { step: 14, freq: 880.00, dur: 0.12 }, // A5
  // 小節2
  { step: 16, freq: 784.00, dur: 0.12 }, // G5
  { step: 18, freq: 659.25, dur: 0.10 }, // E5
  { step: 20, freq: 523.25, dur: 0.10 }, // C5
  { step: 22, freq: 392.00, dur: 0.10 }, // G4
  { step: 24, freq: 523.25, dur: 0.12 }, // C5
  { step: 26, freq: 659.25, dur: 0.10 }, // E5
  { step: 28, freq: 523.25, dur: 0.10 }, // C5
  { step: 30, freq: 392.00, dur: 0.12 }, // G4
  // 小節3 (E minor feel)
  { step: 32, freq: 659.25, dur: 0.12 }, // E5
  { step: 34, freq: 784.00, dur: 0.10 }, // G5
  { step: 36, freq: 987.77, dur: 0.10 }, // B5
  { step: 38, freq: 784.00, dur: 0.10 }, // G5
  { step: 40, freq: 659.25, dur: 0.12 }, // E5
  { step: 42, freq: 523.25, dur: 0.10 }, // C5
  { step: 44, freq: 392.00, dur: 0.10 }, // G4
  { step: 46, freq: 523.25, dur: 0.12 }, // C5
  // 小節4 (G dominant → resolve)
  { step: 48, freq: 784.00, dur: 0.12 }, // G5
  { step: 50, freq: 987.77, dur: 0.10 }, // B5
  { step: 52, freq: 1046.5, dur: 0.10 }, // C6
  { step: 54, freq: 987.77, dur: 0.10 }, // B5
  { step: 56, freq: 880.00, dur: 0.12 }, // A5
  { step: 58, freq: 784.00, dur: 0.10 }, // G5
  { step: 60, freq: 659.25, dur: 0.10 }, // E5
  { step: 62, freq: 523.25, dur: 0.15 }, // C5 resolve
];

const BASS = [
  // 各小節の1拍目と3拍目にベース音
  { step: 0,  freq: 130.81, dur: 0.3 }, // C3
  { step: 8,  freq: 130.81, dur: 0.3 }, // C3
  { step: 16, freq: 98.00,  dur: 0.3 }, // G2
  { step: 24, freq: 98.00,  dur: 0.3 }, // G2
  { step: 32, freq: 164.81, dur: 0.3 }, // E3
  { step: 40, freq: 130.81, dur: 0.3 }, // C3
  { step: 48, freq: 196.00, dur: 0.3 }, // G3
  { step: 56, freq: 130.81, dur: 0.3 }, // C3
];

const LOOP_STEPS = 64; // 4小節 × 16ステップ
const STEP_DUR = BGM_BEAT / 4; // 16分音符 = 0.125s

function bgmGetCtx() {
  if (!bgmCtx) bgmCtx = new (window.AudioContext || window.webkitAudioContext)();
  return bgmCtx;
}

function bgmPlayNote(ctx, freq, startTime, dur, type, vol) {
  try {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(vol, startTime);
    gain.gain.exponentialRampToValueAtTime(0.001, startTime + dur);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(startTime);
    osc.stop(startTime + dur + 0.05);
    bgmNodes.push({ osc, gain });
  } catch (_) {}
}

function bgmScheduleLoop() {
  if (!bgmPlaying) return;
  try {
    const ctx = bgmGetCtx();
    const now = ctx.currentTime;
    const scheduleUntil = now + BGM_LOOKAHEAD;

    while (bgmNextTime < scheduleUntil) {
      const loopStart = bgmNextTime;

      MELODY.forEach(({ step, freq, dur }) => {
        const t = loopStart + step * STEP_DUR;
        bgmPlayNote(ctx, freq, t, dur, 'square', BGM_VOLUME);
      });

      BASS.forEach(({ step, freq, dur }) => {
        const t = loopStart + step * STEP_DUR;
        bgmPlayNote(ctx, freq, t, dur, 'triangle', BGM_VOLUME * 0.8);
      });

      bgmNextTime += LOOP_STEPS * STEP_DUR; // 次ループ開始時刻
    }

    // 古いノードを定期クリーンアップ
    bgmNodes = bgmNodes.filter(({ osc }) => {
      try { return osc.playbackState !== 'finished'; } catch (_) { return false; }
    });

    bgmScheduleTimer = setTimeout(bgmScheduleLoop, (BGM_BAR * 2) * 1000);
  } catch (_) {}
}

export function startBGM() {
  if (bgmPlaying) return;
  try {
    const ctx = bgmGetCtx();
    if (ctx.state === 'suspended') ctx.resume();
    bgmPlaying = true;
    bgmNextTime = ctx.currentTime + 0.05;
    bgmScheduleLoop();
  } catch (_) {}
}

export function stopBGM() {
  bgmPlaying = false;
  if (bgmScheduleTimer !== null) {
    clearTimeout(bgmScheduleTimer);
    bgmScheduleTimer = null;
  }
  bgmNodes.forEach(({ osc, gain }) => {
    try {
      const ctx = bgmGetCtx();
      gain.gain.cancelScheduledValues(ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.15);
      osc.stop(ctx.currentTime + 0.15);
    } catch (_) {}
  });
  bgmNodes = [];
}

export function isBGMPlaying() {
  return bgmPlaying;
}
