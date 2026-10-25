import type { Part } from './board';

/** The ready Layers window composition; also used by defaults and version 3 migrations. */
export const layersKit = {
  id: 'ready:layers',
  name: 'Layers',
  window: { name: 'Layers' },
  parts: [
    part('name', 'layers:name', 0, 0, 5, 1),
    part('blend', 'layers:blend', 0, 1, 3, 1),
    part('opacity', 'value:layer-opacity', 3, 1, 2, 1, 'number'),
    ...['lock', 'clip', 'up', 'down', 'merge-down'].map((kind, column) => part(kind, `layer:${kind}`, column, 2)),
    part('list', 'layers:list', 0, 3, 5, 5, 'wide'),
    ...['add', 'duplicate', 'delete'].map((kind, column) => part(kind, `layer:${kind}`, column, 8)),
    part('smooth', 'layers:smooth-color', 3, 8, 2, 1)
  ],
  owned: []
};

function part(id: string, kind: string, column: number, row: number, columns = 1, rows = 1, look?: string): Part {
  return {
    id,
    kind,
    cell: { column, row },
    span: { columns, rows },
    looks: look ? { [`${columns}x${rows}`]: look } : undefined
  };
}
