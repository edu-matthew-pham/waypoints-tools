// What the stage draws for one screen: each copy of each object, with lists and tables given their items.
// A live view of the real instance, so dragging in the Design tab still moves the real thing.
import { tableColumns } from '../core/project.js';

export function screenItems(project, sc) {
  const listItems = (name) => project.variables.find((v) => v.name === name && Array.isArray(v.value))?.value;
  const withItems = (i) => new Proxy(i, { get: (t, k) => (k === 'items' ? listItems(t.source) : k === 'fields' ? tableColumns(project, t) : t[k]) });
  return sc.objects.flatMap((o) => o.instances.map((i) => ({ id: i.id, name: o.name, kind: o.kind, props: o.kind === 'list' || o.kind === 'table' ? withItems(i) : i })));
}
