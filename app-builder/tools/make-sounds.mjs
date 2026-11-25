// Makes App Builder's own built-in sounds (released CC0 with the tool) as small mono MP3s in sounds/.
// Everything is synthesised here from sine, triangle and noise, so there is no licence to check and nothing to download.
//   node tools/make-sounds.mjs        (needs ffmpeg)
// The list of built-in sounds (names, titles, credit) is BUILTIN_SOUNDS in src/core/assets.js: keep the two in step.
import { writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'sounds');
const RATE = 22050;

// a seeded random, so the noise (and so the files) are the same every time
let seed = 7;
const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648) * 2 - 1;

const NOTE = (n) => 440 * 2 ** ((n - 69) / 12); // MIDI note number to Hz
const track = (seconds) => new Float32Array(Math.round(seconds * RATE));

// add a tone: wave 'sine' | 'tri' | 'bell'; env: attack and release in seconds
function tone(buf, at, dur, freq, { vol = 0.3, wave = 'sine', attack = 0.01, release = 0.2, vibrato = 0 } = {}) {
  const start = Math.round(at * RATE), len = Math.round((dur + release) * RATE);
  let ph = 0;
  for (let i = 0; i < len && start + i < buf.length; i++) {
    const t = i / RATE;
    const f = freq * (1 + vibrato * Math.sin(2 * Math.PI * 5 * t));
    ph += (2 * Math.PI * f) / RATE;
    let s;
    if (wave === 'tri') s = (2 / Math.PI) * Math.asin(Math.sin(ph));
    else if (wave === 'bell') s = Math.sin(ph) + 0.4 * Math.sin(ph * 2.76) * Math.exp(-t * 6) + 0.2 * Math.sin(ph * 5.4) * Math.exp(-t * 10);
    else s = Math.sin(ph);
    const env = t < attack ? t / attack : t < dur ? 1 : Math.max(0, 1 - (t - dur) / release);
    buf[start + i] += s * env * vol;
  }
}
const bell = (buf, at, n, vol = 0.25, len = 1.2) => tone(buf, at, 0.02, NOTE(n), { vol, wave: 'bell', attack: 0.004, release: len });
function kick(buf, at, vol = 0.6) {
  const s = Math.round(at * RATE); let ph = 0;
  for (let i = 0; i < 0.25 * RATE && s + i < buf.length; i++) { const t = i / RATE; ph += (2 * Math.PI * (45 + 110 * Math.exp(-t * 30))) / RATE; buf[s + i] += Math.sin(ph) * Math.exp(-t * 14) * vol; }
}
function noise(buf, at, len, vol, decay) {
  const s = Math.round(at * RATE); let prev = 0;
  for (let i = 0; i < len * RATE && s + i < buf.length; i++) { const t = i / RATE; const x = rnd(); const hp = x - prev; prev = x; buf[s + i] += hp * Math.exp(-t * decay) * vol; }
}
const snare = (buf, at, vol = 0.25) => { noise(buf, at, 0.2, vol, 18); tone(buf, at, 0.02, 190, { vol: vol * 0.6, release: 0.08 }); };
const hat = (buf, at, vol = 0.08) => noise(buf, at, 0.06, vol, 60);

// chords as MIDI notes
const C = [60, 64, 67], Am = [57, 60, 64], F = [53, 57, 60], G = [55, 59, 62], Dm = [50, 53, 57], Em = [52, 55, 59];

const SOUNDS = {
  chime(b = track(1.8)) { bell(b, 0, 84, 0.3, 1.5); bell(b, 0.12, 91, 0.2, 1.4); return b; },
  pop(b = track(0.35)) {
    const s = 0; let ph = 0;
    for (let i = 0; i < 0.12 * RATE; i++) { const t = i / RATE; ph += (2 * Math.PI * (300 + 900 * t / 0.12)) / RATE; b[s + i] += Math.sin(ph) * Math.exp(-t * 35) * 0.6; }
    return b;
  },
  win(b = track(2.4)) { [72, 76, 79, 84].forEach((n, i) => tone(b, i * 0.12, 0.1, NOTE(n), { vol: 0.22, wave: 'tri', release: 0.1 })); for (const n of [72, 76, 79, 84]) tone(b, 0.5, 0.9, NOTE(n), { vol: 0.12, wave: 'tri', release: 0.6 }); bell(b, 0.5, 96, 0.12, 1.2); return b; },
  oops(b = track(1.4)) { [67, 63, 60].forEach((n, i) => tone(b, i * 0.22, 0.18, NOTE(n), { vol: 0.25, wave: 'tri', release: 0.15, vibrato: i === 2 ? 0.02 : 0 })); return b; },
  beat(b = track(19.2)) { // 100 bpm, 8 bars of 4
    const beat = 0.6;
    for (let bar = 0; bar < 8; bar++) for (let q = 0; q < 4; q++) {
      const t = (bar * 4 + q) * beat;
      if (q === 0 || q === 2 || (q === 3 && bar % 2)) kick(b, q === 3 ? t + beat / 2 : t);
      if (q === 1 || q === 3) snare(b, t);
      hat(b, t); hat(b, t + beat / 2, 0.05);
    }
    return b;
  },
  calm(b = track(32)) { // slow pad and an arpeggio, C Am F G twice
    const bar = 4, prog = [C, Am, F, G, C, Am, F, G];
    prog.forEach((ch, i) => {
      for (const n of ch) tone(b, i * bar, bar - 0.2, NOTE(n), { vol: 0.07, attack: 0.8, release: 1.2 });
      tone(b, i * bar, bar - 0.2, NOTE(ch[0] - 12), { vol: 0.1, attack: 0.3, release: 1 });
      for (let k = 0; k < 8; k++) bell(b, i * bar + k * 0.5, ch[[0, 1, 2, 1, 2, 0, 1, 2][k]] + 12, 0.07, 0.9);
    });
    return b;
  },
  upbeat(b = track(32)) { // 120 bpm: drums, bass and a tune, C G Am F
    const beat = 0.5, prog = [C, G, Am, F];
    const tune = [76, 79, 81, 79, 76, 74, 72, 74, 74, 76, 79, 76, 74, 72, 71, 72];
    for (let bar = 0; bar < 16; bar++) {
      const ch = prog[bar % 4], t0 = bar * 4 * beat;
      for (let q = 0; q < 4; q++) {
        const t = t0 + q * beat;
        if (q % 2 === 0) kick(b, t, 0.5); else snare(b, t, 0.18);
        hat(b, t + beat / 2, 0.06);
        tone(b, t, beat * 0.8, NOTE(ch[0] - 24 + (q === 3 ? 7 : 0)), { vol: 0.22, wave: 'tri', release: 0.05 });
      }
      if (bar >= 4) for (let k = 0; k < 4; k++) tone(b, t0 + k * beat, beat * 0.85, NOTE(tune[((bar - 4) * 4 + k) % tune.length]), { vol: 0.12, wave: 'tri', release: 0.08, vibrato: 0.004 });
      for (const n of ch) tone(b, t0, 0.1, NOTE(n), { vol: 0.05, release: 0.3 });
    }
    return b;
  },
  sleepy(b = track(30)) { // a music box: 3/4 at 72 bpm
    const beat = 60 / 72, melody = [72, 76, 79, 76, 77, 74, 72, 71, 72, 74, 76, 74, 72, 69, 71, 67, 72, 76, 79, 81, 79, 77, 76, 74, 72, 71, 72];
    const prog = [C, F, G, C, Am, Dm, G, C, C, Em];
    melody.forEach((n, i) => bell(b, i * beat, n + 12, 0.14, 1.6));
    prog.forEach((ch, i) => bell(b, i * 3 * beat, ch[0], 0.1, 2.5));
    return b;
  },
};

function wav(samples) {
  let peak = 0; for (const s of samples) peak = Math.max(peak, Math.abs(s));
  const g = peak > 0 ? 0.89 / peak : 1;
  const buf = Buffer.alloc(44 + samples.length * 2);
  buf.write('RIFF', 0); buf.writeUInt32LE(36 + samples.length * 2, 4); buf.write('WAVE', 8); buf.write('fmt ', 12);
  buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(1, 22); buf.writeUInt32LE(RATE, 24); buf.writeUInt32LE(RATE * 2, 28);
  buf.writeUInt16LE(2, 32); buf.writeUInt16LE(16, 34); buf.write('data', 36); buf.writeUInt32LE(samples.length * 2, 40);
  samples.forEach((s, i) => buf.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(s * g * 32767))), 44 + i * 2));
  return buf;
}

mkdirSync(OUT, { recursive: true });
for (const [name, make] of Object.entries(SOUNDS)) {
  const tmp = join(OUT, `${name}.wav`);
  writeFileSync(tmp, wav(make()));
  execFileSync('ffmpeg', ['-loglevel', 'error', '-y', '-i', tmp, '-ac', '1', '-ar', String(RATE), '-b:a', '48k', '-map_metadata', '-1', join(OUT, `${name}.mp3`)]);
  rmSync(tmp);
  console.log('made', name);
}
