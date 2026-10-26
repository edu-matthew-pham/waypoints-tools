# Third-party files

Self-hosted so the trainer works without a CDN and the versions stay pinned.

| File | Package | Version | Licence |
|---|---|---|---|
| `tf.min.js` | [`@tensorflow/tfjs`](https://www.npmjs.com/package/@tensorflow/tfjs) | 4.22.0 | Apache-2.0 |
| `mediapipe/vision_bundle.mjs`, `mediapipe/wasm/*` | [`@mediapipe/tasks-vision`](https://www.npmjs.com/package/@mediapipe/tasks-vision) | 1.1.1 | Apache-2.0 |
| `mediapipe-audio/audio_bundle.mjs`, `mediapipe-audio/wasm/*` | [`@mediapipe/tasks-audio`](https://www.npmjs.com/package/@mediapipe/tasks-audio) | 1.1.1 | Apache-2.0 |

`../models/mobilenet_v2_embedder.tflite` is MobileNetV2 with ImageNet weights (Keras Applications, Apache-2.0),
converted by `../teacher/make_image_model.py`. `../models/pose_landmarker_lite.task` and `../models/yamnet.tflite` are
Google's MediaPipe models (Apache-2.0).

To update: `npm install @tensorflow/tfjs@<version> @mediapipe/tasks-vision@<version>`, copy `dist/tf.min.js`,
`vision_bundle.mjs`, and `wasm/vision_wasm_internal.*` + `wasm/vision_wasm_nosimd_internal.*`, then run
`../tests/test_trainer.py`. Pin the starters' Python `mediapipe` to the same version as `tasks-vision`.
