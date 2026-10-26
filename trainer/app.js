// Pattern Trainer — plain JS, no build step.
// Pictures -> numbers: MediaPipe ImageEmbedder + models/mobilenet_v2_embedder.tflite
// Numbers -> classes: a small TF.js model trained here, exported as JSON
// (format: see EXPORT_FORMAT.md in this folder; loader: pattern_model.py in the starters).

import { FilesetResolver, ImageEmbedder } from "./vendor/mediapipe/vision_bundle.mjs";

const APP_VERSION = "pattern-trainer 0.1.0";
const MODEL_FILE = "mobilenet_v2_embedder.tflite";
const PREPROCESS_ID = "mediapipe-image-embedder-centre-crop-v1";
const DEFAULTS = { hidden: 16, epochs: 30, lr: 0.001, batch: 16 };
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
  testing: false,       // a test photo is showing instead of the live camera
  lastPrediction: null,
};

// ---------------------------------------------------------------- pictures -> numbers

// Centre square of the source at its own resolution (no resizing here).
// MediaPipe then resizes it to 224x224 the same way as in Python.
function centreSquare(source) {
  const w = source.videoWidth || source.naturalWidth || source.width;
  const h = source.videoHeight || source.naturalHeight || source.height;
  const s = Math.min(w, h);
  const c = document.createElement("canvas");
  c.width = s; c.height = s;
  c.getContext("2d").drawImage(source, Math.floor((w - s) / 2), Math.floor((h - s) / 2), s, s, 0, 0, s, s);
  return c;
}

function embed(square) {
  const result = state.embedder.embed(square);
  return Float32Array.from(result.embeddings[0].floatEmbedding);
}

function thumbnail(square) {
  const c = document.createElement("canvas");
  c.width = 64; c.height = 64;
  c.getContext("2d").drawImage(square, 0, 0, 64, 64);
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
  const cls = { id, name: name || `Class ${id}`, examples: [], thumbs: [], card };
  state.classes.push(cls);

  const nameInput = $(".class-name", card);
  nameInput.value = cls.name;
  nameInput.addEventListener("input", () => { cls.name = nameInput.value; changed(); });

  $(".remove-class", card).addEventListener("click", () => {
    if (cls.examples.length && !confirmRemove(cls)) return;
    state.classes = state.classes.filter((c) => c !== cls);
    card.remove();
    changed();
  });
  $(".clear", card).addEventListener("click", () => {
    cls.examples = []; cls.thumbs = [];
    changed();
  });

  const upload = $(".upload", card);
  upload.addEventListener("change", async () => {
    await addFiles(cls, [...upload.files]);
    upload.value = "";
  });
  card.addEventListener("dragover", (e) => { e.preventDefault(); card.classList.add("dragover"); });
  card.addEventListener("dragleave", () => card.classList.remove("dragover"));
  card.addEventListener("drop", async (e) => {
    e.preventDefault(); card.classList.remove("dragover");
    await addFiles(cls, [...e.dataTransfer.files].filter((f) => f.type.startsWith("image/")));
  });

  setUpRecordButton(cls, $(".record", card));
  el.classes.appendChild(card);
  changed();
  return cls;
}

// A plain inline confirm instead of window.confirm (which blocks the page).
function confirmRemove(cls) {
  const btn = $(".remove-class", cls.card);
  if (btn.dataset.armed) return true;
  btn.dataset.armed = "1";
  btn.textContent = "Delete?";
  setTimeout(() => { delete btn.dataset.armed; btn.textContent = "✕"; }, 3000);
  return false;
}

function addExample(cls, square) {
  if (cls.examples.length >= MAX_PER_CLASS) {
    cardMsg(cls, `That's the limit of ${MAX_PER_CLASS} examples for one class.`, "warn");
    return false;
  }
  cls.examples.push(embed(square));
  cls.thumbs.push(thumbnail(square));
  return true;
}

async function addFiles(cls, files) {
  if (!state.embedder || !files.length) return;
  let added = 0, failed = 0;
  for (const [i, file] of files.entries()) {
    cardMsg(cls, `Adding photo ${i + 1} of ${files.length}…`);
    try {
      const img = await loadImageFile(file);
      if (!addExample(cls, centreSquare(img))) break;
      added++;
    } catch {
      failed++;
    }
    if (i % 5 === 4) { renderClass(cls); await new Promise((r) => setTimeout(r)); }
  }
  changed();
  cardMsg(cls, failed ? `Added ${added}. ${failed} file(s) couldn't be read as pictures.` : `Added ${added} photo(s).`,
          failed ? "warn" : "ok");
}

function setUpRecordButton(cls, btn) {
  let timer = null;
  const start = (e) => {
    e.preventDefault();
    if (timer || !state.stream || btn.disabled) return;
    btn.classList.add("active"); btn.textContent = "Recording…";
    const grab = () => {
      if (el.video.readyState >= 2 && addExample(cls, centreSquare(el.video))) renderClass(cls);
      else if (cls.examples.length >= MAX_PER_CLASS) stop();
    };
    grab();
    timer = setInterval(grab, RECORD_INTERVAL_MS);
  };
  const stop = () => {
    if (!timer) return;
    clearInterval(timer); timer = null;
    btn.classList.remove("active"); btn.textContent = "Hold to record";
    changed();
  };
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
  $(".count", cls.card).textContent = `${n} example${n === 1 ? "" : "s"}`;
  $(".clear", cls.card).disabled = n === 0;
  $(".record", cls.card).disabled = !state.stream || !state.embedder;
  const thumbs = $(".thumbs", cls.card);
  const show = cls.thumbs.slice(-24);
  thumbs.replaceChildren(...show.map((src) => Object.assign(new Image(), { src, alt: "" })));
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

async function train() {
  if (problems() || state.training) return;
  state.training = true;
  refresh();
  const cfg = settings();
  const names = state.classes.map((c) => c.name.trim());
  const xsArr = [], ysArr = [];
  state.classes.forEach((c, k) => c.examples.forEach((e) => { xsArr.push(e); ysArr.push(k); }));
  const dim = xsArr[0].length;
  const version = state.dataVersion;

  el.progress.hidden = false; el.progress.value = 0;
  setMsg(el.trainMsg, "Training…");
  const xs = tf.tensor2d(Float32Array.from(xsArr.flatMap((e) => Array.from(e))), [xsArr.length, dim]);
  const ys = tf.oneHot(tf.tensor1d(ysArr, "int32"), names.length);
  const model = tf.sequential();
  if (cfg.hidden > 0) {
    model.add(tf.layers.dense({ inputShape: [dim], units: cfg.hidden, activation: "relu" }));
    model.add(tf.layers.dense({ units: names.length, activation: "softmax" }));
  } else {
    model.add(tf.layers.dense({ inputShape: [dim], units: names.length, activation: "softmax" }));
  }
  model.compile({ optimizer: tf.train.adam(cfg.lr), loss: "categoricalCrossentropy", metrics: ["accuracy"] });
  const t0 = performance.now();
  let lastAcc = 0;
  try {
    await model.fit(xs, ys, {
      epochs: cfg.epochs, batchSize: cfg.batch, shuffle: true,
      callbacks: {
        onEpochEnd: async (epoch, logs) => {
          el.progress.value = (epoch + 1) / cfg.epochs;
          lastAcc = logs.acc ?? logs.accuracy ?? 0;
          setMsg(el.trainMsg, `Training… round ${epoch + 1} of ${cfg.epochs}`);
          await tf.nextFrame();
        },
      },
    });
  } catch (err) {
    console.error(err);
    state.training = false;
    el.progress.hidden = true;
    setMsg(el.trainMsg, "Training didn't work. Try again, or reload the page.", "warn");
    refresh();
    return;
  } finally {
    xs.dispose(); ys.dispose();
  }
  if (state.model) state.model.dispose();
  state.model = model;
  state.modelClasses = names;
  state.trainedSettings = cfg;
  state.trainedCounts = state.classes.map((c) => c.examples.length);
  state.trainedVersion = version;
  state.training = false;
  el.progress.hidden = true;
  const secs = ((performance.now() - t0) / 1000).toFixed(1);
  setMsg(el.trainMsg, `Trained on ${xsArr.length} examples in ${secs} s. It got ${Math.round(lastAcc * 100)}% of its own training examples right; test it on new ones below.`, "ok");
  setMsg(el.exportMsg, "");
  refresh();
  startPreview();
}

// ---------------------------------------------------------------- testing

function predict(square) {
  const vec = embed(square);
  return tf.tidy(() => Array.from(state.model.predict(tf.tensor2d(vec, [1, vec.length])).dataSync()));
}

function showBars(probs) {
  state.lastPrediction = Object.fromEntries(state.modelClasses.map((n, i) => [n, probs[i]]));
  const best = probs.indexOf(Math.max(...probs));
  if (el.bars.children.length !== probs.length) {
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

function startPreview() {
  clearInterval(state.previewTimer);
  state.previewTimer = setInterval(() => {
    if (!state.model || state.testing || !state.stream || el.video.readyState < 2) return;
    if (document.querySelector(".record.active")) return;
    showBars(predict(centreSquare(el.video)));
  }, PREVIEW_INTERVAL_MS);
}

el.testFile.addEventListener("change", async () => {
  const file = el.testFile.files[0];
  el.testFile.value = "";
  if (!file) return;
  if (!state.model) { el.bars.textContent = "Train a model first."; return; }
  try {
    const img = await loadImageFile(file);
    const square = centreSquare(img);
    el.testImg.src = square.toDataURL("image/jpeg", 0.85);
    el.testImg.hidden = false;
    state.testing = true;
    $("#back-to-camera").hidden = !state.stream;
    showBars(predict(square));
  } catch {
    el.bars.textContent = "That file couldn't be read as a picture.";
  }
});
function backToCamera() {
  state.testing = false;
  el.testImg.hidden = true;
  $("#back-to-camera").hidden = true;
}
$("#back-to-camera").addEventListener("click", backToCamera);

// ---------------------------------------------------------------- camera

async function toggleCamera() {
  if (state.stream) {
    state.stream.getTracks().forEach((t) => t.stop());
    state.stream = null;
    el.video.srcObject = null;
    el.cameraMsg.hidden = false;
    el.cameraMsg.textContent = "Camera is off";
    el.cameraBtn.textContent = "Turn on camera";
    $("#back-to-camera").hidden = true;
    changed();
    return;
  }
  if (!navigator.mediaDevices?.getUserMedia) {
    el.cameraMsg.textContent = "This browser can't use a camera here. You can still upload photos.";
    return;
  }
  try {
    el.cameraMsg.textContent = "Starting camera…";
    state.stream = await navigator.mediaDevices.getUserMedia({
      video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: "user" }, audio: false,
    });
    el.video.srcObject = state.stream;
    await el.video.play();
    el.cameraMsg.hidden = true;
    el.cameraBtn.textContent = "Turn off camera";
    backToCamera();
    changed();
    startPreview();
  } catch (err) {
    console.warn(err);
    state.stream = null;
    el.cameraMsg.textContent = err.name === "NotAllowedError"
      ? "Camera permission was blocked. Allow it in the browser's address bar, or upload photos instead."
      : "Couldn't start a camera. You can still upload photos.";
  }
}

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
    input: { type: "image", preprocess: PREPROCESS_ID, embedding: { model: MODEL_FILE, dim } },
    classes: state.modelClasses,
    layers, check,
    training: { examples_per_class: state.trainedCounts, ...state.trainedSettings },
  });
}

function download() {
  if (el.exportBtn.disabled) return;
  const blob = new Blob([exportHead()], { type: "application/json" });
  const a = Object.assign(document.createElement("a"), { href: URL.createObjectURL(blob), download: "my_model.json" });
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  setMsg(el.exportMsg, `Downloaded my_model.json (${Math.round(blob.size / 1024)} KB). Classes: ${state.modelClasses.join(", ")}.`, "ok");
}

// ---------------------------------------------------------------- start up

async function start() {
  if (new URLSearchParams(location.search).get("settings") === "1") el.settings.hidden = false;
  addClass("Class 1");
  addClass("Class 2");
  el.addClass.addEventListener("click", () => $(".class-name", addClass().card).focus());
  el.cameraBtn.addEventListener("click", toggleCamera);
  el.trainBtn.addEventListener("click", train);
  el.exportBtn.addEventListener("click", download);
  try {
    await tf.setBackend("cpu");
    const files = await FilesetResolver.forVisionTasks(new URL("vendor/mediapipe/wasm", location.href).href);
    state.embedder = await ImageEmbedder.createFromOptions(files, {
      baseOptions: { modelAssetPath: new URL(`models/${MODEL_FILE}`, location.href).href, delegate: "CPU" },
      runningMode: "IMAGE",
    });
    el.loading.hidden = true;
  } catch (err) {
    console.error(err);
    el.loading.textContent = "The image model didn't load. Check your internet connection and reload the page.";
    el.loading.classList.add("error");
  }
  changed();
}

// Small hook for automated tests and curious teachers (read-only use).
window.__trainer = {
  state,
  exportJSON: () => (state.model ? exportHead() : null),
  ready: () => Boolean(state.embedder),
};

start();
