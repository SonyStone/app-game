import { expect, it } from 'vitest';
import { describeKit, unpackKit } from './kits';

it('copies a kit with fresh ids, its owned panels pointed at the copies of their owners', () => {
  const part = (id: string, kind: string) => ({ id, kind, cell: { column: 0, row: 0 }, span: { columns: 1, rows: 1 } });
  const kit = { parts: [part('swatch', 'color:swatch')], owned: [{ owner: 'swatch', parts: [part('disc', 'color:wheel')] }] };

  const first = unpackKit(kit);
  const second = unpackKit(kit);

  expect(first.parts[0]!.id).not.toBe('swatch');
  expect(first.parts[0]!.id).not.toBe(second.parts[0]!.id);
  expect(first.panels).toHaveLength(1);
  expect(first.panels[0]!.owner).toBe(first.parts[0]!.id);
  expect(first.panels[0]!.parts[0]!.kind).toBe('color:wheel');
  expect(first.panels[0]!.parts[0]!.id).not.toBe('disc');
});

it('names a kit after its largest parts, and hue, saturation and brightness as HSB', () => {
  const at = (id: string, kind: string, columns: number, rows: number) => ({
    id,
    kind,
    cell: { column: 0, row: 0 },
    span: { columns, rows }
  });
  const label = (kind: string) => kind.split(':')[1]!;

  expect(describeKit([at('a', 'value:hue', 5, 1), at('b', 'color:wheel', 5, 5)], label)).toBe('wheel + hue');
  expect(
    describeKit(
      [
        at('w', 'color:wheel', 5, 5),
        at('h', 'value:hue', 5, 1),
        at('s', 'value:saturation', 5, 1),
        at('v', 'value:brightness', 5, 1),
        at('x', 'color:hex', 2, 1),
        at('y', 'color:history', 5, 1)
      ],
      label
    )
  ).toBe('wheel + HSB +2');
  expect(describeKit([at('h', 'value:hue', 5, 1), at('s', 'value:saturation', 5, 1), at('v', 'value:brightness', 5, 1)], label)).toBe('HSB');
  expect(describeKit([at('a', 'action:undo', 1, 1), at('b', 'action:undo', 1, 1)], label)).toBe('undo');
});
