import type { Part } from './board';

/**
 * The ready Layers floating composition, for a 28 px cell: the name, the blend mode with the opacity as a
 * number, the ordering buttons, the list, and the buttons that manage layers with Smooth color, each named part as
 * long as its name needs. Also used by defaults and version 3 migrations.
 */
export const layersKit = {
  id: 'ready:layers',
  name: 'Layers',
  floating: true as const,
  parts: [
    part('name', 'layers:name', 0, 0, 7, 1),
    part('blend', 'layers:blend', 0, 1, 4, 1),
    part('opacity', 'value:layer-opacity', 4, 1, 3, 1, 'number'),
    ...['lock', 'clip', 'up', 'down', 'merge-down'].map((kind, column) => part(kind, `layer:${kind}`, column, 2)),
    part('list', 'layers:list', 0, 3, 7, 6, 'wide'),
    ...['add', 'duplicate', 'delete'].map((kind, column) => part(kind, `layer:${kind}`, column, 9)),
    part('smooth', 'layers:smooth-color', 3, 9, 4, 1)
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
