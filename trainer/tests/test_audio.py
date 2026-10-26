"""
End-to-end test for the Pattern Trainer's Sounds mode (teacher/dev use).

  pip install playwright mediapipe pillow numpy && playwright install chromium
  python trainer/tests/test_audio.py

Uses made-up sounds (quiet background hiss, beeps, knocks) written as WAV files in several
formats, and a simulated microphone playing beeps. Checks uploads, Hold to record, Record one,
the live microphone view and predictions, test sounds, download, and that Python gives the same
answers as the browser for the same files.
"""
import os
import struct
import sys
import tempfile

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import test_trainer as T  # noqa: E402  (shared helpers)

check, wait_js = T.check, T.wait_js
rng = np.random.default_rng(5)


def write_wav(path, x, rate, channels=1, bits=16, fmt=1):
    """x: float samples in -1..1, shape (n,) or (n, channels)."""
    x = np.clip(np.asarray(x, dtype="float64"), -1, 1)
    if x.ndim == 1:
        x = np.repeat(x[:, None], channels, axis=1)
    if fmt == 3:
        body = x.astype("<f4").tobytes()
    elif bits == 8:
        body = np.round(x * 127 + 128).astype("u1").tobytes()
    elif bits == 16:
        body = np.round(x * 32767).astype("<i2").tobytes()
    elif bits == 24:
        v = np.round(x * 8388607).astype("<i4").reshape(-1)
        body = np.stack([(v & 0xFF), (v >> 8) & 0xFF, (v >> 16) & 0xFF], 1).astype("u1").tobytes()
    else:
        body = np.round(x * 2147483647).astype("<i4").tobytes()
    block = channels * bits // 8
    hdr = struct.pack("<4sI4s4sIHHIIHH4sI", b"RIFF", 36 + len(body), b"WAVE", b"fmt ", 16, fmt, channels,
                      rate, rate * block, block, bits, b"data", len(body))
    open(path, "wb").write(hdr + body)


def sound(kind, rate, seconds):
    t = np.arange(int(rate * seconds)) / rate
    bg = 0.01 * rng.standard_normal(t.size)
    if kind == "background":
        return bg * rng.uniform(1, 3)
    if kind == "beep":
        return 0.4 * np.sin(2 * np.pi * rng.uniform(700, 1500) * t) + bg
    x = bg.copy()                                   # knock: a few dull taps
    for start in np.arange(0.1, seconds - 0.1, 0.33):
        s, n = int((start + rng.uniform(0, 0.1)) * rate), int(0.04 * rate)
        burst = np.convolve(rng.standard_normal(n) * np.exp(-np.linspace(0, 8, n)), np.ones(40) / 40, "same") * 6
        x[s:s + n] += 0.7 * burst
    return x


def make_files(tmp):
    train = {}
    for kind in ["background", "knock"]:
        train[kind] = []
        for i in range(3):
            p = os.path.join(tmp, f"{kind}_{i}.wav")
            write_wav(p, sound(kind, 48000, 4.0), 48000)
            train[kind].append(p)
    tests = []
    for kind, rate, kw in [("beep", 16000, {}), ("knock", 44100, {"channels": 2}), ("background", 48000, {"bits": 24}),
                           ("beep", 22050, {"bits": 32, "fmt": 3}), ("knock", 8000, {"bits": 8}), ("beep", 48000, {})]:
        p = os.path.join(tmp, f"test_{kind}_{rate}_{kw.get('bits', 16)}{'f' if kw.get('fmt') == 3 else ''}"
                              f"{'_stereo' if kw.get('channels') == 2 else ''}.wav")
        write_wav(p, sound(kind, rate, 2.0), rate, **kw)
        tests.append((p, kind))
    mic = os.path.join(tmp, "mic_beeps.wav")      # the simulated microphone: steady beeping
    write_wav(mic, sound("beep", 48000, 10.0), 48000)
    not_wav = os.path.join(tmp, "song.mp3")
    open(not_wav, "wb").write(b"ID3 not really an mp3")
    return train, tests, mic, not_wav


def main():
    from playwright.sync_api import sync_playwright
    import pattern_model as pm

    tmp = tempfile.mkdtemp(prefix="trainer-audio-")
    train, tests, mic, not_wav = make_files(tmp)
    srv, port = T.serve()
    errors, preds = [], {}
    with sync_playwright() as p:
        b = p.chromium.launch(args=["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream",
                                    f"--use-file-for-fake-audio-capture={mic}",
                                    "--autoplay-policy=no-user-gesture-required"])
        ctx = b.new_context(accept_downloads=True, permissions=["microphone"])
        pg = ctx.new_page()
        pg.on("pageerror", lambda e: errors.append(f"pageerror: {e}"))
        pg.on("console", lambda m: errors.append(f"console.{m.type}: {m.text}") if m.type == "error" else None)
        pg.goto(f"http://127.0.0.1:{port}/index.html?mode=audio")
        wait_js(pg, "window.__trainer && window.__trainer.ready()")
        check(pg.locator("#loading").is_hidden(), "sound model loads")
        check(pg.locator('.mode-nav a[data-mode="audio"]').get_attribute("aria-current") == "page",
              "mode switch shows Sounds as current")
        cards = pg.locator(".class-card")
        check(cards.nth(0).locator(".class-name").input_value() == "Background noise",
              "first class starts as 'Background noise'")

        # Uploads: each full 0.975 s window of a 4 s file is one example (4 per file)
        cards.nth(1).locator(".class-name").fill("knock")
        for i, kind in enumerate(["background", "knock"]):
            cards.nth(i).locator(".upload").set_input_files(train[kind])
            wait_js(pg, f"document.querySelectorAll('.class-card')[{i}].querySelector('.card-msg').textContent.startsWith('Added')")
        n0 = int(cards.nth(0).locator(".count").text_content().split()[0])
        check(n0 == 12, f"three 4-second .wav files give 12 one-second examples ({n0})")
        tip = cards.nth(1).locator(".thumbs img").first.get_attribute("title")
        check(tip.startswith("YAMNet hears:"), f"example thumbnails say what YAMNet heard ({tip})")
        cards.nth(1).locator(".upload").set_input_files(not_wav)
        wait_js(pg, "document.querySelectorAll('.class-card')[1].querySelector('.card-msg').textContent.includes('only .wav')")
        check(True, "a non-.wav file is refused with a clear message")

        # Microphone: live waveform, Hold to record, Record one
        pg.click("#camera-btn")
        wait_js(pg, "window.__trainer.state.mic && window.__trainer.state.mic.filled > 48000", 20000)
        pg.wait_for_timeout(300)
        lit = pg.evaluate("""() => { const c = document.querySelector('#wave');
            const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
            let n = 0; for (let i = 0; i < d.length; i += 4) if (d[i + 2] > 100) n++; return n; }""")
        check(lit > 500, f"live waveform draws while the microphone is on ({lit} pixels)")
        rate = pg.evaluate("() => window.__trainer.state.mic.rate")
        pg.click("#add-class")
        cards.nth(2).locator(".class-name").fill("beep")
        cards.nth(2).locator(".record").hover()
        pg.mouse.down()
        pg.wait_for_timeout(3300)
        pg.mouse.up()
        n_hold = int(cards.nth(2).locator(".count").text_content().split()[0])
        check(n_hold >= 2, f"Hold to record makes one example per 0.975 s ({n_hold} in 3.3 s, mic at {rate} Hz)")
        cards.nth(2).locator(".record-one").click()
        wait_js(pg, f"parseInt(document.querySelectorAll('.class-card')[2].querySelector('.count').textContent) === {n_hold + 1}", 6000)
        check(True, "Record one adds exactly one example")
        for _ in range(3):   # a few more so every class can be checked
            cards.nth(2).locator(".record-one").click()
            wait_js(pg, "!document.querySelector('.record-one.active')", 6000)
            pg.wait_for_timeout(100)

        pg.click("#train-btn")
        wait_js(pg, "document.querySelector('#train-msg').textContent.startsWith('Trained on')", 120000)
        print("     ", pg.locator("#train-msg").text_content())
        print("     ", pg.locator("#check-msg").text_content(), "|", pg.locator("#check-mixup").text_content())
        check(pg.locator("#check").is_visible(), "accuracy panel works for sounds")

        pg.wait_for_timeout(800)
        live = pg.evaluate("() => window.__trainer.state.lastPrediction")
        check(bool(live) and max(live, key=live.get) == "beep", f"live microphone prediction hears the beeps ({live})")

        for path, _ in tests:
            pg.locator("#test-file").set_input_files(path)
            pg.wait_for_timeout(400)
            preds[os.path.basename(path)] = pg.evaluate("() => window.__trainer.state.lastPrediction")
        check(pg.locator("#back-to-camera").is_visible(), "'Back to microphone' appears after testing a sound")

        with pg.expect_download() as dl:
            pg.click("#export-btn")
        out = os.path.join(tmp, "my_audio_model.json")
        dl.value.save_as(out)
        check(dl.value.suggested_filename == "my_audio_model.json", "sound download is named my_audio_model.json")
        pg.set_viewport_size({"width": 1200, "height": 900})
        pg.screenshot(path=os.path.join(tmp, "audio.png"), full_page=True)
        b.close()
    srv.shutdown()

    real = [e for e in errors if "favicon" not in e and not e.startswith("console.error: INFO:")]
    check(not real, "no page errors" + ("" if not real else f": {real[:3]}"))

    pm.HERE = os.path.join(T.TRAINER, "models")
    model = pm.PatternModel.load(out)
    check(model.input_type == "audio" and model.classes == ["Background noise", "knock", "beep"],
          f"exported sound model loads in Python ({model.classes})")
    same, worst, right = 0, 0.0, 0
    names = {"background": "Background noise", "knock": "knock", "beep": "beep"}
    for path, kind in tests:
        py, br = model.predict(path), preds[os.path.basename(path)]
        diff = max(abs(py[k] - br[k]) for k in py)
        worst = max(worst, diff)
        same += max(py, key=py.get) == max(br, key=br.get)
        right += max(py, key=py.get) == names[kind]
        print(f"      {os.path.basename(path):34s} browser {max(br, key=br.get):17s} {max(br.values()):.3f}  "
              f"python {max(py, key=py.get):17s} {max(py.values()):.3f}  diff {diff:.5f}")
    check(same == len(tests), f"Python picks the same sound as the browser ({same}/{len(tests)})")
    check(worst < 0.01, f"Python and browser percentages match (largest difference {worst:.5f})")
    print(f"      (test sounds labelled correctly: {right}/{len(tests)})")
    # Gradio-style input: (rate, int16 samples)
    samples, rate = pm.read_wav(tests[0][0])
    g = model.predict((rate, np.round(samples * 32767).astype("int16")))
    check(max(g, key=g.get) == max(preds[os.path.basename(tests[0][0])], key=lambda k: preds[os.path.basename(tests[0][0])][k]),
          "Python accepts Gradio's (rate, samples) microphone format")
    print("screenshots and files in", tmp)
    print("ALL PASSED" if not T.failures else f"{len(T.failures)} FAILED")
    return 1 if T.failures else 0


if __name__ == "__main__":
    sys.exit(main())
