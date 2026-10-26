# Pattern Trainer

A small browser tool for learning how image classifiers work (aimed at about Years 9–10). Students collect example photos for their own
classes, train a model in the browser, test it, and download `my_model.json` to use in the Python/Gradio starters.
Nothing is uploaded: photos and training stay on the student's computer.

**Use it:** https://tools.learningwaypoints.com/trainer/
Three modes: **Pictures** (default), **Body poses** (`?mode=pose`) and **Sounds** (`?mode=audio`). Add `?settings=1` to show test settings
(hidden units, epochs, learning rate, batch size), e.g. `?mode=audio&settings=1`.

## How it works

| Step | What happens |
|---|---|
| Collect | Each photo or webcam frame is cut to its centre square. **Pictures:** MediaPipe turns it into 1280 numbers using `models/mobilenet_v2_embedder.tflite` (the standard MobileNetV2 with ImageNet weights). **Body poses:** MediaPipe finds 33 body points with `models/pose_landmarker_lite.task`, turned into 66 numbers (centred on the hips, scaled by torso length); only the points are kept. **Sounds:** each 0.975 s of microphone or .wav sound becomes YAMNet's 521 sound scores (`models/yamnet.tflite`); the sound itself isn't kept. |
| Train | TF.js trains a small model on those numbers. Pictures: one hidden layer of 16, 30 rounds (epochs), learning rate 0.001. Poses: 64, 50 rounds, 0.003. Sounds: 64, 50 rounds, 0.01. Batches of 16. First it holds back the newest 20% of each class to show an accuracy check and a mix-up table, then trains on everything. Takes a few seconds. |
| Test | Live webcam or microphone preview (body points drawn in pose mode, waveform in sound mode), or test a photo or .wav file. |
| Download | `my_model.json` (or `my_pose_model.json`, `my_audio_model.json`): the small trained part, class names and a self-check. Format: [`EXPORT_FORMAT.md`](EXPORT_FORMAT.md). |
| Save / Open project | `my_project.json` (or `my_pose_project.json`, `my_audio_project.json`): class names, each example's numbers and the small previews, to carry on next lesson. Not the trained model; train again after opening. |

The [Python starter](https://github.com/edu-matthew-pham/pattern-detector-starters) loads that file with [`python/pattern_model.py`](python/pattern_model.py), using MediaPipe and the
same `.tflite` file, so Python gives the same answers as the browser. Students need `pip install mediapipe pillow`;
no TensorFlow.

## Folder

```
index.html, app.js, style.css   the tool (plain HTML/JS, no build step)
models/                         mobilenet_v2_embedder.tflite (9 MB), pose_landmarker_lite.task (5.8 MB), yamnet.tflite (4.1 MB); shared with the Python starters
audio.js, audio-worklet.js      sound mode: microphone capture, WAV reading, YAMNet scores
vendor/                         TF.js 4.22.0, MediaPipe tasks-vision and tasks-audio 1.1.1, self-hosted and pinned
python/pattern_model.py         reference copy of the loader the starters use
teacher/make_image_model.py     how the .tflite was made (needs TensorFlow, run once)
tests/test_trainer.py           end-to-end test (pictures) in headless Chromium, incl. browser-vs-Python match
tests/test_pose.py              end-to-end test (body poses)
tests/test_audio.py             end-to-end test (sounds), with a simulated microphone
tests/test_project.py           Save project / Open project in all three modes
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
python tests/test_audio.py      # sounds
```

It uploads photos, records from a simulated webcam, trains, tests photos (including a rotated phone photo, a PNG
with transparency, greyscale and a very wide image), downloads the model, and checks Python's predictions match
the browser's.

## Updating the libraries

Keep the browser's `@mediapipe/tasks-vision` version and the starters' `mediapipe` version the same, and re-run
the test after any update. A new image model needs a new file name (see `EXPORT_FORMAT.md`).
