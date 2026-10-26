# Pattern Trainer

A small browser tool for learning how image classifiers work (aimed at about Years 9–10). Students collect example photos for their own
classes, train a model in the browser, test it, and download `my_model.json` to use in the Python/Gradio starters.
Nothing is uploaded: photos and training stay on the student's computer.

**Use it:** `https://edu-matthew-pham.github.io/waypoints-tools/trainer/` (once GitHub Pages is on).
Add `?settings=1` to the address to show test settings (hidden units, epochs, learning rate, batch size).

## How it works

| Step | What happens |
|---|---|
| Collect | Each photo or webcam frame is cut to its centre square, then MediaPipe turns it into 1280 numbers using `models/mobilenet_v2_embedder.tflite` (the standard MobileNetV2 with ImageNet weights). |
| Train | TF.js trains a small model on those numbers: one hidden layer of 16, then one output per class. 30 rounds (epochs), learning rate 0.001, batches of 16. Takes a few seconds. |
| Test | Live webcam preview, or test a photo. |
| Download | `my_model.json`: the small trained part, class names and a self-check. Format: [`EXPORT_FORMAT.md`](EXPORT_FORMAT.md). |

The [Python starter](https://github.com/edu-matthew-pham/pattern-detector-starters) loads that file with [`python/pattern_model.py`](python/pattern_model.py), using MediaPipe and the
same `.tflite` file, so Python gives the same answers as the browser. Students need `pip install mediapipe pillow`;
no TensorFlow.

## Folder

```
index.html, app.js, style.css   the tool (plain HTML/JS, no build step)
models/                         mobilenet_v2_embedder.tflite (9 MB, shared with the Python starters)
vendor/                         TF.js 4.22.0 and MediaPipe tasks-vision 1.1.1, self-hosted and pinned
python/pattern_model.py         reference copy of the loader the starters use
teacher/make_image_model.py     how the .tflite was made (needs TensorFlow, run once)
tests/test_trainer.py           end-to-end test in headless Chromium, incl. browser-vs-Python match
EXPORT_FORMAT.md                the JSON format
```

## Run it locally

Any static web server works, e.g. from this folder: `python -m http.server 8000`, then open
`http://localhost:8000`. (Opening `index.html` straight from the file system won't work: browsers block the
model files there. The webcam also needs `localhost` or `https`.)

## Test

```
pip install playwright mediapipe pillow numpy scikit-image
playwright install chromium
python tests/test_trainer.py path/to/pattern-detector-starters   # uses its bottle/honey photos; optional
```

It uploads photos, records from a simulated webcam, trains, tests photos (including a rotated phone photo, a PNG
with transparency, greyscale and a very wide image), downloads the model, and checks Python's predictions match
the browser's.

## Updating the libraries

Keep the browser's `@mediapipe/tasks-vision` version and the starters' `mediapipe` version the same, and re-run
the test after any update. A new image model needs a new file name (see `EXPORT_FORMAT.md`).
