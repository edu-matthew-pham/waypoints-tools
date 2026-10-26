"""Compare browser (browser.json from run_browser.py) with Python MediaPipe on the same clips."""
import json, os, sys, wave
import numpy as np
import mediapipe as mp
from mediapipe.tasks import python as mpt
from mediapipe.tasks.python import audio
from mediapipe.tasks.python.components.containers import audio_data as ad

D = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(D, "..", "..", "trainer", "python"))
import pattern_model as pm  # noqa: E402  (reuses its numpy head)

br = json.load(open(f"{D}/browser.json"))
names = json.load(open(f"{D}/web/names.json"))
clf = audio.AudioClassifier.create_from_options(audio.AudioClassifierOptions(
    base_options=mpt.BaseOptions(model_asset_path=f"{D}/web/yamnet.tflite"), max_results=-1,
    running_mode=audio.RunningMode.AUDIO_CLIPS))


def read(n):
    with wave.open(f"{D}/web/clips/{n}.wav") as w:
        return np.frombuffer(w.readframes(w.getnframes()), "<i2").astype(np.float32) / 32768, w.getframerate()


def scores(x, sr):  # 521 YAMNet scores, averaged over 0.975 s windows
    res = clf.classify(ad.AudioData.create_from_array(x, sr))
    v = np.zeros(521)
    for r in res:
        for c in r.classifications[0].categories:
            v[c.index] += c.score / len(res)
    return v


py = {n: scores(*read(n)) for n in names}
print("python mediapipe", mp.__version__)
raw = [np.abs(py[n] - br["raw"][n]["v"]).max() for n in names]
print(f"same samples both sides: max diff {max(raw):.6f}, median {np.median(raw):.6f}")
for label, sel in [("16 kHz", [n for n in names if "44k" not in n]), ("44.1 kHz", [n for n in names if "44k" in n])]:
    dec = [np.abs(py[n] - br["decoded"][n]["v"]).max() for n in sel]
    print(f"browser decodeAudioData (resampled to {br['ctxRate']} Hz) vs python, {label} files: "
          f"max diff {max(dec):.4f}, median {np.median(dec):.4f}")
spec = br["head"]
spec["input"] = {"type": "image", "preprocess": pm.IMAGE_PREPROCESS_ID, "embedding": {"model": "-", "dim": 521}}
m = pm.PatternModel(spec)
same = sum(int(np.argmax(list(m.predict_embedding(py[t["n"]].astype(np.float32)).values())) == np.argmax(t["probs"]))
           for t in br["test"])
right = sum(int(np.argmax(t["probs"]) == t["ci"]) for t in br["test"])
print(f"4-class head trained in browser: {right}/{len(br['test'])} right; python agrees {same}/{len(br['test'])}")
