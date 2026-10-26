"""
End-to-end test for the Pattern Trainer (teacher/dev use).

  pip install playwright mediapipe pillow numpy && playwright install chromium
  python trainer/tests/test_trainer.py [path/to/folder/of/sample/photos]

What it does, in a real (headless) Chromium:
  1. Uploads photos for two classes, records a third class from a simulated webcam.
  2. Trains, tests held-out photos, downloads my_model.json.
  3. Loads that file with python/pattern_model.py and checks Python gives the SAME
     predictions as the browser for the same photos (including awkward ones:
     EXIF-rotated phone photo, PNG with transparency, greyscale, very wide image).
  4. Checks for page errors and that the page fits a phone-width screen.
Exit code 0 = all passed.
"""
import functools
import http.server
import json
import os
import sys
import tempfile
import threading

import numpy as np
from PIL import Image, ImageEnhance

HERE = os.path.dirname(os.path.abspath(__file__))
TRAINER = os.path.dirname(HERE)
sys.path.insert(0, os.path.join(TRAINER, "python"))
import pattern_model as pm  # noqa: E402

# The loader looks for the image model next to itself; point it at the trainer's copy.
MODEL = os.path.join(TRAINER, "models", "mobilenet_v2_embedder.tflite")

rng = np.random.default_rng(1)
failures = []


def check(ok, what):
    print(("PASS " if ok else "FAIL ") + what)
    if not ok:
        failures.append(what)


def wait_js(pg, expr, timeout=60000):
    """Poll a JS expression from Python. (page.wait_for_function compiles strings with eval,
    which the trainer's privacy lock correctly blocks.)"""
    import time
    end = time.time() + timeout / 1000
    while time.time() < end:
        if pg.evaluate(f"() => Boolean({expr})"):
            return
        pg.wait_for_timeout(100)
    raise TimeoutError(f"timed out waiting for: {expr}")


class _Quiet(http.server.SimpleHTTPRequestHandler):
    extensions_map = {**http.server.SimpleHTTPRequestHandler.extensions_map,
                      ".mjs": "text/javascript", ".wasm": "application/wasm",
                      ".tflite": "application/octet-stream", ".task": "application/octet-stream"}

    def log_message(self, *a):
        pass

    def handle(self):
        try:
            super().handle()
        except ConnectionResetError:   # the browser closing early is fine
            pass


def serve():
    """Serve the trainer folder on a free local port. Returns (server, port)."""
    srv = http.server.ThreadingHTTPServer(("127.0.0.1", 0), functools.partial(_Quiet, directory=TRAINER))
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    return srv, srv.server_address[1]


# ------------------------------------------------------------------ test photos
def sample_sources(folder):
    """Two 'classes' of source photos. Uses the folder given, else built-in sample images."""
    if folder:
        names = sorted(os.listdir(folder))
        a = [Image.open(os.path.join(folder, n)).convert("RGB") for n in names if "bottle" in n]
        b = [Image.open(os.path.join(folder, n)).convert("RGB") for n in names if "honey" in n]
        if a and b:
            return ("bottle", a), ("honey", b)
    import skimage.data as d
    return ("cat", [Image.fromarray(d.chelsea())]), ("coffee", [Image.fromarray(d.coffee())])


def variant(im):
    W, H = im.size
    f = rng.uniform(0.6, 1.0)
    w, h = int(W * f), int(H * f)
    x, y = int(rng.integers(0, W - w + 1)), int(rng.integers(0, H - h + 1))
    im = im.crop((x, y, x + w, y + h))
    if rng.random() < 0.5:
        im = im.transpose(Image.FLIP_LEFT_RIGHT)
    return ImageEnhance.Brightness(im).enhance(rng.uniform(0.7, 1.3))


def make_photos(tmp, folder):
    (na, srcs_a), (nb, srcs_b) = sample_sources(folder)
    train, tests = {}, []
    for name, srcs in [(na, srcs_a), (nb, srcs_b)]:
        paths = []
        for i in range(15):
            p = os.path.join(tmp, f"{name}_{i}.jpg")
            variant(srcs[i % len(srcs)]).save(p, quality=90)
            paths.append(p)
        train[name] = paths
        for i in range(3):
            p = os.path.join(tmp, f"test_{name}_{i}.jpg")
            variant(srcs[i % len(srcs)]).save(p, quality=90)
            tests.append(p)
    base = variant(srcs_a[0])
    # Phone photo stored sideways with an EXIF "rotate 90" tag (orientation 6)
    p = os.path.join(tmp, "test_exif_rotated.jpg")
    exif = Image.Exif()
    exif[0x0112] = 6
    base.rotate(90, expand=True).save(p, quality=90, exif=exif)
    tests.append(p)
    # PNG with see-through areas whose hidden colour is random noise (must count as white on both sides)
    p = os.path.join(tmp, "test_alpha.png")
    rgba = np.dstack([np.asarray(base), np.full(base.size[::-1], 255, np.uint8)])
    h, w = rgba.shape[:2]
    rgba[: h // 2, :, 3] = 0
    rgba[: h // 2, :, :3] = rng.integers(0, 256, (h // 2, w, 3))
    Image.fromarray(rgba, "RGBA").save(p)
    tests.append(p)
    # greyscale, very wide
    p = os.path.join(tmp, "test_grey.jpg")
    base.convert("L").save(p, quality=90)
    tests.append(p)
    p = os.path.join(tmp, "test_wide.jpg")
    wide = Image.new("RGB", (base.width * 3, base.height), (40, 40, 40))
    wide.paste(base, (base.width, 0))
    wide.save(p, quality=90)
    tests.append(p)
    return train, tests, srcs_b[0]


def make_fake_webcam(path, image, frames=60):
    """Write a .y4m video the fake camera plays on a loop."""
    W, H = 640, 480
    rgb = np.asarray(image.convert("RGB").resize((W, H))).astype(np.float32)
    r, g, b = rgb[..., 0], rgb[..., 1], rgb[..., 2]
    y = 0.299 * r + 0.587 * g + 0.114 * b
    u = (b - y) * 0.564 + 128
    v = (r - y) * 0.713 + 128
    Y = np.clip(y, 0, 255).astype(np.uint8)
    U = np.clip(u[::2, ::2], 0, 255).astype(np.uint8)
    V = np.clip(v[::2, ::2], 0, 255).astype(np.uint8)
    with open(path, "wb") as f:
        f.write(f"YUV4MPEG2 W{W} H{H} F30:1 Ip A1:1 C420jpeg\n".encode())
        for _ in range(frames):
            f.write(b"FRAME\n" + Y.tobytes() + U.tobytes() + V.tobytes())


# ------------------------------------------------------------------ run
def main():
    from playwright.sync_api import sync_playwright

    folder = sys.argv[1] if len(sys.argv) > 1 else None
    tmp = tempfile.mkdtemp(prefix="trainer-test-")
    train, tests, cam_src = make_photos(tmp, folder)
    cam = os.path.join(tmp, "webcam.y4m")
    make_fake_webcam(cam, cam_src)

    srv, port = serve()

    errors, browser_preds = [], {}
    with sync_playwright() as p:
        b = p.chromium.launch(args=["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream",
                                    f"--use-file-for-fake-video-capture={cam}"])
        ctx = b.new_context(accept_downloads=True, permissions=["camera"])
        pg = ctx.new_page()
        pg.on("pageerror", lambda e: errors.append(f"pageerror: {e}"))
        pg.on("console", lambda m: errors.append(f"console.{m.type}: {m.text}") if m.type == "error" else None)
        pg.goto(f"http://127.0.0.1:{port}/index.html")
        wait_js(pg, "window.__trainer && window.__trainer.ready()", timeout=60000)
        check(pg.locator("#loading").is_hidden(), "image model loads")
        check(pg.locator("#settings").is_hidden(), "test settings hidden by default")
        pg2 = ctx.new_page()
        pg2.goto(f"http://127.0.0.1:{port}/index.html?settings=1")
        check(pg2.locator("#settings").is_visible(), "test settings shown with ?settings=1")
        pg2.goto(f"http://127.0.0.1:{port}/privacy.html")
        check(pg2.locator("h1").text_content().startswith("Your privacy"), "privacy page loads")
        pg2.close()

        # Privacy lock: the page must not be able to send data to another site
        blocked = pg.evaluate("""fetch('https://example.com/upload', {method: 'POST', body: 'x'})
                                 .then(() => false, () => true)""")
        check(blocked, "privacy lock blocks sending data to another site")
        errors[:] = [e for e in errors if "Content Security Policy" not in e and "example.com" not in e]

        # From here on: no internet, and record every request the page makes
        requests_after_load = []
        pg.on("request", lambda r: requests_after_load.append(r.url)
              if not r.url.startswith(("data:", "blob:")) else None)
        ctx.set_offline(True)

        cards = pg.locator(".class-card")
        names = list(train)
        for i, name in enumerate(names):
            card = cards.nth(i)
            card.locator(".class-name").fill(name)
            card.locator(".upload").set_input_files(train[name])
            wait_js(pg, f"document.querySelectorAll('.class-card')[{i}].querySelector('.count').textContent.startsWith('{len(train[name])} ')", timeout=60000)
        check(True, "photo uploads add examples")

        # Upload buttons are reachable by keyboard
        tag = pg.evaluate("(() => { const i = document.querySelector('.upload'); i.focus(); return document.activeElement === i; })()")
        check(tag, "upload button can be reached by keyboard")

        # Third class from the webcam (double-click 'Turn on camera' must not leave it stuck)
        pg.dblclick("#camera-btn")
        wait_js(pg, "document.querySelector('#video').readyState >= 2", timeout=20000)
        pg.wait_for_timeout(500)
        cam_ok = pg.evaluate("Boolean(window.__trainer.state.stream) && document.querySelector('#camera-btn').textContent === 'Turn off camera'")
        check(cam_ok, "double-clicking 'Turn on camera' starts it cleanly")
        pg.click("#add-class")
        cam_card = cards.nth(2)
        cam_card.locator(".class-name").fill("webcam")
        btn = cam_card.locator(".record")
        btn.hover()
        pg.mouse.down()
        pg.wait_for_timeout(1500)
        pg.mouse.up()
        n_cam = int(cam_card.locator(".count").text_content().split()[0])
        check(n_cam >= 5, f"hold-to-record captures webcam frames ({n_cam} in 1.5 s)")

        # Duplicate-name guard
        cam_card.locator(".class-name").fill(names[0].upper())
        check(pg.locator("#train-btn").is_disabled(), "duplicate class names block training")
        cam_card.locator(".class-name").fill("webcam")

        pg.click("#train-btn")
        wait_js(pg, "document.querySelector('#train-msg').textContent.startsWith('Trained on')", timeout=120000)
        print("     ", pg.locator("#train-msg").text_content())

        # Accuracy check on held-back examples
        chk = pg.evaluate("() => window.__trainer.state.check")
        counts = [len(train[n]) for n in names] + [n_cam]
        expected = sum(max(1, round(n * 0.2)) for n in counts)
        check(chk is not None and chk["total"] == expected and sum(map(sum, chk["matrix"])) == expected,
              f"accuracy check holds back newest 20% per class ({chk and chk['correct']}/{chk and chk['total']} right, expected {expected} held back)")
        check(pg.locator("#check").is_visible() and pg.locator("#confusion tbody tr").count() == 3,
              "accuracy panel shows a 3x3 mix-up table")
        print("     ", pg.locator("#check-msg").text_content(), "|", pg.locator("#check-mixup").text_content())

        pg.wait_for_timeout(600)
        live = pg.evaluate("window.__trainer.state.lastPrediction")
        check(bool(live) and max(live, key=live.get) == "webcam", f"live camera preview predicts 'webcam' ({live and max(live.values()):.2f})")

        for t in tests:
            pg.locator("#test-file").set_input_files(t)
            pg.wait_for_timeout(300)
            browser_preds[os.path.basename(t)] = pg.evaluate("window.__trainer.state.lastPrediction")

        check(pg.locator("#back-to-camera").is_visible(), "'Back to camera' appears after testing a photo")
        pg.click("#back-to-camera")
        pg.wait_for_timeout(600)
        live = pg.evaluate("window.__trainer.state.lastPrediction")
        check(max(live, key=live.get) == "webcam", "live preview resumes after 'Back to camera'")

        with pg.expect_download() as dl:
            pg.click("#export-btn")
        out = os.path.join(tmp, "my_model.json")
        dl.value.save_as(out)
        check(dl.value.suggested_filename == "my_model.json", "download is named my_model.json")

        # Changing data marks the model out of date
        cards.nth(0).locator(".class-name").fill(names[0] + "s")
        check(pg.locator("#export-btn").is_disabled(), "renaming a class after training blocks download until retrained")

        # Retraining keeps memory flat and the bars pick up the new name
        def train_once():
            pg.click("#train-btn")
            wait_js(pg, "document.querySelector('#train-msg').textContent.startsWith('Trained on')", timeout=120000)
        train_once()
        t1 = pg.evaluate("tf.memory().numTensors")
        train_once()
        train_once()
        t3 = pg.evaluate("tf.memory().numTensors")
        check(t3 == t1, f"retraining doesn't leak memory ({t1} -> {t3} tensors)")
        pg.locator("#test-file").set_input_files(tests[0])
        pg.wait_for_timeout(300)
        bar_names = pg.locator(".bar-row .name").all_text_contents()
        check(bar_names[0] == names[0] + "s", f"bars show renamed class after retraining ({bar_names})")
        cards.nth(0).locator(".class-name").fill(names[0])

        check(not requests_after_load,
              "works offline after loading and makes no network requests"
              + ("" if not requests_after_load else f": {requests_after_load[:3]}"))
        ctx.set_offline(False)

        # Too few examples for a check: friendly message instead of a score
        pg3 = ctx.new_page()
        pg3.goto(f"http://127.0.0.1:{port}/index.html")
        wait_js(pg3, "window.__trainer && window.__trainer.ready()")
        for i, name in enumerate(names):
            pg3.locator(".class-card").nth(i).locator(".upload").set_input_files(train[name][:3])
            wait_js(pg3, f"document.querySelectorAll('.class-card')[{i}].querySelector('.count').textContent.startsWith('3 ')")
        pg3.click("#train-btn")
        wait_js(pg3, "document.querySelector('#train-msg').textContent.startsWith('Trained on')", 120000)
        msg = pg3.locator("#check-msg").text_content()
        check(msg.startswith("Add at least 5") and pg3.locator("#confusion").is_hidden(),
              "with under 5 examples per class, the panel explains instead of scoring")
        pg3.close()

        # Phone width
        pg.set_viewport_size({"width": 390, "height": 844})
        pg.wait_for_timeout(200)
        sw, iw = pg.evaluate("[document.documentElement.scrollWidth, window.innerWidth]")
        check(sw <= iw, f"fits phone width without sideways scrolling ({sw} <= {iw})")
        pg.screenshot(path=os.path.join(tmp, "phone.png"), full_page=True)
        pg.set_viewport_size({"width": 1200, "height": 900})
        pg.screenshot(path=os.path.join(tmp, "desktop.png"), full_page=True)
        b.close()
    srv.shutdown()

    # MediaPipe prints its own start-up info ("INFO: Created TensorFlow Lite XNNPACK delegate...")
    # on the error channel; that's harmless.
    real = [e for e in errors if "favicon" not in e and not e.startswith("console.error: INFO:")]
    check(not real, "no page errors" + ("" if not real else f": {real[:3]}"))

    # Python side
    pm.HERE = os.path.dirname(MODEL)
    model = pm.PatternModel.load(out)
    check(model.classes == names + ["webcam"], f"exported classes {model.classes}")
    tr = json.load(open(out))["training"]
    check("check_correct" in tr and "check_total" in tr, f"download records the accuracy check ({tr.get('check_correct')}/{tr.get('check_total')})")
    worst, same = 0.0, 0
    for t in tests:
        py = model.predict(Image.open(t))
        br = browser_preds[os.path.basename(t)]
        diff = max(abs(py[k] - br[k]) for k in py)
        worst = max(worst, diff)
        same += max(py, key=py.get) == max(br, key=br.get)
        print(f"      {os.path.basename(t):24s} browser {max(br, key=br.get):8s} {max(br.values()):.4f}  "
              f"python {max(py, key=py.get):8s} {max(py.values()):.4f}  diff {diff:.6f}")
    check(same == len(tests), f"Python picks the same class as the browser ({same}/{len(tests)})")
    check(worst < 1e-3, f"Python and browser percentages match (largest difference {worst:.6f})")
    print("screenshots and files in", tmp)
    print("ALL PASSED" if not failures else f"{len(failures)} FAILED")
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main())
