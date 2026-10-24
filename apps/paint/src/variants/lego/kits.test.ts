import { expect, it } from 'vitest';
import { sameLayout, unpackKit } from './kits';

it('copies a kit with fresh ids, its owned panels pointed at the copies of their owners', () => {
  const part = (id: string, kind: string) => ({ id, kind, cell: { column: 0, row: 0 }, span: { columns: 1, rows: 1 } });
  const kit = {
    parts: [part('swatch', 'color:swatch')],
    owned: [{ owner: 'swatch', parts: [part('disc', 'color:wheel')] }]
  };

  const first = unpackKit(kit);
  const second = unpackKit(kit);

  expect(first.parts[0]!.id).not.toBe('swatch');
  expect(first.parts[0]!.id).not.toBe(second.parts[0]!.id);
  expect(first.panels).toHaveLength(1);
  expect(first.panels[0]!.owner).toBe(first.parts[0]!.id);
  expect(first.panels[0]!.parts[0]!.kind).toBe('color:wheel');
  expect(first.panels[0]!.parts[0]!.id).not.toBe('disc');
});

it('tells parts laid out the same way apart from others, whatever their ids or place', () => {
  const at = (id: string, kind: string, column: number, row: number) => ({
    id,
    kind,
    cell: { column, row },
    span: { columns: 2, rows: 1 }
  });

  const kit = [at('a', 'value:hue', 0, 0), at('b', 'color:hex', 0, 1)];
  const moved = [at('x', 'color:hex', 5, 4), at('y', 'value:hue', 5, 3)];
  const swapped = [at('x', 'color:hex', 5, 3), at('y', 'value:hue', 5, 4)];

  expect(sameLayout(moved)).toBe(sameLayout(kit));
  expect(sameLayout(swapped)).not.toBe(sameLayout(kit));
});
