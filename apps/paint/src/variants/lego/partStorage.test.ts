// @vitest-environment jsdom
import { createRoot, flush } from 'solid-js';
import { afterEach, expect, it, vi } from 'vitest';
import { maxSpan, partData, type Part } from './board';
import { createBoard, defaultBoard } from './createBoard';
import { createKits, unpackKit } from './kits';

const disposers: (() => void)[] = [];
afterEach(() => {
  for (const dispose of disposers.splice(0)) {
    dispose();
  }

  flush();
  localStorage.clear();
  vi.restoreAllMocks();
});

it('loads unknown kinds in boards and kits and keeps their data on save', () => {
  const parts = [part('action:future'), part('value:future')].map((part) => ({ ...part, futureData: { answer: 42 } }));
  localStorage.setItem('paint.lego', JSON.stringify(boardOf(parts)));
  localStorage.setItem('paint.lego.kits', JSON.stringify([{ id: 'saved', name: 'Saved', parts, owned: [] }]));
  const board = owned(createBoard);
  const kits = owned(createKits);
  board.set(board.latest());
  kits.rename('saved', 'Renamed');
  expect(JSON.parse(localStorage.getItem('paint.lego')!)).toEqual({ version: 2, board: boardOf(parts) });
  expect(JSON.parse(localStorage.getItem('paint.lego.kits')!)).toMatchObject({
    version: 2,
    kits: [{ name: 'Renamed', parts }]
  });
});

it('keeps malformed records and healthy neighbors independently in boards and owned kit panels', () => {
  const bad = { ...part('action:undo'), looks: 7, extra: ['retained'] };
  const parts = [part('color:pair'), bad, null, { id: 'bad-span', kind: 'value:size', span: 'future' }];
  localStorage.setItem('paint.lego', JSON.stringify(boardOf(parts)));
  localStorage.setItem(
    'paint.lego.kits',
    JSON.stringify([{ id: 'saved', name: 'Saved', parts: [], owned: [{ owner: 'owner', parts }] }])
  );
  const board = owned(createBoard);
  const kits = owned(createKits);
  const loaded = board.latest().panels[0]!.parts;
  expect(loaded).toHaveLength(4);
  expect(loaded[0]![partData]?.invalid).toBe(false);
  expect(loaded[1]![partData]?.record).toEqual(bad);
  board.set(board.latest());
  kits.rename('saved', 'Renamed');
  expect(JSON.parse(localStorage.getItem('paint.lego')!).board.panels[0].parts).toEqual(parts);
  expect(JSON.parse(localStorage.getItem('paint.lego.kits')!).kits[0].owned[0].parts).toEqual(parts);
});

it.each([undefined, 1])('migrates legacy board and kit parts at version %s, including owned panels', (version) => {
  const parts = [part('color'), { ...part('color'), id: 'picker', span: { columns: 7, rows: 30 } }];
  const board = boardOf(parts);
  const kits = [
    { id: 'saved', name: 'Saved', parts, owned: [{ owner: 'old-owner', parts: [{ ...part('color'), id: 'nested' }] }] }
  ];
  localStorage.setItem('paint.lego', JSON.stringify(version ? { version, board } : board));
  localStorage.setItem('paint.lego.kits', JSON.stringify(version ? { version, kits } : kits));
  const loadedBoard = owned(createBoard);
  const loadedKits = owned(createKits);
  const saved = loadedKits.kits().find((kit) => kit.id === 'saved')!;
  expect(loadedBoard.latest().panels[0]!.parts.map((part) => part.kind)).toEqual(['color:swatch', 'color:wheel']);
  expect(loadedBoard.latest().panels[1]!.owner).toBe('color');
  expect(saved.parts.map((part) => part.kind)).toEqual(['color:swatch', 'color:wheel']);
  expect(saved.owned.map((entry) => entry.owner)).toEqual(['old-owner', 'color', 'nested']);
  expect(saved.parts[1]!.span).toEqual({ columns: 7, rows: maxSpan });
  loadedBoard.set(loadedBoard.latest());
  loadedKits.rename('saved', 'Renamed');
  expect(owned(createBoard).latest().panels).toHaveLength(2);
  expect(
    owned(createKits)
      .kits()
      .find((kit) => kit.id === 'saved')!.owned
  ).toHaveLength(3);
});

it.each(['paint.lego', 'paint.lego.kits'])('backs up hard-corrupt %s before defaults can be saved', (key) => {
  vi.spyOn(Date, 'now').mockReturnValue(123456);
  localStorage.setItem(key, '{broken');
  const board = owned(createBoard);
  const kits = owned(createKits);
  expect(localStorage.getItem(`${key}.broken-123456`)).toBe('{broken');
  expect(board.latest()).toEqual(defaultBoard);
  board.set(board.latest());
  kits.rename('unused', 'unused');
  expect(JSON.parse(localStorage.getItem(key)!)).toHaveProperty('version', 2);
});

it('does not overwrite corrupt data when its backup cannot be stored', () => {
  localStorage.setItem('paint.lego', '{broken');
  const set = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
    throw new Error('full');
  });
  const board = owned(createBoard);
  set.mockRestore();
  board.set(board.latest());
  expect(localStorage.getItem('paint.lego')).toBe('{broken');
});

it('preserves opaque and future part data when kits are copied and layouts change', () => {
  const future = { ...part('action:future'), futureData: { opaque: { record: 'unrelated future field' } } };
  const malformed = { ...part('value:future'), id: 'malformed', looks: 12, extra: 'keep' };
  localStorage.setItem(
    'paint.lego.kits',
    JSON.stringify([{ id: 'saved', name: 'Saved', parts: [future, malformed], owned: [] }])
  );
  const kits = owned(createKits);
  const copy = unpackKit(kits.kits().find((kit) => kit.id === 'saved')!);
  const board = owned(createBoard);
  board.set(boardOf(copy.parts.map((part) => ({ ...part, cell: { column: 3, row: 4 } }))));
  const records = JSON.parse(localStorage.getItem('paint.lego')!).board.panels[0].parts;
  expect(records[0]).toEqual({ ...future, id: copy.parts[0]!.id, cell: { column: 3, row: 4 } });
  expect(records[1]).toEqual({ ...malformed, id: copy.parts[1]!.id, cell: { column: 3, row: 4 } });
});

/** Runs reactive factories in a disposed test owner. */
function owned<T>(create: () => T): T {
  return createRoot((dispose) => {
    disposers.push(dispose);
    return create();
  });
}

function part(kind: string): Part {
  return { id: kind, kind, cell: { column: 0, row: 0 }, span: { columns: 1, rows: 1 } };
}

function boardOf<T>(parts: T[]) {
  return { panels: [{ id: 'panel', at: { x: 0, y: 0 }, parts }] };
}
