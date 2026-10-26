# Waypoints tools

Small browser tools for classroom use. Each tool lives in its own folder with its own `index.html` and README,
plain HTML/JS with no build step, and no shared code between tools.

| Tool | What it does |
|---|---|
| [`trainer/`](trainer/) | Pattern Trainer: train an image classifier in the browser and download it for the [Python/Gradio starters](https://github.com/edu-matthew-pham/pattern-detector-starters). |

Live at https://tools.learningwaypoints.com/ (GitHub Pages from `main`, root folder; the custom domain is set by the
`CNAME` file and a `tools` CNAME record pointing to `edu-matthew-pham.github.io`).

If a tool ever needs a build step or its own releases, it moves to its own repo.

## Licence

Free for teachers, students, schools and other non-commercial use under the
[PolyForm Noncommercial License 1.0.0](LICENSE). Commercial use needs permission: contact
[Matthew Pham on GitHub](https://github.com/edu-matthew-pham).

Copyright 2026 Matthew Pham. Third-party files in `trainer/vendor/` and the models in `trainer/models/` keep their own
Apache-2.0 licences; see `trainer/vendor/README.md`.
