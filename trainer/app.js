// Pattern Trainer — plain JS, no build step.
// Three modes (?mode=pose / ?mode=audio):
//   Pictures:   picture -> 1280 numbers (MediaPipe ImageEmbedder + models/mobilenet_v2_embedder.tflite)
//   Body poses: picture -> 33 body points -> 66 numbers (MediaPipe PoseLandmarker + models/pose_landmarker_lite.task)
//   Sounds:     0.975 s of sound -> 521 sound scores (MediaPipe AudioClassifier + models/yamnet.tflite; see audio.js)
// Numbers -> classes: a small TF.js model trained here, exported as JSON
// (format: see EXPORT_FORMAT.md in this folder; loader: pattern_model.py in the starters).

import { FilesetResolver, ImageEmbedder, PoseLandmarker } from "./vendor/mediapipe/vision_bundle.mjs";
import { Mic, clipLength, drawWave, loadAudioClassifier, loudestStart, loudestWindow, parseWav, soundWindows, waveThumb, windowStart } from "./audio.js";

const APP_VERSION = "pattern-trainer 0.2.0";
const MODE = { pose: "pose", audio: "audio" }[new URLSearchParams(location.search).get("mode")] || "image";
const INPUT = {
  image: { type: "image", modelFile: "mobilenet_v2_embedder.tflite", preprocess: "mediapipe-image-embedder-centre-crop-v1",
           loading: "Loading the image model…", download: "my_model.json" },
  pose: { type: "pose", modelFile: "pose_landmarker_lite.task", preprocess: "mediapipe-pose-lite-xy-centred-v1",
          loading: "Loading the pose model…", download: "my_pose_model.json" },
  audio: { type: "audio", modelFile: "yamnet.tflite", preprocess: "mediapipe-yamnet-windows-v1",
           loading: "Loading the sound model…", download: "my_audio_model.json" },
}[MODE];
const DIM = { image: 1280, pose: 66, audio: 521 }[MODE];   // numbers per example
const PROJECT_FILE = { image: "my_project.json", pose: "my_pose_project.json", audio: "my_audio_project.json" }[MODE];
// Chosen by experiment (see the design notes): pose input is only 66 numbers, so it learns
// better with a wider hidden layer and a higher learning rate; its files stay small anyway.
const DEFAULTS = {
  image: { hidden: 16, epochs: 30, lr: 0.001, batch: 16 },
  pose: { hidden: 64, epochs: 50, lr: 0.003, batch: 16 },
  audio: { hidden: 64, epochs: 50, lr: 0.01, batch: 16 },
}[MODE];
const RECORD_INTERVAL_MS = 150;   // about 6 photos a second while holding
const PREVIEW_INTERVAL_MS = 200;
const MAX_PER_CLASS = 500;
const FEW_EXAMPLES = 10;

const $ = (sel, root = document) => root.querySelector(sel);
const el = {
  loading: $("#loading"), classes: $("#classes"), addClass: $("#add-class"), tpl: $("#class-tpl"),
  video: $("#video"), cameraBtn: $("#camera-btn"), cameraMsg: $("#camera-msg"),
  trainBtn: $("#train-btn"), progress: $("#train-progress"), trainMsg: $("#train-msg"),
  settings: $("#settings"), testFile: $("#test-file"), testImg: $("#test-img"), bars: $("#bars"),
  exportBtn: $("#export-btn"), exportMsg: $("#export-msg"),
  saveBtn: $("#save-project"), openFile: $("#open-project"), projectMsg: $("#project-msg"),
};

const state = {
  embedder: null,
  classes: [],          // { id, name, examples: [Float32Array], thumbs: [dataURL], card }
  nextId: 1,
  model: null,
  modelClasses: [],     // class names the current model was trained on
  dataVersion: 0,       // bumps whenever examples or names change
  trainedVersion: -1,
  training: false,
  stream: null,
  previewTimer: null,
  testing: false,       // a test photo/sound is showing instead of the live camera/mic
  mic: null,            // audio mode: Mic from audio.js
  lastPrediction: null,
  savedVersion: 0,      // dataVersion when last saved or opened (no "leave page?" warning if unchanged)
};

// ---------------------------------------------------------------- pictures -> numbers

// Centre square of the source at its own resolution (no resizing here), on a white
// background so see-through PNG pixels count as white (Python does the same).
// MediaPipe then resizes it to 224x224 the same way as in Python.
const MAX_SQUARE = 4096;  // bigger canvases fail silently on some tablets
class TooBigError extends Error {}

function centreSquare(source) {
  const w = source.videoWidth || source.naturalWidth || source.width;
  const h = source.videoHeight || source.naturalHeight || source.height;
  const s = Math.min(w, h);
  if (s > MAX_SQUARE) throw new TooBigError();
  const c = document.createElement("canvas");
  c.width = s; c.height = s;
  const g = c.getContext("2d");
  g.fillStyle = "#ffffff";
  g.fillRect(0, 0, s, s);
  g.drawImage(source, Math.floor((w - s) / 2), Math.floor((h - s) / 2), s, s, 0, 0, s, s);
  return c;
}

// Pose: 33 body points -> 66 numbers. Centre on the middle of the hips and divide by the
// torso length (mid-shoulders to mid-hips), so where you stand and how far from the camera
// you are matter much less than the pose itself. Python does exactly the same.
function poseVector(p) {
  const hx = (p[23].x + p[24].x) / 2, hy = (p[23].y + p[24].y) / 2;
  const sx = (p[11].x + p[12].x) / 2, sy = (p[11].y + p[12].y) / 2;
  let scale = Math.hypot(sx - hx, sy - hy);
  if (!(scale > 1e-6)) scale = 1;
  const v = new Float32Array(66);
  p.forEach((pt, i) => { v[2 * i] = (pt.x - hx) / scale; v[2 * i + 1] = (pt.y - hy) / scale; });
  return v;
}

// Picture square -> { vec, points } (points only in pose mode), or null if no person found.
function features(square) {
  if (MODE === "pose") {
    const result = state.embedder.detect(square);
    const points = result.landmarks?.[0];
    return points ? { vec: poseVector(points), points } : null;
  }
  const result = state.embedder.embed(square);
  return { vec: Float32Array.from(result.embeddings[0].floatEmbedding), points: null };
}

function drawSkeleton(g, points, size, dark) {
  g.lineWidth = Math.max(2, size / 60);
  g.strokeStyle = dark ? "#7fb0ff" : "#2f6fdd";
  g.fillStyle = dark ? "#ffffff" : "#d64545";
  for (const { start, end } of PoseLandmarker.POSE_CONNECTIONS) {
    g.beginPath();
    g.moveTo(points[start].x * size, points[start].y * size);
    g.lineTo(points[end].x * size, points[end].y * size);
    g.stroke();
  }
  for (const pt of points) {
    g.beginPath();
    g.arc(pt.x * size, pt.y * size, Math.max(1.5, size / 90), 0, 2 * Math.PI);
    g.fill();
  }
}

// Thumbnail: a small photo, or in pose mode just the stick figure (only the points are kept).
function thumbnail(square, points) {
  const c = document.createElement("canvas");
  c.width = 64; c.height = 64;
  const g = c.getContext("2d");
  if (points) {
    g.fillStyle = "#1c2430"; g.fillRect(0, 0, 64, 64);
    drawSkeleton(g, points, 64, true);
  } else {
    g.drawImage(square, 0, 0, 64, 64);
  }
  return c.toDataURL("image/jpeg", 0.7);
}

async function loadImageFile(file) {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    return img;
  } finally {
    URL.revokeObjectURL(url);
  }
}

// ---------------------------------------------------------------- classes

function addClass(name) {
  const id = state.nextId++;
  const card = el.tpl.content.firstElementChild.cloneNode(true);
  const cls = { id, name: name || `Class ${id}`, examples: [], thumbs: [], tips: [], card };
  state.classes.push(cls);

  const nameInput = $(".class-name", card);
  nameInput.value = cls.name;
  nameInput.addEventListener("input", () => { cls.name = nameInput.value; changed(); });

  const removeBtn = $(".remove-class", card);
  removeBtn.addEventListener("click", () => {
    if (cls.examples.length && !armConfirm(removeBtn, "Delete?", "✕")) return;
    cls.stopRecording?.();
    state.classes = state.classes.filter((c) => c !== cls);
    card.remove();
    changed();
  });
  const clearBtn = $(".clear", card);
  clearBtn.addEventListener("click", () => {
    if (!armConfirm(clearBtn, "Clear all?", "Clear")) return;
    cls.examples = []; cls.thumbs = []; cls.tips = [];
    changed();
  });

  const upload = $(".upload", card);
  if (MODE === "audio") {
    upload.accept = ".wav,audio/wav,audio/x-wav";
    $(".upload-label", card).textContent = "Upload sounds (.wav)";
    $(".record-one", card).hidden = false;
    setUpRecordOne(cls, $(".record-one", card));
  }
  upload.addEventListener("change", async () => {
    const files = [...upload.files];
    upload.value = "";
    await addFiles(cls, files);
  });
  card.addEventListener("dragover", (e) => { e.preventDefault(); card.classList.add("dragover"); });
  card.addEventListener("dragleave", () => card.classList.remove("dragover"));
  card.addEventListener("drop", async (e) => {
    e.preventDefault(); e.stopPropagation(); card.classList.remove("dragover");
    const files = [...e.dataTransfer.files].filter((f) => MODE === "audio"
      ? /\.wav$/i.test(f.name) || f.type.startsWith("audio/") : f.type.startsWith("image/"));
    if (!files.length) { cardMsg(cls, MODE === "audio" ? "Only .wav sound files can be added." : "Only picture files can be added.", "warn"); return; }
    await addFiles(cls, files);
  });

  setUpRecordButton(cls, $(".record", card));
  el.classes.appendChild(card);
  changed();
  return cls;
}

// A plain inline "click again to confirm" instead of window.confirm (which blocks the page).
function armConfirm(btn, askText, normalText) {
  if (btn.dataset.armed) return true;
  const label = btn.getAttribute("aria-label");
  btn.dataset.armed = "1";
  btn.textContent = askText;
  if (label) btn.setAttribute("aria-label", `${label}: click again to confirm`);
  setTimeout(() => {
    delete btn.dataset.armed;
    btn.textContent = normalText;
    if (label) btn.setAttribute("aria-label", label);
  }, 3000);
  return false;
}

// Returns "added", "full" or "noperson" (pose mode, nobody found in the picture).
// live = true when the square comes from the camera: pose mode then redraws the skeleton.
function addExample(cls, square, live = false) {
  if (cls.examples.length >= MAX_PER_CLASS) {
    cardMsg(cls, `That's the limit of ${MAX_PER_CLASS} examples for one class.`, "warn");
    return "full";
  }
  const f = features(square);
  if (live && MODE === "pose") drawOverlay(f?.points);
  if (!f) return "noperson";
  cls.examples.push(f.vec);
  cls.thumbs.push(thumbnail(square, f.points));
  return "added";
}

// Audio: add sound windows (from soundWindows) as examples. `clip` gives the thumbnail shape.
function addSoundWindows(cls, wins, clip, rate) {
  let added = 0, heard = "";
  for (const [k, w] of wins.entries()) {
    if (cls.examples.length >= MAX_PER_CLASS) {
      cardMsg(cls, `That's the limit of ${MAX_PER_CLASS} examples for one class.`, "warn");
      return { added, full: true, heard };
    }
    cls.examples.push(w.vec);
    cls.thumbs.push(waveThumb(clip.subarray(windowStart(k, rate), windowStart(k + 1, rate))));
    cls.tips.push(w.top ? `The sound model heard: ${w.top}` : "");
    heard = w.top || heard;
    added++;
  }
  return { added, full: false, heard };
}

const MAX_WINDOWS_PER_FILE = 120;   // first 2 minutes of a long file (keeps the page responsive)
const MAX_TEST_SECONDS = 30;

async function addSoundFiles(cls, files) {
  let added = 0, used = 0, failed = 0, trimmed = 0;
  for (const [i, file] of files.entries()) {
    if (!state.classes.includes(cls)) return;
    cardMsg(cls, `Adding sound ${i + 1} of ${files.length}…`);
    try {
      const { samples, rate } = parseWav(await file.arrayBuffer());
      if (!samples.length) throw new Error("empty");
      const room = Math.min(MAX_PER_CLASS - cls.examples.length, MAX_WINDOWS_PER_FILE);
      if (room <= 0) { cardMsg(cls, `That's the limit of ${MAX_PER_CLASS} examples for one class.`, "warn"); return; }
      const keep = Math.ceil(room * 0.975 * rate);
      if (samples.length > keep) trimmed++;
      const part = samples.subarray(0, keep);
      const r = addSoundWindows(cls, soundWindows(state.embedder, part, rate), part, rate);
      added += r.added; used++;
      if (r.full) break;
    } catch {
      failed++;
    }
    renderClass(cls);
    await new Promise((r) => setTimeout(r));
  }
  changed();
  const bad = failed ? `${failed} file(s) couldn't be read: only .wav files work here (or record sounds on this page).` : "";
  const long = trimmed ? ` Only the first ${MAX_WINDOWS_PER_FILE / 60 | 0} minutes of long files are used.` : "";
  cardMsg(cls, used ? `Added ${added} one-second example(s) from ${used} file(s).${long} ${bad}`.trim() : bad, failed ? "warn" : "ok");
}

// Audio: "Record one" listens for 2 seconds and keeps the loudest 0.975 s as one example.
function setUpRecordOne(cls, btn) {
  btn.addEventListener("click", async () => {
    if (!state.mic || btn.classList.contains("active")) return;
    if (cls.examples.length >= MAX_PER_CLASS) { cardMsg(cls, `That's the limit of ${MAX_PER_CLASS} examples for one class.`, "warn"); return; }
    btn.classList.add("active");
    cardMsg(cls, "Listening for 2 seconds… make the sound now.");
    let left = 2;
    btn.textContent = `Listening… ${left}`;
    const tick = setInterval(() => { left--; if (left > 0) btn.textContent = `Listening… ${left}`; }, 1000);
    const heard = await state.mic.record(2000);
    clearInterval(tick);
    btn.classList.remove("active"); btn.textContent = "Record one";
    if (!state.mic || !state.classes.includes(cls)) return;
    const rate = state.mic.rate, n = clipLength(rate);
    if (heard.length < n) { cardMsg(cls, "Didn't catch enough sound. Try again.", "warn"); return; }
    const s0 = loudestStart(heard, n);
    const clip = heard.slice(s0, s0 + n);
    const r = addSoundWindows(cls, soundWindows(state.embedder, clip, rate).slice(0, 1), clip, rate);
    if (r.added) cardMsg(cls, `Added 1 example${r.heard ? ` (the sound model heard: ${r.heard})` : ""}.`, "ok");
    changed();
  });
}

async function addFiles(cls, files) {
  if (!files.length) return;
  if (MODE === "audio") {
    if (!state.embedder) { cardMsg(cls, "Still loading the model. Try again in a moment.", "warn"); return; }
    return addSoundFiles(cls, files);
  }
  if (!state.embedder) { cardMsg(cls, "Still loading the model. Try again in a moment.", "warn"); return; }
  let added = 0, failed = 0, tooBig = 0, noPerson = 0;
  for (const [i, file] of files.entries()) {
    if (!state.classes.includes(cls)) return;   // class deleted while adding
    cardMsg(cls, `Adding photo ${i + 1} of ${files.length}…`);
    try {
      const img = await loadImageFile(file);
      const r = addExample(cls, centreSquare(img));
      if (r === "full") break;
      if (r === "noperson") noPerson++; else added++;
    } catch (err) {
      if (err instanceof TooBigError) tooBig++; else failed++;
    }
    if (i % 5 === 4) { renderClass(cls); await new Promise((r) => setTimeout(r)); }
  }
  changed();
  const notes = [];
  if (failed) notes.push(`${failed} file(s) couldn't be read as pictures.`);
  if (noPerson) notes.push(`No person found in ${noPerson} photo(s), so they were skipped.`);
  if (tooBig) notes.push(`${tooBig} photo(s) were too big; use a smaller copy (under ${MAX_SQUARE} pixels on the short side).`);
  cardMsg(cls, `Added ${added} photo(s).${notes.length ? " " + notes.join(" ") : ""}`, notes.length ? "warn" : "ok");
}

function setUpRecordButton(cls, btn) {
  let timer = null, missed = 0;
  let listener = null, soundAdded = 0, lastHeard = "";
  const startSound = () => {
    // Chop what's heard into back-to-back 0.975 s clips; each clip is one example.
    const rate = state.mic.rate, n = clipLength(rate);
    let pending = new Float32Array(0);
    soundAdded = 0;
    listener = (chunk) => {
      const joined = new Float32Array(pending.length + chunk.length);
      joined.set(pending); joined.set(chunk, pending.length);
      pending = joined;
      while (pending.length >= n) {
        const clip = pending.slice(0, n);
        pending = pending.slice(n);
        const r = addSoundWindows(cls, soundWindows(state.embedder, clip, rate).slice(0, 1), clip, rate);
        soundAdded += r.added;
        if (r.heard) lastHeard = r.heard;
        renderClass(cls);
        if (r.full) { stop(); return; }
      }
    };
    state.mic.listeners.add(listener);
  };
  const start = (e) => {
    e.preventDefault();
    if (timer || btn.disabled) return;
    if (MODE === "audio") {
      if (!state.mic) return;
      btn.classList.add("active"); btn.textContent = "Recording…";
      timer = true;
      startSound();
      return;
    }
    if (!state.stream) return;
    btn.classList.add("active"); btn.textContent = "Recording…";
    missed = 0;
    const grab = () => {
      if (!state.stream) { stop(); return; }
      if (el.video.readyState < 2) return;
      const r = addExample(cls, centreSquare(el.video), true);
      if (r === "added") renderClass(cls);
      else if (r === "noperson") {
        if (missed++ === 0) cardMsg(cls, "No person in view, so nothing is being saved. Step back so your whole body is in the square.", "warn");
      } else stop();
    };
    grab();
    timer = setInterval(grab, RECORD_INTERVAL_MS);
  };
  const stop = () => {
    if (!timer) return;
    if (listener) {
      state.mic?.listeners.delete(listener); listener = null;
      if (soundAdded === 0) cardMsg(cls, "Keep holding: each example needs about 1 second. For a short sound, use Record one.", "warn");
      else cardMsg(cls, `Added ${soundAdded} example(s)${lastHeard ? ` (the sound model last heard: ${lastHeard})` : ""}.`, "ok");
    }
    if (timer !== true) clearInterval(timer);
    timer = null;
    btn.classList.remove("active"); btn.textContent = "Hold to record";
    if (missed) cardMsg(cls, `No person in view for ${missed} frame(s), so they were skipped. Step back so your whole body is in the square.`, "warn");
    changed();
  };
  cls.stopRecording = stop;
  btn.addEventListener("pointerdown", start);
  for (const ev of ["pointerup", "pointerleave", "pointercancel"]) btn.addEventListener(ev, stop);
  btn.addEventListener("contextmenu", (e) => e.preventDefault());
  btn.addEventListener("keydown", (e) => { if ((e.key === " " || e.key === "Enter") && !e.repeat) start(e); });
  btn.addEventListener("keyup", (e) => { if (e.key === " " || e.key === "Enter") stop(); });
  btn.addEventListener("blur", stop);
}

function cardMsg(cls, text, kind = "") {
  const m = $(".card-msg", cls.card);
  m.textContent = text;
  m.className = `card-msg msg ${kind}`;
}

function renderClass(cls) {
  const n = cls.examples.length;
  const label = cls.name.trim() || "this class";
  $(".count", cls.card).textContent = `${n} example${n === 1 ? "" : "s"}`;
  $(".class-name", cls.card).setAttribute("aria-label", "Class name");
  const rm = $(".remove-class", cls.card);
  if (!rm.dataset.armed) rm.setAttribute("aria-label", `Delete ${label}`);
  $(".record", cls.card).setAttribute("aria-label", `Hold to record examples of ${label}`);
  $(".upload", cls.card).setAttribute("aria-label", `Upload photos of ${label}`);
  const cl = $(".clear", cls.card);
  if (!cl.dataset.armed) cl.setAttribute("aria-label", `Clear all examples of ${label}`);
  $(".clear", cls.card).disabled = n === 0;
  const live = MODE === "audio" ? Boolean(state.mic) : Boolean(state.stream);
  $(".record", cls.card).disabled = !live || !state.embedder;
  $(".record-one", cls.card).disabled = !live || !state.embedder;
  $(".record-one", cls.card).setAttribute("aria-label", `Record one example of ${label}`);
  if (MODE === "audio") $(".upload", cls.card).setAttribute("aria-label", `Upload .wav sounds of ${label}`);
  const thumbs = $(".thumbs", cls.card);
  const first = Math.max(0, cls.thumbs.length - 24);
  const show = cls.thumbs.slice(first);
  thumbs.replaceChildren(...show.map((src, i) => Object.assign(new Image(), { src, alt: cls.tips[first + i] || "", title: cls.tips[first + i] || "" })));
  if (n > show.length) thumbs.append(Object.assign(document.createElement("span"), { className: "more", textContent: `+${n - show.length} more` }));
}

// ---------------------------------------------------------------- checks + status

function problems() {
  const names = state.classes.map((c) => c.name.trim());
  if (state.classes.length < 2) return "Add at least two classes.";
  if (names.some((n) => !n)) return "Every class needs a name.";
  const lower = names.map((n) => n.toLowerCase());
  if (new Set(lower).size !== lower.length) return "Two classes have the same name. Give each one a different name.";
  const empty = state.classes.find((c) => c.examples.length === 0);
  if (empty) return `“${empty.name}” has no examples yet.`;
  return "";
}

function changed() {
  state.dataVersion++;
  for (const c of state.classes) renderClass(c);
  refresh();
}

function refresh() {
  const issue = problems();
  const upToDate = state.model && state.trainedVersion === state.dataVersion;
  el.trainBtn.disabled = !state.embedder || state.training || Boolean(issue);
  el.exportBtn.disabled = !upToDate || state.training;
  el.saveBtn.disabled = !state.classes.some((c) => c.examples.length);
  if (state.training) return;
  if (issue) {
    setMsg(el.trainMsg, issue, state.classes.some((c) => c.examples.length) ? "warn" : "");
  } else if (!state.model) {
    const few = state.classes.filter((c) => c.examples.length < FEW_EXAMPLES);
    setMsg(el.trainMsg, few.length
      ? `Ready to train. Tip: “${few[0].name}” has fewer than ${FEW_EXAMPLES} examples; more usually works better.`
      : "Ready to train.", few.length ? "warn" : "");
  } else if (!upToDate) {
    setMsg(el.trainMsg, "Your examples have changed. Train again to update the model.", "warn");
  }
  if (!upToDate) setMsg(el.exportMsg, state.model ? "Train again before downloading." : "");
  $("#check").hidden = !upToDate;
}

function setMsg(node, text, kind = "") {
  node.textContent = text;
  node.className = `msg ${kind}`;
}

// ---------------------------------------------------------------- training

function settings() {
  const read = (id, fallback, int) => {
    const v = Number($(id).value);
    return Number.isFinite(v) && v >= 0 ? (int ? Math.round(v) : v) : fallback;
  };
  if (el.settings.hidden) return { ...DEFAULTS };
  return {
    hidden: read("#set-hidden", DEFAULTS.hidden, true),
    epochs: Math.max(1, read("#set-epochs", DEFAULTS.epochs, true)),
    lr: read("#set-lr", DEFAULTS.lr) || DEFAULTS.lr,
    batch: Math.max(1, read("#set-batch", DEFAULTS.batch, true)),
  };
}

class DivergedError extends Error {}
const CHECK_MIN = 5;          // examples per class needed before holding some back
const CHECK_SHARE = 0.2;      // hold back the newest 20% of each class

// Train one small model. Always cleans up its tensors; throws on failure.
async function fitModel(xsArr, ysArr, nClasses, cfg, onEpoch) {
  const dim = xsArr[0].length;
  const xs = tf.tensor2d(Float32Array.from(xsArr.flatMap((e) => Array.from(e))), [xsArr.length, dim]);
  const ys = tf.tidy(() => tf.oneHot(tf.tensor1d(ysArr, "int32"), nClasses));
  const optimizer = tf.train.adam(cfg.lr);
  const model = tf.sequential();
  if (cfg.hidden > 0) {
    model.add(tf.layers.dense({ inputShape: [dim], units: cfg.hidden, activation: "relu" }));
    model.add(tf.layers.dense({ units: nClasses, activation: "softmax" }));
  } else {
    model.add(tf.layers.dense({ inputShape: [dim], units: nClasses, activation: "softmax" }));
  }
  model.compile({ optimizer, loss: "categoricalCrossentropy", metrics: ["accuracy"] });
  let lastAcc = 0;
  try {
    await model.fit(xs, ys, {
      epochs: cfg.epochs, batchSize: cfg.batch, shuffle: true,
      callbacks: {
        onEpochEnd: async (epoch, logs) => {
          lastAcc = logs.acc ?? logs.accuracy ?? 0;
          onEpoch(epoch);
          await tf.nextFrame();
        },
      },
    });
  } catch (err) {
    model.dispose();
    throw err;
  } finally {
    xs.dispose(); ys.dispose(); optimizer.dispose();
  }
  if (!model.getWeights().every((w) => w.dataSync().every(Number.isFinite))) {
    model.dispose();
    throw new DivergedError();
  }
  return { model, lastAcc };
}

// Hold back the newest examples of each class (not a random pick: frames recorded
// back to back are near-duplicates, so a random pick would score unrealistically well).
function splitForCheck() {
  if (state.classes.some((c) => c.examples.length < CHECK_MIN)) return null;
  const split = { trX: [], trY: [], teX: [], teY: [] };
  state.classes.forEach((c, k) => {
    const n = c.examples.length;
    const nTest = Math.max(1, Math.round(n * CHECK_SHARE));
    c.examples.forEach((e, i) => {
      if (i < n - nTest) { split.trX.push(e); split.trY.push(k); } else { split.teX.push(e); split.teY.push(k); }
    });
  });
  return split;
}

function evaluate(model, teX, teY, nClasses) {
  const guesses = tf.tidy(() =>
    Array.from(model.predict(tf.tensor2d(Float32Array.from(teX.flatMap((e) => Array.from(e))), [teX.length, teX[0].length])).argMax(1).dataSync()));
  const matrix = Array.from({ length: nClasses }, () => new Array(nClasses).fill(0));
  guesses.forEach((g, i) => { matrix[teY[i]][g]++; });
  const correct = guesses.filter((g, i) => g === teY[i]).length;
  return { correct, total: teY.length, matrix };
}

async function train() {
  if (problems() || state.training) return;
  state.training = true;
  refresh();
  const cfg = settings();
  const names = state.classes.map((c) => c.name.trim());
  const xsArr = [], ysArr = [];
  state.classes.forEach((c, k) => c.examples.forEach((e) => { xsArr.push(e); ysArr.push(k); }));
  const version = state.dataVersion;
  const split = splitForCheck();
  const phases = split ? 2 : 1;
  let phase = 0;
  const onEpoch = (epoch) => {
    el.progress.value = (phase + (epoch + 1) / cfg.epochs) / phases;
    setMsg(el.trainMsg, split && phase === 0
      ? `Checking on held-back examples… round ${epoch + 1} of ${cfg.epochs}`
      : `Training… round ${epoch + 1} of ${cfg.epochs}`);
  };

  el.progress.hidden = false; el.progress.value = 0;
  setMsg(el.trainMsg, "Training…");
  const t0 = performance.now();
  let check = null, result;
  try {
    if (split) {
      const { model: checkModel } = await fitModel(split.trX, split.trY, names.length, cfg, onEpoch);
      check = { ...evaluate(checkModel, split.teX, split.teY, names.length), names };
      checkModel.dispose();
      phase = 1;
    }
    result = await fitModel(xsArr, ysArr, names.length, cfg, onEpoch);
  } catch (err) {
    console.error(err);
    state.training = false;
    el.progress.hidden = true;
    setMsg(el.trainMsg, err instanceof DivergedError
      ? "Training went wrong (the numbers blew up). Try again with a smaller learning rate."
      : "Training didn't work. Try again, or reload the page.", "warn");
    refresh();
    return;
  }
  if (state.model) state.model.dispose();
  state.model = result.model;
  state.modelClasses = names;
  state.trainedSettings = cfg;
  state.trainedCounts = state.classes.map((c) => c.examples.length);
  state.trainedVersion = version;
  state.check = check;
  state.training = false;
  el.progress.hidden = true;
  const secs = ((performance.now() - t0) / 1000).toFixed(1);
  setMsg(el.trainMsg, `Trained on ${xsArr.length} examples in ${secs} s. On its own training examples it scores ${Math.round(result.lastAcc * 100)}%, but that's the easy test.`, "ok");
  setMsg(el.exportMsg, "");
  renderCheck();
  refresh();
  startPreview();
}

// ---------------------------------------------------------------- accuracy check

function renderCheck() {
  const box = $("#check");
  const c = state.check;
  if (!state.model) { box.hidden = true; return; }
  box.hidden = false;
  const head = $("#check-msg"), table = $("#confusion"), mix = $("#check-mixup");
  if (!c) {
    head.textContent = `Add at least ${CHECK_MIN} examples to every class to see how it does on examples it hasn't seen.`;
    table.hidden = true; mix.textContent = "";
    $("#check-how").hidden = true;
    return;
  }
  $("#check-how").hidden = false;
  const pct = Math.round((c.correct / c.total) * 100);
  head.innerHTML = "";
  head.append(Object.assign(document.createElement("strong"), { textContent: `${c.correct} of ${c.total} right (${pct}%)` }),
              " on held-back examples it wasn't trained on.");
  const rows = c.names.map((name, r) => {
    const tr = document.createElement("tr");
    tr.append(Object.assign(document.createElement("th"), { scope: "row", textContent: name }));
    c.names.forEach((_, g) => {
      const td = document.createElement("td");
      td.textContent = c.matrix[r][g];
      // Not colour alone: a border on mix-ups, and words for screen readers.
      const note = r === g ? " right" : c.matrix[r][g] ? " mixed up" : "";
      if (note) td.append(Object.assign(document.createElement("span"), { className: "visually-hidden", textContent: note }));
      if (r === g) td.className = "hit"; else if (c.matrix[r][g]) td.className = "miss";
      tr.append(td);
    });
    return tr;
  });
  const headRow = document.createElement("tr");
  headRow.append(Object.assign(document.createElement("th"), { scope: "col", textContent: "Really \\ Guessed" }),
                 ...c.names.map((n) => Object.assign(document.createElement("th"), { scope: "col", textContent: n })));
  table.replaceChildren(
    Object.assign(document.createElement("caption"), { textContent: "Rows: what it really was. Columns: what the model guessed." }),
    document.createElement("thead"), document.createElement("tbody"));
  table.tHead.append(headRow);
  table.tBodies[0].append(...rows);
  table.hidden = false;
  let worst = null;
  c.matrix.forEach((row, r) => row.forEach((n, g) => { if (r !== g && n && (!worst || n > worst.n)) worst = { r, g, n }; }));
  mix.textContent = worst
    ? `Most common mix-up: “${c.names[worst.r]}” guessed as “${c.names[worst.g]}” (${worst.n} time${worst.n === 1 ? "" : "s"}). More varied examples of both usually help.`
    : "No mix-ups on these examples.";
  if (c.total < 10) mix.textContent += ` Only ${c.total} examples were checked, so treat this score as a rough guide.`;
}

// ---------------------------------------------------------------- testing

function predictVec(vec) {
  return tf.tidy(() => Array.from(state.model.predict(tf.tensor2d(vec, [1, vec.length])).dataSync()));
}

function showNoPerson(text) {
  state.lastPrediction = null;
  el.bars.dataset.names = "";
  el.bars.textContent = text;
  if (lastAnnounced !== "none") $("#bars-status").textContent = text;
  lastAnnounced = "none";
}

// Pose mode: draw the detected body points over the camera view (mirrored like the video).
function drawOverlay(points) {
  const c = $("#overlay");
  if (!c) return;
  const g = c.getContext("2d");
  g.clearRect(0, 0, c.width, c.height);
  if (points) drawSkeleton(g, points, c.width, false);
}

// Screen readers: announce test-photo results and changes of top class, not every live frame.
let lastAnnounced = "";
function announce(probs, always) {
  const best = probs.indexOf(Math.max(...probs));
  const text = `${state.modelClasses[best]}, ${Math.round(probs[best] * 100)} percent`;
  const key = state.modelClasses[best];
  if (always || key !== lastAnnounced) $("#bars-status").textContent = text;
  lastAnnounced = key;
}

function showBars(probs, always = false) {
  state.lastPrediction = Object.fromEntries(state.modelClasses.map((n, i) => [n, probs[i]]));
  announce(probs, always);
  const best = probs.indexOf(Math.max(...probs));
  const key = state.modelClasses.join("\n");
  if (el.bars.dataset.names !== key) {
    el.bars.dataset.names = key;
    el.bars.replaceChildren(...state.modelClasses.map((name) => {
      const row = document.createElement("div");
      row.className = "bar-row";
      row.innerHTML = `<span class="name"></span><span class="bar-track"><span class="bar-fill"></span></span><span class="pct"></span>`;
      $(".name", row).textContent = name;
      return row;
    }));
  }
  [...el.bars.children].forEach((row, i) => {
    row.classList.toggle("best", i === best);
    $(".bar-fill", row).style.width = `${(probs[i] * 100).toFixed(1)}%`;
    $(".pct", row).textContent = `${Math.round(probs[i] * 100)}%`;
  });
}

// Audio: score the loudest window of a clip (same rule as Python), so a short sound
// isn't outvoted by the silence around it.
function predictSound(wins, samples, rate) {
  return predictVec(wins[loudestWindow(wins.length, samples, rate)].vec);
}

function audioPreviewTick() {
  if (!state.mic || !state.model || state.training || state.testing) return;
  if (document.querySelector(".record.active, .record-one.active")) return;
  const rate = state.mic.rate, clip = state.mic.latest(clipLength(rate));
  if (!clip) return;
  showBars(predictSound(soundWindows(state.embedder, clip, rate).slice(0, 1), clip, rate));
}

// Audio: draw the last 1.5 s of sound while the microphone is on.
function drawMicLoop() {
  const c = $("#wave"), g = c.getContext("2d");
  const frame = () => {
    g.fillStyle = "#000"; g.fillRect(0, 0, c.width, c.height);
    if (!state.mic) return;
    const n = Math.min(state.mic.filled, Math.floor(state.mic.rate * 1.5));
    const x = n > 0 ? state.mic.latest(n) : null;
    if (x) drawWave(g, x, c.width, c.height, "#7fb0ff");
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}

function startPreview() {
  clearInterval(state.previewTimer);
  state.previewTimer = setInterval(() => {
    if (MODE === "audio") { try { audioPreviewTick(); } catch (err) { console.warn(err); } return; }
    if (!state.embedder || !state.stream || el.video.readyState < 2) return;
    if (state.training) return;                       // leave the CPU to training
    if (document.querySelector(".record.active")) return;   // recording draws its own overlay
    if (!state.model && MODE !== "pose") return;      // image mode: nothing to show until trained
    try {
      const f = features(centreSquare(el.video));
      if (MODE === "pose") drawOverlay(f?.points);
      if (!state.model || state.testing) return;
      if (f) showBars(predictVec(f.vec));
      else showNoPerson("No person in view. Step back so your whole body is in the square.");
    } catch (err) { console.warn(err); }
  }, PREVIEW_INTERVAL_MS);
}

el.testFile.addEventListener("change", async () => {
  const file = el.testFile.files[0];
  el.testFile.value = "";
  if (!file) return;
  const fail = (text) => { el.bars.dataset.names = ""; el.bars.textContent = text; };
  if (!state.model) { fail("Train a model first."); return; }
  if (MODE === "audio") {
    try {
      const parsed = parseWav(await file.arrayBuffer());
      const rate = parsed.rate;
      const samples = parsed.samples.subarray(0, Math.ceil(MAX_TEST_SECONDS * rate));
      const wins = soundWindows(state.embedder, samples, rate);
      if (!wins.length) throw new Error("no sound");
      const shown = document.createElement("canvas");
      shown.width = 320; shown.height = 90;
      const g = shown.getContext("2d");
      g.fillStyle = "#1c2430"; g.fillRect(0, 0, 320, 90);
      drawWave(g, samples, 320, 90, "#7fb0ff");
      el.testImg.src = shown.toDataURL("image/png");
      el.testImg.hidden = false;
      state.testing = true;
      $("#back-to-camera").hidden = !state.mic;
      showBars(predictSound(wins, samples, rate), true);
      if (parsed.samples.length > samples.length) $("#bars-status").textContent += ` (first ${MAX_TEST_SECONDS} seconds only)`;
    } catch {
      fail("That file couldn't be read. Only .wav sound files work here.");
    }
    return;
  }
  try {
    const img = await loadImageFile(file);
    const square = centreSquare(img);
    const f = features(square);
    const shown = document.createElement("canvas");
    shown.width = shown.height = 320;
    const g = shown.getContext("2d");
    g.drawImage(square, 0, 0, 320, 320);
    if (f?.points) drawSkeleton(g, f.points, 320, false);
    el.testImg.src = shown.toDataURL("image/jpeg", 0.85);
    el.testImg.hidden = false;
    state.testing = true;
    $("#back-to-camera").hidden = !state.stream;
    if (f) showBars(predictVec(f.vec), true);
    else showNoPerson("No person found in that photo.");
  } catch (err) {
    fail(err instanceof TooBigError
      ? `That photo is too big; use a smaller copy (under ${MAX_SQUARE} pixels on the short side).`
      : "That file couldn't be read as a picture.");
  }
});
function backToCamera() {
  state.testing = false;
  el.testImg.hidden = true;
  $("#back-to-camera").hidden = true;
}
$("#back-to-camera").addEventListener("click", backToCamera);

// ---------------------------------------------------------------- camera

async function toggleMic() {
  const msg = $("#mic-msg");
  if (state.mic) {
    state.mic.stop();
    state.mic = null;
    msg.hidden = false;
    msg.textContent = "Microphone is off";
    el.cameraBtn.textContent = "Turn on microphone";
    $("#back-to-camera").hidden = true;
    changed();
    return;
  }
  if (!navigator.mediaDevices?.getUserMedia || !window.AudioWorkletNode) {
    msg.textContent = "This browser can't use a microphone here. You can still upload .wav sounds.";
    return;
  }
  el.cameraBtn.disabled = true;
  const mic = new Mic();
  mic.onEnded = () => {
    if (state.mic !== mic) return;
    toggleMic().then(() => { msg.textContent = "The microphone was disconnected. Plug it back in and turn it on again."; });
  };
  try {
    msg.textContent = "Starting microphone…";
    await mic.start();
    state.mic = mic;
    msg.hidden = true;
    el.cameraBtn.textContent = "Turn off microphone";
    backToCamera();
    changed();
    startPreview();
    drawMicLoop();
  } catch (err) {
    console.warn(err);
    mic.stop();
    state.mic = null;
    el.cameraBtn.textContent = "Turn on microphone";
    msg.textContent = err.name === "NotAllowedError"
      ? "Microphone permission was blocked. Allow it in the browser's address bar, or upload .wav sounds instead."
      : "Couldn't start a microphone. You can still upload .wav sounds.";
  } finally {
    el.cameraBtn.disabled = false;
  }
}

async function toggleCamera() {
  if (MODE === "audio") return toggleMic();
  if (state.stream) {
    state.stream.getTracks().forEach((t) => t.stop());
    state.stream = null;
    el.video.srcObject = null;
    el.cameraMsg.hidden = false;
    el.cameraMsg.textContent = "Camera is off";
    drawOverlay(null);
    el.cameraBtn.textContent = "Turn on camera";
    $("#back-to-camera").hidden = true;
    changed();
    return;
  }
  if (!navigator.mediaDevices?.getUserMedia) {
    el.cameraMsg.textContent = "This browser can't use a camera here. You can still upload photos.";
    return;
  }
  el.cameraBtn.disabled = true;           // no double starts while the camera is opening
  let stream = null;
  try {
    el.cameraMsg.textContent = "Starting camera…";
    stream = await navigator.mediaDevices.getUserMedia({
      video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: "user" }, audio: false,
    });
    el.video.srcObject = stream;
    await el.video.play();
    state.stream = stream;
    el.cameraMsg.hidden = true;
    el.cameraBtn.textContent = "Turn off camera";
    backToCamera();
    changed();
    startPreview();
  } catch (err) {
    console.warn(err);
    stream?.getTracks().forEach((t) => t.stop());
    el.video.srcObject = null;
    state.stream = null;
    el.cameraBtn.textContent = "Turn on camera";
    el.cameraMsg.textContent = err.name === "NotAllowedError"
      ? "Camera permission was blocked. Allow it in the browser's address bar, or upload photos instead."
      : "Couldn't start a camera. You can still upload photos.";
  } finally {
    el.cameraBtn.disabled = false;
  }
}

// ---------------------------------------------------------------- save / open a project
// A project file keeps the class names, each example's numbers (as little-endian float32, base64)
// and the small previews, so students can carry on next lesson. Not the trained model:
// training again takes seconds. Format: see "Project files" in EXPORT_FORMAT.md.

const PROJECT_FORMAT = "pattern-trainer-project";
const MODE_NAMES = { image: "Pictures", pose: "Body poses", audio: "Sounds" };
const MAX_CLASSES = 50;
const MAX_PROJECT_MB = 200;
class ProjectError extends Error {}

function toBase64(vec) {
  const f = Float32Array.from(vec);
  const bytes = new Uint8Array(f.buffer);
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

function fromBase64(text) {
  const bin = atob(text);
  if (bin.length !== DIM * 4) throw new ProjectError("damaged");
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  const vec = new Float32Array(bytes.buffer);
  if (!vec.every(Number.isFinite)) throw new ProjectError("damaged");
  return vec;
}

function projectJSON() {
  return JSON.stringify({
    format: PROJECT_FORMAT, version: 1, created: new Date().toISOString(), app: APP_VERSION,
    input: { type: INPUT.type, preprocess: INPUT.preprocess, embedding: { model: INPUT.modelFile, dim: DIM } },
    classes: state.classes.map((c) => ({
      name: c.name,
      examples: c.examples.map(toBase64),
      thumbs: c.thumbs,
      tips: c.examples.map((_, i) => c.tips[i] || ""),
    })),
  });
}

function saveProject() {
  if (el.saveBtn.disabled) return;
  const blob = new Blob([projectJSON()], { type: "application/json" });
  const a = Object.assign(document.createElement("a"), { href: URL.createObjectURL(blob), download: PROJECT_FILE });
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  state.savedVersion = state.dataVersion;
  const n = state.classes.reduce((t, c) => t + c.examples.length, 0);
  const photos = MODE === "image" ? " It includes the small previews of your photos, so look after it like your photos." : "";
  setMsg(el.projectMsg, `Saved ${PROJECT_FILE} (${n} examples, ${Math.max(1, Math.round(blob.size / 1024))} KB). Next time, click Open project and choose this file.${photos}`, "ok");
}

// Checks everything before changing anything, so a bad file leaves the current work alone.
function readProject(text) {
  let p;
  try { p = JSON.parse(text); } catch { throw new ProjectError("That file isn't a Pattern Trainer project."); }
  if (p?.format === "pattern-trainer-head") {
    throw new ProjectError("That's a model file (for the Python starter), not a project. Open the file you made with Save project.");
  }
  if (p?.format !== PROJECT_FORMAT) throw new ProjectError("That file isn't a Pattern Trainer project.");
  if (p.version !== 1) throw new ProjectError("That project was made by a newer Pattern Trainer. Reload this page to get the latest version, then try again.");
  const type = p.input?.type;
  if (type !== INPUT.type) {
    if (MODE_NAMES[type]) throw new ProjectError(`That's a ${MODE_NAMES[type]} project. Switch to ${MODE_NAMES[type]} at the top of the page, then open it again.`);
    throw new ProjectError("That file isn't a Pattern Trainer project.");
  }
  if (p.input.preprocess !== INPUT.preprocess || p.input.embedding?.dim !== DIM) {
    throw new ProjectError("That project was made with a different version of the trainer, so its examples don't fit this one.");
  }
  const damaged = () => new ProjectError("That project file is damaged, so it couldn't be opened.");
  if (!Array.isArray(p.classes) || !p.classes.length) throw damaged();
  if (p.classes.length > MAX_CLASSES) throw new ProjectError(`That project has more than ${MAX_CLASSES} classes, so it couldn't be opened.`);
  try {
    return p.classes.map((c) => {
      const okList = (a) => Array.isArray(a) && a.length === c.examples.length;
      if (typeof c.name !== "string" || !Array.isArray(c.examples) || c.examples.length > MAX_PER_CLASS) throw damaged();
      if (!okList(c.thumbs) || !c.thumbs.every((t) => typeof t === "string" && /^data:image\/(jpeg|png);base64,[A-Za-z0-9+/=]*$/.test(t))) throw damaged();
      const tips = okList(c.tips) && c.tips.every((t) => typeof t === "string") ? c.tips : c.examples.map(() => "");
      return { name: c.name.slice(0, 100), examples: c.examples.map(fromBase64), thumbs: c.thumbs, tips };
    });
  } catch (err) {
    throw err instanceof ProjectError && err.message !== "damaged" ? err : damaged();
  }
}

async function openProject(file) {
  if (state.training) { setMsg(el.projectMsg, "Wait for training to finish, then open the project.", "warn"); return; }
  let classes;
  try {
    if (file.size > MAX_PROJECT_MB * 1024 * 1024) throw new ProjectError("That file is too big to be a Pattern Trainer project.");
    classes = readProject(await file.text());
  } catch (err) {
    if (!(err instanceof ProjectError)) console.error(err);
    setMsg(el.projectMsg, err instanceof ProjectError ? err.message : "That file couldn't be opened.", "warn");
    return;
  }
  for (const c of state.classes) { c.stopRecording?.(); c.card.remove(); }
  state.classes = [];
  for (const c of classes) {
    const cls = addClass(c.name);
    Object.assign(cls, { examples: c.examples, thumbs: c.thumbs, tips: c.tips });
  }
  if (state.model) state.model.dispose();
  Object.assign(state, { model: null, modelClasses: [], trainedVersion: -1, check: null, lastPrediction: null });
  backToCamera();
  el.bars.dataset.names = "";
  el.bars.replaceChildren();
  setMsg(el.trainMsg, "");
  changed();
  state.savedVersion = state.dataVersion;
  const n = classes.reduce((t, c) => t + c.examples.length, 0);
  setMsg(el.projectMsg, `Opened ${file.name}: ${classes.length} classes, ${n} examples. Train the model to use it.`, "ok");
}

// Opening replaces the current examples, so ask first (click again) when there are any.
let openArmed = false;
el.openFile.addEventListener("click", (e) => {
  if (openArmed || !state.classes.some((c) => c.examples.length) || state.savedVersion === state.dataVersion) return;
  e.preventDefault();
  openArmed = true;
  setMsg(el.projectMsg, "Opening a project replaces the examples you have now. Click Open project again to carry on, or Save project first.", "warn");
  setTimeout(() => { openArmed = false; }, 6000);
});
el.openFile.addEventListener("change", async () => {
  const file = el.openFile.files[0];
  el.openFile.value = "";
  openArmed = false;
  if (file) await openProject(file);
});

// ---------------------------------------------------------------- export

function exportHead() {
  const round = (v) => Array.from(v, (x) => Number(x.toPrecision(6)));
  const layers = state.model.layers.map((l) => {
    const [k, b] = l.getWeights();
    return {
      type: "dense",
      activation: l.getConfig().activation,
      kernel: { shape: k.shape, data: round(k.dataSync()) },
      bias: { shape: b.shape, data: round(b.dataSync()) },
    };
  });
  const dim = layers[0].kernel.shape[0];
  const check = tf.tidy(() => {
    const ramp = tf.tensor2d([Array.from({ length: dim }, (_, i) => ((i * 37) % 100) / 100)]);
    return { input: "ramp-v1", output: round(state.model.predict(ramp).dataSync()) };
  });
  return JSON.stringify({
    format: "pattern-trainer-head", version: 1,
    created: new Date().toISOString(), app: APP_VERSION,
    input: { type: INPUT.type, preprocess: INPUT.preprocess, embedding: { model: INPUT.modelFile, dim } },
    classes: state.modelClasses,
    layers, check,
    training: {
      examples_per_class: state.trainedCounts, ...state.trainedSettings,
      ...(state.check && { check_correct: state.check.correct, check_total: state.check.total }),
    },
  });
}

function download() {
  if (el.exportBtn.disabled) return;
  const blob = new Blob([exportHead()], { type: "application/json" });
  const a = Object.assign(document.createElement("a"), { href: URL.createObjectURL(blob), download: INPUT.download });
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  setMsg(el.exportMsg, `Downloaded ${INPUT.download} (${Math.round(blob.size / 1024)} KB). Classes: ${state.modelClasses.join(", ")}.`, "ok");
}

// ---------------------------------------------------------------- start up

// Wording that differs between the two modes.
function setUpModeText() {
  const keepSettings = new URLSearchParams(location.search).get("settings") === "1";
  document.querySelectorAll(".mode-nav a").forEach((a) => {
    if (a.dataset.mode === MODE) a.setAttribute("aria-current", "page"); else a.removeAttribute("aria-current");
    if (keepSettings) a.href = a.dataset.mode === "image" ? "./?settings=1" : `./?mode=${a.dataset.mode}&settings=1`;
  });
  el.loading.textContent = INPUT.loading;
  document.querySelectorAll(".download-name").forEach((n) => { n.textContent = INPUT.download; });
  $("#set-hidden").value = DEFAULTS.hidden; $("#set-epochs").value = DEFAULTS.epochs;
  $("#set-lr").value = DEFAULTS.lr; $("#set-batch").value = DEFAULTS.batch;
  if (MODE === "audio") {
    document.title = "Pattern Trainer: Sounds";
    $("#lead").firstChild.textContent = "Teach a computer to recognise your own sounds. Only sound scores are kept, never the recordings. ";
    $("#classes-hint").textContent = "Make one class for each sound, plus a “Background noise” class for when nothing is happening. Use Hold to record for ongoing sounds (music, a fan) and Record one for short sounds (a word, a clap). Aim for 20 or more examples per class.";
    $("#camera-h").textContent = "Microphone";
    $("#camera-box").hidden = true;
    $("#mic-box").hidden = false;
    $("#camera-hint").textContent = "Each example is about 1 second of sound. Only the sound model's scores for 521 kinds of sound (speech, clapping, music…) are kept, not the sound itself. Hover over an example to see what the sound model heard. (The sound model is called YAMNet.)";
    $("#good-habits").innerHTML = "<strong>Good habits:</strong> only record your own voice, or people who have said yes. Watch out for other people talking nearby.";
    el.cameraBtn.textContent = "Turn on microphone";
    $("#test-hint").textContent = "Make the sound near the microphone, or try a .wav file the model hasn't heard.";
    $("#test-label").textContent = "Test a sound (.wav)";
    el.testFile.accept = ".wav,audio/wav,audio/x-wav";
    $("#back-to-camera").textContent = "Back to microphone";
    return;
  }
  if (MODE !== "pose") return;
  document.title = "Pattern Trainer: Body poses";
  $("#lead").firstChild.textContent = "Teach a computer to recognise your own body poses. Only 33 body points are kept, never the pictures. ";
  $("#classes-hint").textContent = "Make one class for each pose you want to tell apart. Give each class at least 20 examples, with your whole body in the square, from slightly different positions.";
  $("#camera-hint").textContent = "The dots show the 33 body points the model uses; nothing else is kept. Stand back so your whole body fits in the square. It's shown like a mirror, but saved the right way round.";
  $("#good-habits").innerHTML = "<strong>Good habits:</strong> only record yourself, or people who have said yes. Check what's behind you before you record.";
}

async function start() {
  if (new URLSearchParams(location.search).get("settings") === "1") el.settings.hidden = false;
  // A photo dropped outside a class card would otherwise open in the tab and lose all work.
  window.addEventListener("dragover", (e) => e.preventDefault());
  window.addEventListener("drop", (e) => e.preventDefault());
  window.addEventListener("beforeunload", (e) => {
    if (state.classes.some((c) => c.examples.length) && state.savedVersion !== state.dataVersion) { e.preventDefault(); e.returnValue = ""; }
  });
  addClass(MODE === "audio" ? "Background noise" : "Class 1");
  addClass("Class 2");
  el.addClass.addEventListener("click", () => $(".class-name", addClass().card).focus());
  el.cameraBtn.addEventListener("click", toggleCamera);
  el.trainBtn.addEventListener("click", train);
  el.exportBtn.addEventListener("click", download);
  el.saveBtn.addEventListener("click", saveProject);
  setUpModeText();
  try {
    await tf.setBackend("cpu");
    const modelUrl = new URL(`models/${INPUT.modelFile}`, location.href).href;
    if (MODE === "audio") {
      state.embedder = await loadAudioClassifier(location.href, modelUrl);
      el.loading.hidden = true;
      changed();
      return;
    }
    const files = await FilesetResolver.forVisionTasks(new URL("vendor/mediapipe/wasm", location.href).href);
    const baseOptions = { modelAssetPath: modelUrl, delegate: "CPU" };
    state.embedder = MODE === "pose"
      ? await PoseLandmarker.createFromOptions(files, { baseOptions, runningMode: "IMAGE", numPoses: 1 })
      : await ImageEmbedder.createFromOptions(files, { baseOptions, runningMode: "IMAGE" });
    el.loading.hidden = true;
  } catch (err) {
    console.error(err);
    el.loading.textContent = "The model didn't load. Check your internet connection and reload the page.";
    el.loading.classList.add("error");
  }
  changed();
}

// Small hook for automated tests and curious teachers (read-only use).
window.__trainer = {
  state,
  exportJSON: () => (state.model ? exportHead() : null),
  ready: () => Boolean(state.embedder),
  projectJSON,
};

start();
