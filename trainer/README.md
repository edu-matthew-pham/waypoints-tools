# Pattern Trainer

A small browser tool for learning how image classifiers work (aimed at about Years 9–10). Students collect example photos for their own
classes, train a model in the browser, test it, and download `my_model.json` to use in the Python/Gradio starters.
Nothing is uploaded: photos and training stay on the student's computer.

**Use it:** https://tools.learningwaypoints.com/trainer/
Two modes: **Pictures** (default) and **Body poses** (`?mode=pose`). Add `?settings=1` to show test settings
(hidden units, epochs, learning rate, batch size), e.g. `?mode=pose&settings=1`.

## How it works

| Step | What happens |
|---|---|
| Collect | Each photo or webcam frame is cut to its centre square. **Pictures:** MediaPipe turns it into 1280 numbers using `models/mobilenet_v2_embedder.tflite` (the standard MobileNetV2 with ImageNet weights). **Body poses:** MediaPipe finds 33 body points with `models/pose_landmarker_lite.task`, turned into 66 numbers (centred on the hips, scaled by torso length); only the points are kept. |
| Train | TF.js trains a small model on those numbers. Pictures: one hidden layer of 16, 30 rounds (epochs), learning rate 0.001. Poses: 64, 50 rounds, 0.003. Batches of 16. First it holds back the newest 20% of each class to show an accuracy check and a mix-up table, then trains on everything. Takes a few seconds. |
| Test | Live webcam preview (with the body points drawn in pose mode), or test a photo. |
| Download | `my_model.json` (or `my_pose_model.json`): the small trained part, class names and a self-check. Format: [`EXPORT_FORMAT.md`](EXPORT_FORMAT.md). |

The [Python starter](https://github.com/edu-matthew-pham/pattern-detector-starters) loads that file with [`python/pattern_model.py`](python/pattern_model.py), using MediaPipe and the
same `.tflite` file, so Python gives the same answers as the browser. Students need `pip install mediapipe pillow`;
no TensorFlow.

## Folder

```
index.html, app.js, style.css   the tool (plain HTML/JS, no build step)
models/                         mobilenet_v2_embedder.tflite (9 MB) and pose_landmarker_lite.task (5.8 MB), shared with the Python starters
vendor/                         TF.js 4.22.0 and MediaPipe tasks-vision 1.1.1, self-hosted and pinned
python/pattern_model.py         reference copy of the loader the starters use
teacher/make_image_model.py     how the .tflite was made (needs TensorFlow, run once)
tests/test_trainer.py           end-to-end test (pictures) in headless Chromium, incl. browser-vs-Python match
tests/test_pose.py              end-to-end test (body poses)
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
python tests/test_trainer.py    # pictures; uses scikit-image sample photos
python tests/test_pose.py       # body poses
```

It uploads photos, records from a simulated webcam, trains, tests photos (including a rotated phone photo, a PNG
with transparency, greyscale and a very wide image), downloads the model, and checks Python's predictions match
the browser's.

## Acknowledgements

- **Inspired by** Google's [Teachable Machine](https://teachablemachine.withgoogle.com/) (Google Creative Lab): the
  collect, train, test and export flow, and the "Background noise" class for sounds.
- **Built on** Google's [MediaPipe](https://ai.google.dev/edge/mediapipe) (image, pose and sound models),
  [TensorFlow.js](https://www.tensorflow.org/js), MobileNetV2 and YAMNet. All Apache-2.0.
- **Design reference:** the open-source [Programmable Machine](https://github.com/DD-65/Programmable-Machine).
- **What's different here, and why:** models export to Python starters and give the same answers there; an accuracy
  check on held-back examples with a mix-up table; privacy by design (nothing leaves the computer, enforced by the
  browser); body poses and sounds that match exactly or closely between browser and Python.
- **Made with help from Claude** (Anthropic), with design, decisions and testing by Matthew Pham.

## Updating the libraries

Keep the browser's `@mediapipe/tasks-vision` version and the starters' `mediapipe` version the same, and re-run
the test after any update. A new image model needs a new file name (see `EXPORT_FORMAT.md`).
