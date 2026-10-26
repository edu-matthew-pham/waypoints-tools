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
    cls.examples = []; cls.thumbs = [];
    changed();
  });

  const upload = $(".upload", card);
  upload.addEventListener("change", async () => {
    const files = [...upload.files];
    upload.value = "";
    await addFiles(cls, files);
  });
  card.addEventListener("dragover", (e) => { e.preventDefault(); card.classList.add("dragover"); });
  card.addEventListener("dragleave", () => card.classList.remove("dragover"));
  card.addEventListener("drop", async (e) => {
    e.preventDefault(); e.stopPropagation(); card.classList.remove("dragover");
    const files = [...e.dataTransfer.files].filter((f) => f.type.startsWith("image/"));
    if (!files.length) { cardMsg(cls, "Only picture files can be added.", "warn"); return; }
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
  if (!files.length) return;
  if (!state.embedder) { cardMsg(cls, "Still loading the image model. Try again in a moment.", "warn"); return; }
  let added = 0, failed = 0, tooBig = 0;
  for (const [i, file] of files.entries()) {
    if (!state.classes.includes(cls)) return;   // class deleted while adding
    cardMsg(cls, `Adding photo ${i + 1} of ${files.length}…`);
    try {
      const img = await loadImageFile(file);
      if (!addExample(cls, centreSquare(img))) break;
      added++;
    } catch (err) {
      if (err instanceof TooBigError) tooBig++; else failed++;
    }
    if (i % 5 === 4) { renderClass(cls); await new Promise((r) => setTimeout(r)); }
  }
  changed();
  const notes = [];
  if (failed) notes.push(`${failed} file(s) couldn't be read as pictures.`);
  if (tooBig) notes.push(`${tooBig} photo(s) were too big; use a smaller copy (under ${MAX_SQUARE} pixels on the short side).`);
  cardMsg(cls, `Added ${added} photo(s).${notes.length ? " " + notes.join(" ") : ""}`, notes.length ? "warn" : "ok");
}

function setUpRecordButton(cls, btn) {
  let timer = null;
  const start = (e) => {
    e.preventDefault();
    if (timer || !state.stream || btn.disabled) return;
    btn.classList.add("active"); btn.textContent = "Recording…";
    const grab = () => {
      if (!state.stream) { stop(); return; }
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
      if (r === g) td.className = "hit"; else if (c.matrix[r][g]) td.className = "miss";
      tr.append(td);
    });
    return tr;
  });
  const headRow = document.createElement("tr");
  headRow.append(Object.assign(document.createElement("th"), { scope: "col", textContent: "Really ↓ / Guessed →" }),
                 ...c.names.map((n) => Object.assign(document.createElement("th"), { scope: "col", textContent: n })));
  table.replaceChildren(Object.assign(document.createElement("thead")), Object.assign(document.createElement("tbody")));
  table.tHead.append(headRow);
  table.tBodies[0].append(...rows);
  table.hidden = false;
  let worst = null;
  c.matrix.forEach((row, r) => row.forEach((n, g) => { if (r !== g && n && (!worst || n > worst.n)) worst = { r, g, n }; }));
  mix.textContent = worst
    ? `Most common mix-up: “${c.names[worst.r]}” guessed as “${c.names[worst.g]}” (${worst.n} time${worst.n === 1 ? "" : "s"}). More varied examples of both usually help.`
    : "No mix-ups on these examples.";
}

// ---------------------------------------------------------------- testing

function predict(square) {
  const vec = embed(square);
  return tf.tidy(() => Array.from(state.model.predict(tf.tensor2d(vec, [1, vec.length])).dataSync()));
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

function startPreview() {
  clearInterval(state.previewTimer);
  state.previewTimer = setInterval(() => {
    if (!state.model || state.testing || !state.stream || el.video.readyState < 2) return;
    if (document.querySelector(".record.active")) return;
    try { showBars(predict(centreSquare(el.video))); } catch (err) { console.warn(err); }
  }, PREVIEW_INTERVAL_MS);
}

el.testFile.addEventListener("change", async () => {
  const file = el.testFile.files[0];
  el.testFile.value = "";
  if (!file) return;
  const fail = (text) => { el.bars.dataset.names = ""; el.bars.textContent = text; };
  if (!state.model) { fail("Train a model first."); return; }
  try {
    const img = await loadImageFile(file);
    const square = centreSquare(img);
    el.testImg.src = square.toDataURL("image/jpeg", 0.85);
    el.testImg.hidden = false;
    state.testing = true;
    $("#back-to-camera").hidden = !state.stream;
    showBars(predict(square), true);
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
    training: {
      examples_per_class: state.trainedCounts, ...state.trainedSettings,
      ...(state.check && { check_correct: state.check.correct, check_total: state.check.total }),
    },
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
  // A photo dropped outside a class card would otherwise open in the tab and lose all work.
  window.addEventListener("dragover", (e) => e.preventDefault());
  window.addEventListener("drop", (e) => e.preventDefault());
  window.addEventListener("beforeunload", (e) => {
    if (state.classes.some((c) => c.examples.length)) { e.preventDefault(); e.returnValue = ""; }
  });
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
