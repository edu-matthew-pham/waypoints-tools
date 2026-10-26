// Audio mode helpers for the Pattern Trainer.
// Sound -> numbers: MediaPipe AudioClassifier + models/yamnet.tflite gives YAMNet's 521 sound
// scores for each 0.975-second window. Recipe "mediapipe-yamnet-windows-v1" (same in Python):
//   * mono float samples at the ORIGINAL sample rate (never resampled by the browser)
//   * keep only full windows: floor(len * 16000 / rate / 15600) of them (all, if that is 0)
//   * training: each kept window is one example
//   * prediction for a longer clip: average the class percentages over its kept windows

export const CLIP_SECONDS = 0.975;
export const clipLength = (rate) => Math.ceil(CLIP_SECONDS * rate);

export async function loadAudioClassifier(baseUrl, modelUrl) {
  const { FilesetResolver, AudioClassifier } = await import("./vendor/mediapipe-audio/audio_bundle.mjs");
  const files = await FilesetResolver.forAudioTasks(new URL("vendor/mediapipe-audio/wasm", baseUrl).href);
  return AudioClassifier.createFromOptions(files, {
    baseOptions: { modelAssetPath: modelUrl, delegate: "CPU" },
    maxResults: -1,
  });
}

// Samples -> [{ vec: Float32Array(521), top: "Speech" }] for each kept window.
export function soundWindows(classifier, samples, rate) {
  const results = classifier.classify(samples, rate);
  const full = Math.floor((samples.length * 16000) / rate / 15600);
  const kept = full >= 1 ? results.slice(0, full) : results;
  return kept.map((r) => {
    const vec = new Float32Array(521);
    let top = null;
    for (const c of r.classifications[0].categories) {
      vec[c.index] = c.score;
      if (!top || c.score > top.score) top = c;
    }
    return { vec, top: top ? top.categoryName || top.displayName : "" };
  });
}

// WAV file -> mono Float32 samples at the file's own rate (no browser resampling).
// PCM 8/16/24/32-bit and 32/64-bit float. Channels are averaged.
export function parseWav(buffer) {
  const v = new DataView(buffer);
  const tag = (p) => String.fromCharCode(v.getUint8(p), v.getUint8(p + 1), v.getUint8(p + 2), v.getUint8(p + 3));
  if (buffer.byteLength < 12 || tag(0) !== "RIFF" || tag(8) !== "WAVE") throw new Error("not a WAV file");
  let p = 12, fmt = null, data = null;
  while (p + 8 <= buffer.byteLength) {
    const id = tag(p), size = v.getUint32(p + 4, true);
    if (id === "fmt ") {
      let format = v.getUint16(p + 8, true);
      if (format === 0xfffe && size >= 26) format = v.getUint16(p + 32, true);   // WAVE_FORMAT_EXTENSIBLE
      fmt = { format, channels: v.getUint16(p + 10, true), rate: v.getUint32(p + 12, true), bits: v.getUint16(p + 22, true) };
    } else if (id === "data") {
      data = { start: p + 8, size: Math.min(size, buffer.byteLength - p - 8) };
    }
    p += 8 + size + (size % 2);
  }
  if (!fmt || !data) throw new Error("WAV file is missing its format or data");
  const { format, channels, rate, bits } = fmt;
  const bytes = bits / 8;
  const frames = Math.floor(data.size / (bytes * channels));
  const read = format === 3
    ? (q) => (bits === 64 ? v.getFloat64(q, true) : v.getFloat32(q, true))
    : bits === 8 ? (q) => (v.getUint8(q) - 128) / 128
    : bits === 16 ? (q) => v.getInt16(q, true) / 32768
    : bits === 24 ? (q) => ((v.getUint8(q) | (v.getUint8(q + 1) << 8) | (v.getInt8(q + 2) << 16))) / 8388608
    : bits === 32 ? (q) => v.getInt32(q, true) / 2147483648
    : null;
  if (!read || (format !== 1 && format !== 3)) throw new Error("unsupported WAV encoding");
  const out = new Float32Array(frames);
  for (let i = 0; i < frames; i++) {
    let sum = 0;
    for (let c = 0; c < channels; c++) sum += read(data.start + (i * channels + c) * bytes);
    out[i] = sum / channels;
  }
  return { samples: out, rate };
}

// Start index of the loudest stretch of `n` samples (used by "Record one").
export function loudestStart(x, n) {
  if (x.length <= n) return 0;
  let energy = 0;
  for (let i = 0; i < n; i++) energy += x[i] * x[i];
  let best = energy, bestAt = 0;
  for (let i = n; i < x.length; i++) {
    energy += x[i] * x[i] - x[i - n] * x[i - n];
    if (energy > best) { best = energy; bestAt = i - n + 1; }
  }
  return bestAt;
}

export function drawWave(g, x, w, h, colour) {
  g.strokeStyle = colour;
  g.lineWidth = Math.max(1, w / 200);
  g.beginPath();
  const step = x.length / w;
  for (let px = 0; px < w; px++) {
    let lo = 0, hi = 0;
    const a = Math.floor(px * step), b = Math.max(a + 1, Math.floor((px + 1) * step));
    for (let i = a; i < b && i < x.length; i++) { if (x[i] < lo) lo = x[i]; if (x[i] > hi) hi = x[i]; }
    g.moveTo(px + 0.5, h / 2 - hi * h * 0.48);
    g.lineTo(px + 0.5, h / 2 - lo * h * 0.48 + 1);
  }
  g.stroke();
}

// Thumbnail: just the shape of the sound (the sound itself isn't kept).
export function waveThumb(x) {
  const c = document.createElement("canvas");
  c.width = 64; c.height = 64;
  const g = c.getContext("2d");
  g.fillStyle = "#1c2430"; g.fillRect(0, 0, 64, 64);
  drawWave(g, x, 64, 64, "#7fb0ff");
  return c.toDataURL("image/png");
}

// Microphone: raw samples at the mic's own rate, kept in a short rolling buffer.
export class Mic {
  constructor(seconds = 3) { this.seconds = seconds; this.listeners = new Set(); }

  async start() {
    this.stream = await navigator.mediaDevices.getUserMedia({
      // Browser "voice call" processing changes the sound and would differ from what the
      // Python starter hears, so it's switched off.
      audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false, channelCount: 1 },
      video: false,
    });
    this.ctx = new AudioContext();
    await this.ctx.audioWorklet.addModule(new URL("audio-worklet.js", location.href).href);
    this.rate = this.ctx.sampleRate;
    this.buf = new Float32Array(Math.ceil(this.seconds * this.rate));
    this.filled = 0;
    const src = this.ctx.createMediaStreamSource(this.stream);
    this.node = new AudioWorkletNode(this.ctx, "capture");
    const mute = this.ctx.createGain();
    mute.gain.value = 0;                     // keep the graph running without playing anything
    src.connect(this.node).connect(mute).connect(this.ctx.destination);
    this.node.port.onmessage = (e) => this.push(e.data);
    if (this.ctx.state === "suspended") await this.ctx.resume();
  }

  push(chunk) {
    const b = this.buf, n = chunk.length;
    if (n >= b.length) { b.set(chunk.subarray(n - b.length)); }
    else { b.copyWithin(0, n); b.set(chunk, b.length - n); }
    this.filled = Math.min(b.length, this.filled + n);
    for (const fn of this.listeners) fn(chunk);
  }

  // The most recent n samples (copy), or null if not enough yet.
  latest(n) {
    if (this.filled < n) return null;
    return this.buf.slice(this.buf.length - n);
  }

  // Collect everything heard for `ms` milliseconds.
  record(ms) {
    return new Promise((resolve) => {
      const parts = [];
      const fn = (c) => parts.push(c.slice());
      this.listeners.add(fn);
      setTimeout(() => {
        this.listeners.delete(fn);
        const out = new Float32Array(parts.reduce((s, p) => s + p.length, 0));
        let o = 0;
        for (const p of parts) { out.set(p, o); o += p.length; }
        resolve(out);
      }, ms);
    });
  }

  stop() {
    this.listeners.clear();
    this.stream?.getTracks().forEach((t) => t.stop());
    this.ctx?.close();
    this.stream = null; this.ctx = null;
  }
}
