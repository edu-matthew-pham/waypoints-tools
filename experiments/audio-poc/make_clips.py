"""Make synthetic test clips (beep, hiss, whistle, knock) as 16-bit mono WAV, mostly 16 kHz plus a few 44.1 kHz."""
import json, os, wave
import numpy as np

D = os.path.join(os.path.dirname(os.path.abspath(__file__)), "web", "clips")
os.makedirs(D, exist_ok=True)
rng = np.random.default_rng(3)


def save(name, x, sr):
    x = np.clip(x, -1, 1)
    with wave.open(f"{D}/{name}.wav", "wb") as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(sr)
        w.writeframes((x * 32767).astype("<i2").tobytes())


def clip(kind, sr, dur=1.0):
    t = np.arange(int(sr * dur)) / sr
    if kind == "beep":
        x = 0.5 * np.sin(2 * np.pi * rng.uniform(500, 2000) * t)
    elif kind == "hiss":
        x = 0.3 * rng.standard_normal(t.size)
    elif kind == "whistle":
        f0, f1 = rng.uniform(800, 1200), rng.uniform(2000, 3000)
        x = 0.5 * np.sin(2 * np.pi * (f0 * t + (f1 - f0) * t ** 2 / (2 * dur)))
    else:  # knock
        x = np.zeros(t.size)
        for _ in range(rng.integers(2, 5)):
            s, n = int(rng.uniform(0.05, 0.85) * sr), int(0.04 * sr)
            x[s:s + n] += rng.standard_normal(n) * np.exp(-np.linspace(0, 8, n)) * 0.8
    return x * rng.uniform(0.6, 1.0)


names = []
for kind in ["beep", "hiss", "whistle", "knock"]:
    for i in range(16):
        save(f"{kind}_{i}", clip(kind, 16000), 16000); names.append(f"{kind}_{i}")
for kind in ["beep", "knock"]:
    for i in range(2):
        save(f"{kind}_44k_{i}", clip(kind, 44100), 44100); names.append(f"{kind}_44k_{i}")
json.dump(names, open(os.path.join(D, "..", "names.json"), "w"))
print(len(names), "clips")
