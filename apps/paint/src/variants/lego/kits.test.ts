import { expect, it } from 'vitest';
import { unpackKit } from './kits';

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
