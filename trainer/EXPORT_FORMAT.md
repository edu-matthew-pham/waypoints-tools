# Pattern Trainer export format (version 1)

One JSON file, downloaded by the student, loaded by `pattern_model.py` in the starters.
Only the small trained part (the "head") travels. The shared "picture to numbers" model is one
file, `mobilenet_v2_embedder.tflite`, run by MediaPipe on both sides.

## How the pieces fit

| Step | Browser trainer | Python starter |
|---|---|---|
| Picture to numbers | MediaPipe `tasks-vision` ImageEmbedder + `mobilenet_v2_embedder.tflite` | MediaPipe `mediapipe` ImageEmbedder + the same file |
| Train the head | TF.js (browser only) | — |
| Run the head | TF.js | plain numpy (`pattern_model.py`) |
| Install | none | `pip install mediapipe pillow` (no TensorFlow) |

## Example (numbers shortened)

```json
{
  "format": "pattern-trainer-head",
  "version": 1,
  "created": "2026-10-26T08:00:00Z",
  "app": "pattern-trainer 0.1.0",

  "input": {
    "type": "image",
    "preprocess": "mediapipe-image-embedder-centre-crop-v1",
    "embedding": { "model": "mobilenet_v2_embedder.tflite", "dim": 1280 }
  },

  "classes": ["cat", "dog", "neither"],

  "layers": [
    {
      "type": "dense", "activation": "relu",
      "kernel": { "shape": [1280, 16], "data": [0.0123, -0.0456, "..."] },
      "bias":   { "shape": [16],       "data": [0.0, 0.01, "..."] }
    },
    {
      "type": "dense", "activation": "softmax",
      "kernel": { "shape": [16, 3], "data": ["..."] },
      "bias":   { "shape": [3],     "data": ["..."] }
    }
  ],

  "check": { "input": "ramp-v1", "output": [0.21, 0.65, 0.14] },

  "training": {
    "examples_per_class": [42, 40, 55],
    "epochs": 30,
    "val_accuracy": 0.91
  }
}
```

## Field rules

| Field | Rule |
|---|---|
| `format` | Always `"pattern-trainer-head"`. Loader rejects anything else. |
| `version` | Integer. Bump only for breaking changes. Loader accepts exactly the versions it knows and otherwise says "ask your teacher for the latest starter". |
| `created`, `app` | Informational (ISO 8601 UTC; tool name and version). |
| `input.type` | `"image"`, `"pose"` (see "Body poses") or `"audio"` (see "Sounds"). |
| `input.preprocess` | A **named recipe**. `mediapipe-image-embedder-centre-crop-v1` = take the centre square of the picture at full resolution (no resizing) on a white background (see-through pixels count as white), then MediaPipe ImageEmbedder with default settings (`l2Normalize` and `quantize` off), given RGB pixels (see "Image preparation"). The loader refuses IDs it doesn't know, so a mismatch fails loudly instead of silently lowering accuracy. Pose uses `mediapipe-pose-lite-xy-centred-v1`. |
| `input.embedding` | `model` = the model file name (looked up next to `pattern_model.py`); `dim` = numbers per picture (1280), must equal the first kernel's input size. |
| `classes` | Class names; **array position = output index**. |
| `layers` | Ordered dense layers. `activation` is `relu`, `softmax` or `linear`. The last layer should be `softmax` with `units == classes.length`. |
| `kernel` | `shape: [in, out]`, `data` is a flat array in **row-major** order (TF.js `dataSync()` already gives this). |
| `bias` | `shape: [out]`. |
| `check` | Optional but recommended. The head's output on a fixed ramp input `x[i] = ((i * 37) % 100) / 100`. The loader recomputes it and refuses to run if it differs by more than 1e-4. Catches weight layout bugs, not image problems. |
| `training` | Optional, informational. Not read by the loader. The trainer writes examples per class, its settings, and `check_correct` / `check_total` (held-back accuracy check) when every class had at least 5 examples. |

## Size

Plain JSON numbers cost roughly 8-10 bytes each. At 1280 inputs:

| Head | Parameters | File size (approx) |
|---|---|---|
| Single dense layer (no hidden layer), 3 classes | ~3.8k | ~35 KB |
| Hidden layer of 16, 3 classes | ~20k | ~210 KB (measured) |
| Hidden layer of 100, 3 classes | ~128k | ~1.2 MB |

Round weights to 6 significant digits on export. Keep readable arrays rather than base64 for v1 so students can open the file and see that it is just numbers.

## The image model file

`mobilenet_v2_embedder.tflite` (about 9 MB) is made once by the teacher with `make_image_model.py`
(needs TensorFlow on that one laptop). It is the standard Keras MobileNetV2 (ImageNet weights, no top,
average pooled) and takes ordinary 0-255 pixels, doing the [-1, 1] scaling inside, so MediaPipe needs
no extra settings. Ship the same file in `tools/trainer/` and in each image starter folder.

## Image preparation

1. **Centre square, no resizing.** Cut the largest centre square out of the picture at its own resolution,
   with offsets `floor((w - s) / 2)`, `floor((h - s) / 2)`. Whatever is inside the square counts; the trainer's
   camera view shows exactly this square. See-through (transparent) pixels count as white on both sides.
   The browser refuses squares over 4096 px (some tablets silently fail on bigger canvases).
2. **MediaPipe does the rest.** It resizes the square to 224x224 itself, identically in the browser and Python.

Browser (self-host `vision_bundle.mjs` and the `wasm/` folder from `@mediapipe/tasks-vision`, and pin the same
version as the Python `mediapipe` package):

```js
import { FilesetResolver, ImageEmbedder } from "./vendor/mediapipe/vision_bundle.mjs";

function centreSquare(source) {                 // <img>, <video> or <canvas>
  const w = source.videoWidth || source.naturalWidth || source.width;
  const h = source.videoHeight || source.naturalHeight || source.height;
  const s = Math.min(w, h), c = document.createElement("canvas");
  c.width = s; c.height = s;
  const g = c.getContext("2d");
  g.fillStyle = "#ffffff"; g.fillRect(0, 0, s, s);          // see-through pixels count as white
  g.drawImage(source, Math.floor((w - s) / 2), Math.floor((h - s) / 2), s, s, 0, 0, s, s);
  return c;
}

async function makeEmbedder() {
  const files = await FilesetResolver.forVisionTasks("./vendor/mediapipe/wasm");
  return ImageEmbedder.createFromOptions(files, {
    baseOptions: { modelAssetPath: "./models/mobilenet_v2_embedder.tflite", delegate: "CPU" },
    runningMode: "IMAGE",
  });
}
// embedder.embed(centreSquare(img)).embeddings[0].floatEmbedding  -> 1280 numbers
```

Python: read photos with **Pillow** (applying the photo's EXIF rotation, as browsers do) or take Gradio's numpy
array, put see-through pixels on white, cut the same centre square, then hand MediaPipe the RGB pixels, as `pattern_model.py` does. Don't use
MediaPipe's own `mp.Image.create_from_file`: it decodes JPEGs slightly differently from browsers (about 1% off).

Tested 2026-10-26 (Chromium, `tasks-vision` 1.1.1; Python 3.13, `mediapipe` 0.10.32 and 1.1.1): same photo gives
the same 1280 numbers to about 0.0002%, and a head trained in the browser gives identical predictions in Python.

## Body poses (`input.type: "pose"`)

Same file format; only `input` differs:

```json
"input": {
  "type": "pose",
  "preprocess": "mediapipe-pose-lite-xy-centred-v1",
  "embedding": { "model": "pose_landmarker_lite.task", "dim": 66 }
}
```

Recipe `mediapipe-pose-lite-xy-centred-v1`:

1. Centre square on white, exactly as for pictures.
2. MediaPipe PoseLandmarker (`pose_landmarker_lite.task`, IMAGE mode, one pose). No person found means no
   example (trainer) or no prediction (loader: `predict()` gives `None`, `top()` gives `(None, 0.0)`).
3. Take the 33 landmarks' `x, y` (0 to 1 across the square). Centre on the middle of the hips (landmarks 23, 24)
   and divide by the torso length (distance from mid-shoulders, landmarks 11 and 12, to mid-hips); use 1 if that
   length is under 0.000001. Flatten as `x0, y0, x1, y1, ...` to 66 numbers.

Only these 66 numbers are used. The trainer's thumbnails for pose classes are stick figures, not photos.

Tested 2026-10-27 (Chromium, `tasks-vision` 1.1.1; Python `mediapipe` 1.1.1): body points match closely but
**not exactly** between browser and Python (within about 1% of the image size on test photos; each side is
repeatable). Classifications agree. For pictures, the match is exact.

`pose_landmarker_lite.task` (5.8 MB, SHA-256 `59929e1d1ee95287735ddd833b19cf4ac46d29bc7afddbbf6753c459690d574a`)
is Google's MediaPipe pose model (Apache-2.0).

## Sounds (`input.type: "audio"`)

Same file format; only `input` differs:

```json
"input": {
  "type": "audio",
  "preprocess": "mediapipe-yamnet-windows-v1",
  "embedding": { "model": "yamnet.tflite", "dim": 521 }
}
```

Recipe `mediapipe-yamnet-windows-v1`:

1. **Mono samples at the original sample rate.** Average the channels. Integer samples are scaled to -1..1
   (16-bit: divide by 32768). Never let anything else resample: in the browser, read WAV files directly and pass
   the microphone's own rate; in Python, pass Gradio's `(rate, samples)` straight through.
2. **MediaPipe AudioClassifier** with `yamnet.tflite` and all 521 scores (`maxResults: -1`). It resamples to
   16 kHz and scores each 0.975-second window.
3. **Keep only full windows:** the first `floor(samples * 16000 / rate / 15600)` windows (all of them if that is
   0). MediaPipe's resampling always leaves a short, padded extra window, which is dropped.
4. Each window's 521 scores (by category index) are one example. A recording made in the trainer is 0.975 s,
   so exactly one window. **Predicting a longer sound:** run the head on every kept window and average the class
   percentages.

Only the 521 scores are kept per example; the trainer's thumbnails show the waveform shape, and hovering one
shows YAMNet's top sound name.

Tested 2026-10-27 (Chromium, `tasks-audio` 1.1.1; Python `mediapipe` 1.1.1): with the same samples both sides give
matching scores. A browser that resamples the audio itself (`decodeAudioData` on a file with a different rate)
changes the scores enough to change answers, which is why step 1 matters.

`yamnet.tflite` (4.1 MB) is Google's YAMNet audio classifier with MediaPipe metadata (Apache-2.0).

## Export sketch (browser, TF.js)

```js
function exportHead(model, classes, extra) {
  const round = (v) => Array.from(v, (x) => Number(x.toPrecision(6)));
  const layers = model.layers.map((l) => {
    const [k, b] = l.getWeights();
    return {
      type: "dense",
      activation: l.getConfig().activation,
      kernel: { shape: k.shape, data: round(k.dataSync()) },
      bias: { shape: b.shape, data: round(b.dataSync()) },
    };
  });
  const dim = layers[0].kernel.shape[0];
  const ramp = tf.tensor2d([Array.from({ length: dim }, (_, i) => ((i * 37) % 100) / 100)]);
  const check = { input: "ramp-v1", output: round(model.predict(ramp).dataSync()) };
  return JSON.stringify({
    format: "pattern-trainer-head", version: 1,
    created: new Date().toISOString(), app: "pattern-trainer 0.1.0",
    input: { type: "image", preprocess: "mediapipe-image-embedder-centre-crop-v1",
             embedding: { model: "mobilenet_v2_embedder.tflite", dim } },
    classes, layers, check, ...extra,
  });
}
```

## Compatibility rules

- Adding optional fields does not change `version`. The loader ignores fields it doesn't know.
- Changing how images are prepared, or the image model, means a **new `preprocess` ID or model file name**, never editing an existing one.
- Changing layer layout, adding layer types, or changing `check` semantics means bumping `version`.
