"""
End-to-end test for Save project / Open project, in all three modes (teacher/dev use).

  pip install playwright mediapipe pillow numpy scikit-image && playwright install chromium
  python trainer/tests/test_project.py

For each mode: add examples by upload, save the project, open it in a fresh page and check the
classes, numbers and previews come back exactly; then train and check it works. Also checks the
refusals (a model file, a project from another mode, a damaged file) leave the current work alone,
the "replaces your examples" warning, and that the Python loader refuses a project file kindly.
"""
import base64
import json
import os
import sys
import tempfile

import numpy as np
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import test_trainer as T  # noqa: E402  (shared helpers)
import test_audio as A    # noqa: E402  (wav helpers)
import pattern_model as pm  # noqa: E402

check, wait_js = T.check, T.wait_js
STATE = "window.__trainer.state"
COUNTS = f"{STATE}.classes.map(c => c.examples.length)"


def make_files(tmp):
    import skimage.data as d
    rng = np.random.default_rng(3)
    files = {}
    srcs = [Image.fromarray(d.chelsea()), Image.fromarray(d.coffee())]
    files["image"] = [[], []]
    for k, im in enumerate(srcs):
        for i in range(6):
            p = os.path.join(tmp, f"img_{k}_{i}.jpg")
            T.variant(im).save(p, quality=90)
            files["image"][k].append(p)
    person = Image.fromarray(d.astronaut())
    files["pose"] = [[], []]
    for k, angle in enumerate([0, 28]):
        for i in range(6):
            p = os.path.join(tmp, f"pose_{k}_{i}.jpg")
            person.rotate(angle + rng.uniform(-3, 3), fillcolor=(255, 255, 255)).save(p, quality=90)
            files["pose"][k].append(p)
    files["audio"] = [[], []]
    for k, kind in enumerate(["background", "beep"]):
        p = os.path.join(tmp, f"snd_{kind}.wav")
        A.write_wav(p, A.sound(kind, 16000, 6.0), 16000)
        files["audio"][k].append(p)
    return files


def snapshot(pg):
    """Class names, every example's numbers (as base64) and previews, straight from the page."""
    return json.loads(pg.evaluate("() => window.__trainer.projectJSON()"))["classes"]


def run_mode(ctx, port, mode, files, tmp, other_project, model_file):
    q = "" if mode == "image" else f"?mode={mode}"
    pg = ctx.new_page()
    errors = []
    pg.on("pageerror", lambda e: errors.append(str(e)))
    pg.goto(f"http://127.0.0.1:{port}/index.html{q}")
    wait_js(pg, "window.__trainer && window.__trainer.ready()", 90000)
    check(pg.locator("#save-project").is_disabled(), f"[{mode}] Save project is off until there are examples")
    cards = pg.locator(".class-card")
    for i, fs in enumerate(files):
        cards.nth(i).locator(".class-name").fill(f"{mode} class {i + 1}")
        cards.nth(i).locator(".upload").set_input_files(fs)
        wait_js(pg, f"document.querySelectorAll('.class-card')[{i}].querySelector('.card-msg').textContent.startsWith('Added')", 90000)
    before = snapshot(pg)
    counts = [len(c["examples"]) for c in before]

    with pg.expect_download() as dl:
        pg.click("#save-project")
    saved = os.path.join(tmp, f"saved_{mode}.json")
    dl.value.save_as(saved)
    expect_name = {"image": "my_project.json", "pose": "my_pose_project.json", "audio": "my_audio_project.json"}[mode]
    check(dl.value.suggested_filename == expect_name, f"[{mode}] project downloads as {dl.value.suggested_filename}")
    msg = pg.locator("#project-msg").text_content()
    check(msg.startswith("Saved") and (("previews of your photos" in msg) == (mode == "image")),
          f"[{mode}] save message (photo warning only for pictures): {msg[:60]}…")
    spec = json.load(open(saved))
    dim = {"image": 1280, "pose": 66, "audio": 521}[mode]
    raw = np.frombuffer(base64.b64decode(spec["classes"][0]["examples"][0]), "<f4")
    check(raw.size == dim and np.isfinite(raw).all(), f"[{mode}] examples decode in numpy as {raw.size} numbers")

    # A fresh page: open the project, everything comes back exactly
    pg.close()
    pg = ctx.new_page()
    pg.on("pageerror", lambda e: errors.append(str(e)))
    pg.goto(f"http://127.0.0.1:{port}/index.html{q}")
    wait_js(pg, "window.__trainer && window.__trainer.ready()", 90000)
    pg.locator("#open-project").set_input_files(saved)
    wait_js(pg, "document.querySelector('#project-msg').textContent.startsWith('Opened')")
    after = snapshot(pg)
    check(after == before, f"[{mode}] opened project matches exactly: names, numbers, previews ({counts})")
    check(pg.locator(".class-card").nth(0).locator(".thumbs img").count() == min(24, counts[0]),
          f"[{mode}] previews show after opening")

    # Refusals leave the work alone (saved, so no "replaces" warning yet)
    for path, want in [(model_file, "That's a model file"), (other_project, "Switch to"),
                       (os.path.join(tmp, "damaged.json"), "damaged")]:
        pg.locator("#open-project").set_input_files(path)
        wait_js(pg, f"document.querySelector('#project-msg').textContent.includes({json.dumps(want)})")
        check(pg.evaluate(f"() => {COUNTS}") == counts, f"[{mode}] refuses {os.path.basename(path)} and keeps the work ('{want}')")

    # A file with an oversized preview, and one with a 5000-letter name
    spec2 = json.load(open(saved))
    spec2["classes"][0]["thumbs"][0] = "data:image/png;base64," + "A" * 40000
    big = os.path.join(tmp, f"bigthumb_{mode}.json")
    json.dump(spec2, open(big, "w"))
    pg.locator("#open-project").set_input_files(big)
    wait_js(pg, "document.querySelector('#project-msg').textContent.includes('damaged')")
    check(pg.evaluate(f"() => {COUNTS}") == counts, f"[{mode}] refuses an oversized preview and keeps the work")
    spec3 = json.load(open(saved))
    spec3["classes"][0]["name"] = "  Long\nname " + "x" * 5000
    longname = os.path.join(tmp, f"longname_{mode}.json")
    json.dump(spec3, open(longname, "w"))
    pg.locator("#open-project").set_input_files(longname)
    wait_js(pg, "document.querySelector('#project-msg').textContent.startsWith('Opened')")
    nm = pg.evaluate(f"() => {STATE}.classes[0].name")
    check(len(nm) == 40 and "\n" not in nm and nm.startswith("Long name x"), f"[{mode}] a very long name is cut to the box's 40 letters ({len(nm)})")
    pg.locator("#open-project").set_input_files(saved)          # back to the real project
    wait_js(pg, "document.querySelector('#project-msg').textContent.startsWith('Opened')")

    # Opening doesn't leave Train usable while the file is still being read, and nothing is "unsaved" afterwards
    check(pg.evaluate(f"() => {STATE}.opening === false && {STATE}.savedVersion === {STATE}.dataVersion"),
          f"[{mode}] after opening, nothing counts as unsaved and the lock is released")
    pg.evaluate("() => { window.__trainer.state.opening = true; }")
    pg.evaluate("() => document.querySelector('#train-btn').click()")
    check(not pg.evaluate(f"() => {STATE}.training") and pg.locator("#train-progress").is_hidden(),
          f"[{mode}] Train does nothing while a project is being opened")
    pg.evaluate("() => { window.__trainer.state.opening = false; }")
    pg.evaluate("() => window.__trainer.state.classes.forEach(() => {})")

    # Train from the opened project
    pg.click("#train-btn")
    wait_js(pg, "document.querySelector('#train-msg').textContent.startsWith('Trained')", 120000)
    check(not pg.locator("#export-btn").is_disabled(), f"[{mode}] trains after opening and can download")

    # New, unsaved examples: Open asks first, and the page warns before leaving
    pg.locator(".class-card").nth(0).locator(".upload").set_input_files(files[0][:1])
    wait_js(pg, f"{STATE}.classes[0].examples.length > {counts[0]}")
    pg.locator("label:has(#open-project)").click()      # the warning click: no file chooser
    msg = pg.locator("#project-msg").text_content()
    check("will replace the examples you have now" in msg, f"[{mode}] Open warns before replacing unsaved examples")
    with pg.expect_file_chooser() as fc:
        pg.locator("label:has(#open-project)").click()
    fc.value.set_files(saved)
    wait_js(pg, "document.querySelector('#project-msg').textContent.startsWith('Opened')")
    check(pg.evaluate(f"() => {COUNTS}") == counts and pg.locator("#export-btn").is_disabled(),
          f"[{mode}] second click opens it; the old model is cleared until you train again")
    check(not errors, f"[{mode}] no page errors" + (f": {errors[:2]}" if errors else ""))
    pg.close()
    if mode == "image":      # 20 classes is the most; the button says so
        pg = ctx.new_page()
        pg.goto(f"http://127.0.0.1:{port}/index.html")
        wait_js(pg, "window.__trainer && window.__trainer.ready()", 90000)
        for _ in range(18):
            pg.click("#add-class")
        add = pg.locator("#add-class")
        check(pg.locator(".class-card").count() == 20 and add.is_disabled() and "20 classes" in add.text_content(),
              "[image] Add a class stops at 20 and says so")
        pg.locator(".class-card").nth(19).locator(".remove-class").click()
        check(add.is_enabled() and add.text_content() == "+ Add a class", "[image] removing a class turns Add a class back on")
        pg.close()
    return saved


def main():
    from playwright.sync_api import sync_playwright
    tmp = tempfile.mkdtemp(prefix="trainer-project-")
    files = make_files(tmp)
    model_file = os.path.join(tmp, "my_model.json")
    open(model_file, "w").write('{"format": "pattern-trainer-head", "version": 1}')
    srv, port = T.serve()
    saved = {}
    order = ["image", "pose", "audio"]
    with sync_playwright() as p:
        b = p.chromium.launch()
        ctx = b.new_context(accept_downloads=True)
        for mode in order:
            # damaged: right mode and recipe, but a bad example and preview
            spec = json.load(open(saved[order[0]])) if saved else None
            damaged = {"format": "pattern-trainer-project", "version": 1,
                       "input": {"type": mode, "preprocess": {"image": "mediapipe-image-embedder-centre-crop-v1",
                                 "pose": "mediapipe-pose-lite-xy-centred-v1", "audio": "mediapipe-yamnet-windows-v1"}[mode],
                                 "embedding": {"dim": {"image": 1280, "pose": 66, "audio": 521}[mode]}},
                       "classes": [{"name": "x", "examples": ["AAAA"], "thumbs": ["nope"]}]}
            json.dump(damaged, open(os.path.join(tmp, "damaged.json"), "w"))
            other = os.path.join(tmp, "other.json")   # a project from a different mode
            json.dump({**(spec or damaged), "input": {"type": "audio" if mode != "audio" else "pose"}}, open(other, "w"))
            saved[mode] = run_mode(ctx, port, mode, files[mode], tmp, other, model_file)
        b.close()
    try:
        pm.PatternModel.load(saved["image"])
        check(False, "Python refuses a project file")
    except pm.ModelFileError as e:
        check("project file" in str(e), f"Python refuses a project file kindly ({e})")
    print("files in", tmp)
    print("ALL PASSED" if not T.failures else f"{len(T.failures)} FAILED")
    return 1 if T.failures else 0


if __name__ == "__main__":
    sys.exit(main())
