// "Did you mean …?" for a name that isn't there: the closest existing name, when it is close enough to be a slip
// (other capitals, one or two letters off). Pure; used by the editor's checks (expr.js) and the running app (runtime.js).

// letters added, removed, changed or swapped (two next to each other) to turn a into b
function distance(a, b) {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
    }
  }
  return d[a.length][b.length];
}

// The one existing name closest to `name`, or '' when none is close or two are equally close.
export function closest(name, candidates) {
  const want = String(name ?? '');
  const list = [...new Set([...(candidates || [])].map(String))].filter((c) => c && c !== want);
  if (!want || !list.length) return '';
  const same = list.filter((c) => c.toLowerCase() === want.toLowerCase());
  if (same.length === 1) return same[0];
  const limit = want.length <= 4 ? 1 : 2;
  let best = '', bestD = Infinity, tie = false;
  for (const c of list) {
    const dd = distance(want.toLowerCase(), c.toLowerCase());
    if (dd < bestD) { best = c; bestD = dd; tie = false; } else if (dd === bestD) tie = true;
  }
  return bestD <= limit && !tie ? best : '';
}

// " Did you mean X?" (with its leading space), or ''
export const meant = (name, candidates) => { const c = closest(name, candidates); return c ? ` Did you mean ${c}?` : ''; };
