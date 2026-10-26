# Audio proof of concept (not part of the trainer yet)

Question: can the Pattern Trainer's pattern (browser turns input into numbers, trains a small model, Python
reproduces it) work for sound, using MediaPipe's YAMNet model on both sides?

**Answer: yes, with one rule.** Tested 2026-10-27, Chromium + `@mediapipe/tasks-audio` 1.1.1, Python
`mediapipe` 1.1.1.

| Check | Result |
|---|---|
| Same audio samples given to both sides | Match: median difference 0, largest 0.006 (scores are 0 to 1) |
| Small 4-class model (beep, hiss, whistle, knock) trained in the browser, run in Python | 16/16 test clips right; Python agrees 16/16, identical percentages |
| Browser decodes a 16 kHz WAV itself (`decodeAudioData` resamples to 44.1 kHz) | **Mismatch**: median 0.06, up to 0.38; YAMNet's top sound differs on 23 of 68 clips |
| Browser decodes a 44.1 kHz WAV (no resampling) | Match: largest 0.006 |

**The rule:** always give MediaPipe the audio at its *original* sample rate and let MediaPipe resample. Never let
the browser resample: parse WAV files directly (as `web/index.html` does), and for the microphone pass the
`AudioContext`'s own sample rate. In Python, Gradio's microphone gives `(rate, samples)`; pass both straight
through.

**Things learned along the way:**

- Python MediaPipe has **no AudioEmbedder**, only `AudioClassifier` (both 0.10.32 and 1.1.1), so the features
  are YAMNet's 521 sound-category scores (all of them, `max_results=-1`), averaged over 0.975 s windows. The
  browser's `AudioClassifier` gives the same scores.
- `yamnet.tflite` (4.1 MB, the MediaPipe audio-classifier version) came from npm packages because Google's
  download is blocked here. Two copies differed only in 23 metadata bytes (author "TensorFlow" vs "MediaPipe");
  weights and outputs were identical. SHA-256 of the copy used:
  `4d8b4a53282dc83ef04e3e7dbc4fbc98082e34e44ed798e16c3a0cdd4c584faf`. Get the official file from Google's
  MediaPipe Audio Classifier page before building on it.
- Synthetic test sounds only. Real recordings (claps, voices, instruments) still need testing.

## Re-running

1. Put `yamnet.tflite`, `audio_bundle.mjs`, and `wasm/audio_wasm_internal.*` + `wasm/audio_wasm_nosimd_internal.*`
   (from the `@mediapipe/tasks-audio` npm package) and `tf.min.js` + `export.js` (the `exportHead` sketch from
   `trainer/EXPORT_FORMAT.md`) into `web/`.
2. `python make_clips.py`, then `python run_browser.py` (Playwright), then `python compare.py`.

## If this becomes a trainer mode

- Record with the microphone in ~1 s clips (hold to record), show a live level meter, and keep only the 521
  scores (no audio stored), like pose mode keeps only points.
- New `input.type: "audio"`, recipe ID e.g. `mediapipe-yamnet-scores-mean-v1`; loader support plus an
  `audio_pattern_trainer.py` starter using `gr.Audio(sources=["microphone", "upload"])`.
- Test with real classroom sounds and with Gradio's microphone input before committing.
