"""Run the audio classifier in headless Chromium on the clips; saves browser.json."""
import functools, http.server, json, os, threading, time

D = os.path.dirname(os.path.abspath(__file__))


class Quiet(http.server.SimpleHTTPRequestHandler):
    extensions_map = {**http.server.SimpleHTTPRequestHandler.extensions_map,
                      ".mjs": "text/javascript", ".wasm": "application/wasm", ".tflite": "application/octet-stream"}

    def log_message(self, *a):
        pass


srv = http.server.ThreadingHTTPServer(("127.0.0.1", 0), functools.partial(Quiet, directory=f"{D}/web"))
threading.Thread(target=srv.serve_forever, daemon=True).start()
names = json.load(open(f"{D}/web/names.json"))

from playwright.sync_api import sync_playwright  # noqa: E402
with sync_playwright() as p:
    b = p.chromium.launch(args=["--autoplay-policy=no-user-gesture-required"])
    pg = b.new_page()
    pg.goto(f"http://127.0.0.1:{srv.server_address[1]}/index.html")
    for _ in range(600):
        if pg.evaluate("() => window.ready === true"):
            break
        time.sleep(0.1)
    out = pg.evaluate("n => run(n)", names)
    b.close()
srv.shutdown()
json.dump(out, open(f"{D}/browser.json", "w"))
print("browser done; AudioContext rate", out["ctxRate"])
