"""
End-to-end test for the Pattern Trainer's Body poses mode (teacher/dev use).

  pip install playwright mediapipe pillow numpy scikit-image && playwright install chromium
  python trainer/tests/test_pose.py

Uses public-domain photos of people from scikit-image (astronaut, cameraman):
  * "upright" vs "leaning" classes made by rotating the photos
  * a photo with nobody in it (coffee) must be skipped / reported
  * a simulated webcam showing a person: the skeleton overlay draws and recording works
Then trains, downloads my_model.json, and checks Python picks the same class as the browser
with percentages close (pose points match closely but not exactly between browser and Python).
"""
import os
import sys
import tempfile

import numpy as np
from PIL import Image, ImageEnhance

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import test_trainer as T  # noqa: E402  (shared helpers: check, wait_js, make_fake_webcam, server)

check, wait_js = T.check, T.wait_js
rng = np.random.default_rng(7)


def people():
    import skimage.data as d
    return [Image.fromarray(d.astronaut()), Image.fromarray(np.stack([d.camera()] * 3, -1))]


def variant(im, angle):
    W, H = im.size
    f = rng.uniform(0.8, 1.0)
    w, h = int(W * f), int(H * f)
    x, y = int(rng.integers(0, W - w + 1)), int(rng.integers(0, H - h + 1))
    im = im.crop((x, y, x + w, y + h)).rotate(angle, resample=Image.BILINEAR, fillcolor=(255, 255, 255))
    return ImageEnhance.Brightness(im).enhance(rng.uniform(0.8, 1.2))


def make_photos(tmp):
    srcs = people()
    train, tests = {"upright": [], "leaning": []}, []
    for cls, lo, hi in [("upright", -4, 4), ("leaning", 22, 32)]:
        for i in range(12):
            p = os.path.join(tmp, f"{cls}_{i}.jpg")
            variant(srcs[i % 2], rng.uniform(lo, hi)).save(p, quality=90)
            train[cls].append(p)
        for i in range(3):
            p = os.path.join(tmp, f"test_{cls}_{i}.jpg")
            variant(srcs[i % 2], rng.uniform(lo, hi)).save(p, quality=90)
            tests.append(p)
    import skimage.data as d
    nobody = os.path.join(tmp, "nobody.jpg")
    Image.fromarray(d.coffee()).save(nobody, quality=90)
    # the simulated webcam shows a person leaning the other way: a third, distinct pose
    return train, tests, nobody, srcs[0].rotate(-28, resample=Image.BILINEAR, fillcolor=(255, 255, 255))


def main():
    from playwright.sync_api import sync_playwright
    import pattern_model as pm

    tmp = tempfile.mkdtemp(prefix="trainer-pose-")
    train, tests, nobody, cam_src = make_photos(tmp)
    cam = os.path.join(tmp, "webcam.y4m")
    T.make_fake_webcam(cam, cam_src)
    srv, port = T.serve()

    errors, preds = [], {}
    with sync_playwright() as p:
        b = p.chromium.launch(args=["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream",
                                    f"--use-file-for-fake-video-capture={cam}"])
        ctx = b.new_context(accept_downloads=True, permissions=["camera"])
        pg = ctx.new_page()
        pg.on("pageerror", lambda e: errors.append(f"pageerror: {e}"))
        pg.on("console", lambda m: errors.append(f"console.{m.type}: {m.text}") if m.type == "error" else None)
        pg.goto(f"http://127.0.0.1:{port}/index.html?mode=pose")
        wait_js(pg, "window.__trainer && window.__trainer.ready()")
        check(pg.locator("#loading").is_hidden(), "pose model loads")
        check(pg.locator('.mode-nav a[data-mode="pose"]').get_attribute("aria-current") == "page",
              "mode switch shows Body poses as current")
        pg2 = ctx.new_page()
        pg2.goto(f"http://127.0.0.1:{port}/index.html?mode=pose&settings=1")
        wait_js(pg2, "document.querySelector('.mode-nav a').getAttribute('href') === './?settings=1'", 20000)
        check(pg2.locator("#set-hidden").input_value() == "64", "pose mode uses its own defaults; mode links keep ?settings=1")
        pg2.close()

        cards = pg.locator(".class-card")
        for i, (name, files) in enumerate(train.items()):
            cards.nth(i).locator(".class-name").fill(name)
            cards.nth(i).locator(".upload").set_input_files(files + ([nobody] if i == 0 else []))
            wait_js(pg, f"document.querySelectorAll('.class-card')[{i}].querySelector('.card-msg').textContent.startsWith('Added')")
        n0 = int(cards.nth(0).locator(".count").text_content().split()[0])
        msg0 = cards.nth(0).locator(".card-msg").text_content()
        check(n0 < len(train["upright"]) + 1 and "No person found in" in msg0,
              f"photos with nobody found are skipped with a message ({n0} of {len(train['upright']) + 1} kept: {msg0})")
        thumb = cards.nth(0).locator(".thumbs img").first.get_attribute("src")
        check(thumb.startswith("data:image/jpeg"), "pose thumbnails are generated (stick figures)")

        # Webcam: overlay draws the skeleton; recording adds examples
        pg.click("#camera-btn")
        wait_js(pg, "document.querySelector('#video').readyState >= 2", 20000)
        pg.wait_for_timeout(800)
        drawn = pg.evaluate("""() => { const c = document.querySelector('#overlay');
            const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
            let n = 0; for (let i = 3; i < d.length; i += 4) if (d[i]) n++; return n; }""")
        check(drawn > 200, f"skeleton overlay draws on the camera view ({drawn} pixels)")
        pg.click("#add-class")
        cards.nth(2).locator(".class-name").fill("other way")
        cards.nth(2).locator(".record").hover()
        pg.mouse.down()
        pg.wait_for_timeout(1500)
        pg.mouse.up()
        n_cam = int(cards.nth(2).locator(".count").text_content().split()[0])
        drawn_rec = pg.evaluate("""() => { const c = document.querySelector('#overlay');
            const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
            let n = 0; for (let i = 3; i < d.length; i += 4) if (d[i]) n++; return n; }""")
        check(drawn_rec > 200, "skeleton keeps drawing while recording")
        check(n_cam >= 5, f"hold-to-record captures poses from the webcam ({n_cam})")

        pg.click("#train-btn")
        wait_js(pg, "document.querySelector('#train-msg').textContent.startsWith('Trained on')", 120000)
        print("     ", pg.locator("#train-msg").text_content())
        print("     ", pg.locator("#check-msg").text_content())
        check(pg.locator("#check").is_visible(), "accuracy panel works in pose mode")

        for t in tests:
            pg.locator("#test-file").set_input_files(t)
            pg.wait_for_timeout(300)
            preds[os.path.basename(t)] = pg.evaluate("() => window.__trainer.state.lastPrediction")
        pg.locator("#test-file").set_input_files(nobody)
        pg.wait_for_timeout(300)
        check(pg.locator("#bars").text_content().startswith("No person found"), "test photo with nobody says so")

        with pg.expect_download() as dl:
            pg.click("#export-btn")
        out = os.path.join(tmp, "my_pose_model.json")
        dl.value.save_as(out)
        check(dl.value.suggested_filename == "my_pose_model.json", "pose download is named my_pose_model.json")
        pg.set_viewport_size({"width": 1200, "height": 900})
        pg.screenshot(path=os.path.join(tmp, "pose.png"), full_page=True)
        b.close()
    srv.shutdown()

    real = [e for e in errors if "favicon" not in e and not e.startswith("console.error: INFO:")]
    check(not real, "no page errors" + ("" if not real else f": {real[:3]}"))

    pm.HERE = os.path.join(T.TRAINER, "models")
    model = pm.PatternModel.load(out)
    check(model.input_type == "pose" and model.classes == ["upright", "leaning", "other way"],
          f"exported pose model loads in Python ({model.classes})")
    same, worst = 0, 0.0
    for t in tests:
        py, br = model.predict(Image.open(t)), preds[os.path.basename(t)]
        if py is None or br is None:
            agree = py is None and br is None
            same += agree
            print(f"      {os.path.basename(t):20s} nobody found by: browser={br is None} python={py is None}")
            continue
        diff = max(abs(py[k] - br[k]) for k in py)
        worst = max(worst, diff)
        same += max(py, key=py.get) == max(br, key=br.get)
        print(f"      {os.path.basename(t):20s} browser {max(br, key=br.get):8s} {max(br.values()):.3f}  "
              f"python {max(py, key=py.get):8s} {max(py.values()):.3f}  diff {diff:.4f}")
    check(same == len(tests), f"Python picks the same pose as the browser ({same}/{len(tests)})")
    check(worst < 0.05, f"Python and browser percentages are close (largest difference {worst:.4f})")
    check(model.top(Image.open(nobody)) == (None, 0.0), "Python: nobody in the picture gives (None, 0.0)")
    print("screenshots and files in", tmp)
    print("ALL PASSED" if not T.failures else f"{len(T.failures)} FAILED")
    return 1 if T.failures else 0


if __name__ == "__main__":
    sys.exit(main())
