// Builds index.html: one self-contained page (style.css inlined, src/ bundled and minified by esbuild).
//   cd app-builder && npm install && npm run build
import { build } from 'esbuild';
import { readFileSync, writeFileSync } from 'node:fs';

const here = new URL('..', import.meta.url);
const css = readFileSync(new URL('src/style.css', here), 'utf8');
const out = await build({ entryPoints: [new URL('src/app.js', here).pathname], bundle: true, minify: true, format: 'iife', write: false, target: 'es2022', legalComments: 'none' });
const js = out.outputFiles[0].text.trimEnd();
const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>App Builder (prototype)</title>
<style>${css}</style>
</head>
<body>
<div id="app"></div>
<script>${js}
</script>
</body>
</html>
`;
writeFileSync(new URL('index.html', here), html);
console.log(`index.html: ${(html.length / 1024).toFixed(0)} KB`);
