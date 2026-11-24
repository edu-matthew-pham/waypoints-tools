// Pictures. A project keeps its uploads in project.assets = [{ name, data }] (data: URLs, so the
// project stays one file). Built-in pictures are always available and need no upload.
const svgUrl = (body, fill) => 'data:image/svg+xml,' + encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><g fill="${fill}" stroke="none">${body}</g></svg>`);

export const BUILTIN_IMAGES = {
  star:   svgUrl('<path d="M32 4l8.6 17.5 19.4 2.8-14 13.7 3.3 19.3L32 48.2 14.7 57.3 18 38 4 24.3l19.4-2.8z"/>', '#f5b301'),
  heart:  svgUrl('<path d="M32 56S6 40 6 22a13 13 0 0 1 26-4 13 13 0 0 1 26 4c0 18-26 34-26 34z"/>', '#e5484d'),
  trophy: svgUrl('<path d="M18 6h28v14a14 14 0 0 1-28 0z"/><path d="M18 10H8v4a10 10 0 0 0 10 10zM46 10h10v4a10 10 0 0 1-10 10z" opacity=".7"/><rect x="28" y="34" width="8" height="12"/><rect x="18" y="46" width="28" height="8" rx="2"/>', '#e0a100'),
  tick:   svgUrl('<circle cx="32" cy="32" r="28"/><path d="M18 33l9 9 19-20" fill="none" stroke="#fff" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/>', '#2fa36b'),
  cross:  svgUrl('<circle cx="32" cy="32" r="28"/><path d="M22 22l20 20M42 22L22 42" stroke="#fff" stroke-width="7" stroke-linecap="round"/>', '#e5484d'),
  water:  svgUrl('<path d="M32 4C22 20 12 30 12 42a20 20 0 0 0 40 0C52 30 42 20 32 4z"/>', '#2f8fdd'),
  music:  svgUrl('<path d="M24 10l30-6v38a8 8 0 1 1-6-7.7V14l-18 3.6V48a8 8 0 1 1-6-7.7z"/>', '#7c3aed'),
  smile:  svgUrl('<circle cx="32" cy="32" r="28"/><circle cx="23" cy="26" r="4" fill="#4a3500"/><circle cx="41" cy="26" r="4" fill="#4a3500"/><path d="M20 38a14 14 0 0 0 24 0" fill="none" stroke="#4a3500" stroke-width="4" stroke-linecap="round"/>', '#f5c400'),
};

export const imageNames = (project) => [...Object.keys(BUILTIN_IMAGES), ...(project.assets || []).map((a) => a.name)];
export function imageData(project, name) {
  return (project.assets || []).find((a) => a.name === name)?.data ?? BUILTIN_IMAGES[name] ?? '';
}
// a free, tidy name from a file name: "My Cat (2).PNG" -> "my_cat_2"
export function assetName(project, fileName) {
  const base = (String(fileName).replace(/\.[^.]*$/, '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'picture').replace(/^(\d)/, 'p$1');
  const taken = new Set(imageNames(project));
  let name = base, n = 2;
  while (taken.has(name)) name = `${base}_${n++}`;
  return name;
}
