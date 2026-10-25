import type { Part } from './board';

/** What a new swatch opens: the disc over hue, saturation and brightness, and the history below. */
export const swatchPanelParts: Part[] = [
  { id: 'disc', kind: 'color:wheel', cell: { column: 0, row: 0 }, span: { columns: 5, rows: 5 } },
  { id: 'hue', kind: 'value:hue', cell: { column: 0, row: 5 }, span: { columns: 5, rows: 1 } },
  { id: 'saturation', kind: 'value:saturation', cell: { column: 0, row: 6 }, span: { columns: 5, rows: 1 } },
  { id: 'brightness', kind: 'value:brightness', cell: { column: 0, row: 7 }, span: { columns: 5, rows: 1 } },
  { id: 'history', kind: 'color:history', cell: { column: 0, row: 8 }, span: { columns: 5, rows: 1 } }
];
