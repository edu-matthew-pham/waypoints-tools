# Waypoints tools

Small browser tools for classroom use. Each tool lives in its own folder with its own `index.html` and README,
plain HTML/JS with no build step, and no shared code between tools.

| Tool | What it does |
|---|---|
| [`trainer/`](trainer/) | Pattern Trainer: train an image classifier in the browser and download it for the [Python/Gradio starters](https://github.com/edu-matthew-pham/pattern-detector-starters). |

Hosted with GitHub Pages: `https://edu-matthew-pham.github.io/waypoints-tools/` (Settings → Pages → deploy from
the `main` branch, root folder).

If a tool ever needs a build step or its own releases, it moves to its own repo.

## Licence

MIT (see `LICENSE`). Third-party files in `trainer/vendor/` and the image model keep their own Apache-2.0 licences; see `trainer/vendor/README.md`.
