// @vitest-environment jsdom
import { createRoot, flush } from 'solid-js';
import { afterEach, expect, it, vi } from 'vitest';
import { maxSpan, partData, pinPanels, placePart, pruneOwned, putPanel, removePart, type Part } from './board';
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
  expect(JSON.parse(localStorage.getItem('paint.lego')!)).toEqual({ version: 4, board: boardOf(parts) });
  expect(JSON.parse(localStorage.getItem('paint.lego.kits')!)).toMatchObject({
    version: 4,
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
  const cleaned = parts.map((record) => (record === bad ? { ...bad, looks: undefined } : record));
  expect(loaded[1]![partData]?.invalid).toBe(false);
  expect(loaded[1]!.looks).toBeUndefined();
  expect(JSON.parse(localStorage.getItem('paint.lego')!).board.panels[0].parts).toEqual(cleaned);
  expect(JSON.parse(localStorage.getItem('paint.lego.kits')!).kits[0].owned[0].parts).toEqual(cleaned);
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
  expect(JSON.parse(localStorage.getItem(key)!)).toHaveProperty('version', 4);
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
  expect(records[1]).toEqual({ ...malformed, looks: undefined, id: copy.parts[1]!.id, cell: { column: 3, row: 4 } });
});

it.each([
  { key: 'paint.lego', field: 'board', value: boardOf([part('action:undo')]) },
  { key: 'paint.lego', field: 'board', value: { panels: 'future shape' } },
  { key: 'paint.lego.kits', field: 'kits', value: [{ id: 'future', name: 'Future', parts: [], owned: [] }] },
  { key: 'paint.lego.kits', field: 'kits', value: { futureShape: [] } }
])('keeps newer $key data read-only and reports it, including incompatible shapes', ({ key, field, value }) => {
  const raw = JSON.stringify({ version: 5, [field]: value, futureEnvelope: 'keep' });
  localStorage.setItem(key, raw);
  const notice = vi.fn(() => 'callback return value');
  const storage = field === 'board' ? owned(() => createBoard(notice)) : owned(() => createKits(notice));
  expect(notice).toHaveBeenCalledWith(expect.stringContaining('newer Paint version'));

  if ('set' in storage) {
    storage.set(defaultBoard);
    storage.reset();
  } else {
    storage.rename('future', 'Changed');
    storage.save(defaultBoard, defaultBoard.panels[0]!, 'New kit');
    storage.remove('future');
  }

  expect(localStorage.getItem(key)).toBe(raw);
  expect(Object.keys(localStorage)).toEqual([key]);
});

it('retains envelope, board, panel, kit and owned-panel fields through edits', () => {
  const panel = { ...boardOf([part('action:undo')]).panels[0]!, futurePanelField: { keep: true } };
  const boardData = { panels: [panel], futureBoardField: 'keep' };
  const kitData = {
    id: 'saved',
    name: 'Saved',
    parts: [],
    owned: [{ owner: 'owner', parts: [], futureOwned: 42 }],
    futureKitField: ['keep']
  };
  localStorage.setItem('paint.lego', JSON.stringify({ version: 4, board: boardData, futureEnvelope: 23 }));
  localStorage.setItem('paint.lego.kits', JSON.stringify({ version: 4, kits: [kitData], futureEnvelope: 24 }));
  const board = owned(createBoard);
  const kits = owned(createKits);
  const current = board.latest().panels[0]!;
  const moved = { ...current.parts[0]!, cell: { column: 3, row: 4 } };
  const next = putPanel(board.latest(), { ...current, parts: placePart(current.parts, moved) });
  board.set(pinPanels(next, new Map([['panel', { x: 50, y: 50 }]]), { width: 100, height: 100 }));
  kits.rename('saved', 'Renamed');
  expect(JSON.parse(localStorage.getItem('paint.lego')!)).toEqual({
    version: 4,
    board: {
      ...boardData,
      panels: [{ ...panel, parts: [{ ...part('action:undo'), cell: { column: 3, row: 4 } }], at: { x: 0.5, y: 0.5 } }]
    },
    futureEnvelope: 23
  });
  expect(JSON.parse(localStorage.getItem('paint.lego.kits')!)).toEqual({
    version: 4,
    kits: [{ ...kitData, name: 'Renamed' }],
    futureEnvelope: 24
  });
});

it('retains board fields when parts and their owned panels are removed or new panels are added', () => {
  const main = { id: 'main', at: { x: 0, y: 0 }, parts: [part('color:swatch')] };
  const ownedPanel = { id: 'owned', owner: 'color:swatch', at: { x: 0, y: 0 }, parts: [part('action:undo')] };
  localStorage.setItem(
    'paint.lego',
    JSON.stringify({ version: 4, board: { panels: [main, ownedPanel], futureBoardField: 'keep' } })
  );
  const board = owned(createBoard);
  const removed = pruneOwned(removePart(board.latest(), 'color:swatch'));
  board.set(putPanel(removed, { ...main, id: 'added' }));
  expect(JSON.parse(localStorage.getItem('paint.lego')!).board).toEqual({
    panels: [{ ...main, id: 'added' }],
    futureBoardField: 'keep'
  });
});

it('loads each kit independently and preserves opaque records when a healthy kit changes', () => {
  const records = [
    { id: 'bad', name: 'Bad', parts: 'future shape', owned: [], extra: 42 },
    null,
    ['future kit'],
    { id: 'good', name: 'Good', parts: [part('action:undo')], owned: [] }
  ];
  localStorage.setItem('paint.lego.kits', JSON.stringify({ version: 4, kits: records }));
  const kits = owned(createKits);
  expect(kits.kits().find((kit) => kit.id === 'good')!.parts).toHaveLength(1);
  expect(kits.kits().find((kit) => kit.id === 'bad')!.parts).toEqual([]);
  kits.rename('good', 'Renamed');
  expect(JSON.parse(localStorage.getItem('paint.lego.kits')!).kits).toEqual([
    ...records.slice(0, 3),
    { ...records[3], name: 'Renamed' }
  ]);
  expect(Object.keys(localStorage)).toEqual(['paint.lego.kits']);
});

it.each(['paint.lego', 'paint.lego.kits'])('backs up identical broken %s content only once across reloads', (key) => {
  localStorage.setItem(key, '{broken');
  const create = () => (key === 'paint.lego' ? createBoard() : createKits());
  vi.spyOn(Date, 'now').mockReturnValueOnce(10).mockReturnValue(20);
  owned(create);
  owned(create);
  owned(create);
  expect(Object.keys(localStorage).filter((key) => key.includes('.broken-'))).toEqual([`${key}.broken-10`]);
  expect(localStorage.getItem(key)).toBe('{broken');
});

it('keeps distinct broken values even when their backups share a timestamp', () => {
  vi.spyOn(Date, 'now').mockReturnValue(10);
  localStorage.setItem('paint.lego', '{first');
  owned(createBoard);
  localStorage.setItem('paint.lego', '{second');
  owned(createBoard);
  expect(localStorage.getItem('paint.lego.broken-10')).toBe('{first');
  expect(localStorage.getItem('paint.lego.broken-10-1')).toBe('{second');
});

it('reports disabled saving when reads or backups fail', () => {
  const notice = vi.fn();
  const get = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
    throw new Error('unavailable');
  });
  owned(() => createBoard(notice));
  expect(notice).toHaveBeenCalledWith("Board changes can't be saved on this device.");
  get.mockRestore();
  localStorage.setItem('paint.lego', '{broken');
  notice.mockClear();
  const set = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
    throw new Error('full');
  });
  const unbacked = owned(() => createBoard(notice));
  expect(notice).toHaveBeenCalledWith("Board changes can't be saved on this device.");
  set.mockRestore();
  unbacked.reset();
  expect(localStorage.getItem('paint.lego')).toBe('{broken');
});

it('reports quota failures, retains in-memory edits and retries a later save', () => {
  const notice = vi.fn();
  const board = owned(() => createBoard(notice));
  const edited = boardOf([part('action:undo')]);
  const set = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
    throw new DOMException('full', 'QuotaExceededError');
  });
  board.set(edited);
  flush();
  expect(board.latest()).toEqual(edited);
  expect(notice).toHaveBeenCalledWith("Board changes can't be saved on this device.");
  set.mockRestore();
  board.set(board.latest());
  flush();
  expect(JSON.parse(localStorage.getItem('paint.lego')!).board).toEqual(edited);
});

it('keeps opaque kits unchanged until explicitly removed', () => {
  const broken = { id: 'broken', name: 'Broken kit', parts: 'unreadable', owned: [], future: 42 };
  localStorage.setItem('paint.lego.kits', JSON.stringify({ version: 4, kits: [broken] }));
  const kits = owned(createKits);
  kits.rename('broken', 'Lost rename');
  flush();
  expect(kits.kits().find((kit) => kit.id === 'broken')!.name).toBe('Broken kit');
  expect(kits.findSame([])).toBeUndefined();
  expect(JSON.parse(localStorage.getItem('paint.lego.kits')!).kits).toEqual([broken]);
  kits.remove('broken');
  flush();
  expect(kits.kits().some((kit) => kit.id === 'broken')).toBe(false);
  expect(JSON.parse(localStorage.getItem('paint.lego.kits')!).kits).toEqual([]);
});

it('persists cell/span edits of an opaque part without dropping its unreadable fields', () => {
  const record = { ...part('value:size'), kind: 42, cell: 'invalid cell', span: 'invalid span', extra: 'keep' };
  localStorage.setItem('paint.lego', JSON.stringify(boardOf([record])));
  const board = owned(createBoard);
  const loaded = board.latest().panels[0]!.parts[0]!;
  expect(loaded[partData]?.invalid).toBe(true);
  board.set(boardOf([{ ...loaded, cell: { column: 3, row: 4 }, span: { columns: 2, rows: 2 } }]));
  expect(JSON.parse(localStorage.getItem('paint.lego')!).board.panels[0].parts[0]).toEqual({
    ...record,
    cell: { column: 3, row: 4 },
    span: { columns: 2, rows: 2 }
  });
  const reloaded = owned(createBoard).latest().panels[0]!.parts[0]!;
  expect(reloaded.cell).toEqual({ column: 3, row: 4 });
  expect(reloaded.span).toEqual({ columns: 2, rows: 2 });
  expect(reloaded[partData]?.invalid).toBe(true);
});

/** Runs reactive factories in a disposed test owner. */
function owned<T>(create: () => T): T {
  const value = createRoot((dispose) => {
    disposers.push(dispose);
    return create();
  });
  flush();
  return value;
}

function part(kind: string): Part {
  return { id: kind, kind, cell: { column: 0, row: 0 }, span: { columns: 1, rows: 1 } };
}

function boardOf<T>(parts: T[]) {
  return { panels: [{ id: 'panel', at: { x: 0, y: 0 }, parts }] };
}

it.each([undefined, 1, 2])(
  'migrates every Layers instance to closed windows from version %s and reloads v4 once',
  (version) => {
    const parts = ['first', 'second'].map((id, index) => ({
      ...part('action:layers'),
      id,
      cell: { column: index, row: 0 },
      future: id
    }));
    const boardData = boardOf(parts);
    const kitData = [
      { id: 'kit', name: 'Kit', parts: parts.slice(0, 1), owned: [{ owner: 'first', parts: parts.slice(1) }] }
    ];
    localStorage.setItem('paint.lego', JSON.stringify(version ? { version, board: boardData } : boardData));
    localStorage.setItem('paint.lego.kits', JSON.stringify(version ? { version, kits: kitData } : kitData));
    const board = owned(createBoard);
    const kits = owned(createKits);
    const windows = board.latest().panels.filter((panel) => panel.window);
    expect(windows.map((panel) => panel.owner)).toEqual([undefined, undefined]);
    expect(windows.every((panel) => panel.window?.name === 'Layers' && panel.window.collapsed)).toBe(true);
    expect(windows.every((panel) => panel.parts.some((part) => part.kind === 'layers:list'))).toBe(true);
    expect(new Set(windows.flatMap((panel) => panel.parts.map((part) => part.id))).size).toBe(26);
    const kit = kits.kits().find((kit) => kit.id === 'kit')!;
    expect(kit.owned.filter((panel) => panel.window).map((panel) => panel.owner)).toEqual([undefined, undefined]);
    board.set(board.latest());
    kits.rename('kit', 'Kept');
    expect(owned(createBoard).latest().panels).toHaveLength(2);
    expect(
      owned(createKits)
        .kits()
        .find((kit) => kit.id === 'kit')!.owned
    ).toHaveLength(2);
    expect(
      JSON.parse(localStorage.getItem('paint.lego')!)
        .board.panels.flatMap((panel: { parts: Part[] }) => panel.parts)
        .some((part: Part) => part.kind === 'action:layers')
    ).toBe(false);
  }
);

it.each([undefined, 1, 2])('expands an old inline Layers look in place on boards and kits at version %s', (version) => {
  const inline = {
    ...part('action:layers'),
    id: 'inline',
    cell: { column: 2, row: 3 },
    span: { columns: 7, rows: 8 },
    looks: { '7x8': 'panel' },
    future: 42
  };
  const neighbor = { ...part('action:undo'), cell: { column: 2, row: 11 } };
  const parts = [inline, neighbor];
  const boardData = boardOf(parts);
  const kitData = [{ id: 'kit', name: 'Kit', parts, owned: [] }];
  localStorage.setItem('paint.lego', JSON.stringify(version ? { version, board: boardData } : boardData));
  localStorage.setItem('paint.lego.kits', JSON.stringify(version ? { version, kits: kitData } : kitData));
  const board = owned(createBoard);
  const kits = owned(createKits);
  const panel = board.latest().panels[0]!;
  expect(board.latest().panels).toHaveLength(1);
  expect(panel.window).toBeUndefined();
  expect(panel.parts.find((part) => part.kind === 'layers:name')?.cell).toEqual({ column: 2, row: 3 });
  expect(panel.parts.find((part) => part.kind === 'layers:list')?.span).toEqual({ columns: 5, rows: 5 });
  expect(panel.parts.some((part) => part.kind === 'action:layers')).toBe(false);
  expect(panel.parts.find((part) => part.id === neighbor.id)?.cell).not.toEqual(neighbor.cell);
  expect(
    kits
      .kits()
      .find((kit) => kit.id === 'kit')!
      .parts.map((part) => part.kind)
  ).toEqual(panel.parts.map((part) => part.kind));
  board.set(board.latest());
  expect(
    JSON.parse(localStorage.getItem('paint.lego')!).board.panels[0].parts.find((part: Part) => part.id === 'inline')
      .future
  ).toBe(42);
});

it('migrates v3 owned windows, placed windows, folders and orphan openers once', () => {
  const owners = ['closed', 'open', 'placed', 'orphan'].map((id, column) => ({
    ...part('action:layers'),
    id,
    cell: { column, row: 0 }
  }));
  const swatch = { ...part('color:swatch'), id: 'swatch' };
  const boardData = {
    future: 11,
    panels: [
      { id: 'toolbar', at: { x: 0.1, y: 0.2 }, parts: [...owners, swatch] },
      ...['closed', 'open', 'placed'].map((owner) => ({
        id: owner,
        owner,
        at: { x: 0.5, y: 0.4 },
        parts: [part('layers:list')],
        futurePanel: owner,
        window: {
          name: owner,
          open: owner === 'closed' ? undefined : true,
          placed: owner === 'placed' ? true : undefined,
          futureWindow: 42
        }
      })),
      {
        id: 'folder',
        owner: 'swatch',
        at: { x: 0, y: 0 },
        parts: [part('color:hex')],
        offset: { column: 2, row: 3 },
        window: { name: 'Color', open: true }
      }
    ]
  };
  localStorage.setItem('paint.lego', JSON.stringify({ version: 3, board: boardData, futureEnvelope: 12 }));
  const board = owned(createBoard);
  const converted = board.latest().panels;
  expect(converted[0]!.parts.map((part) => part.id)).toEqual(['swatch']);
  const windows = converted.filter((panel) => panel.window);
  expect(windows).toHaveLength(4);
  expect(windows.every((panel) => panel.owner === undefined && panel.window?.icon === 'layers')).toBe(true);
  expect(windows.map((panel) => !!panel.window?.collapsed)).toEqual([true, false, false, true]);
  expect(windows[2]!.at).toEqual({ x: 0.495, y: 0.4 - 42 / 900 });
  expect(converted.find((panel) => panel.id === 'folder')).toMatchObject({
    owner: 'swatch',
    offset: { column: 2, row: 3 }
  });
  expect(converted.find((panel) => panel.id === 'folder')!.window).toBeUndefined();
  board.set(board.latest());
  const saved = JSON.parse(localStorage.getItem('paint.lego')!);
  expect(saved).toMatchObject({ version: 4, futureEnvelope: 12, board: { future: 11 } });
  expect(saved.board.panels.find((panel: { id: string }) => panel.id === 'placed')).toMatchObject({
    futurePanel: 'placed',
    window: { futureWindow: 42 }
  });
  expect(
    saved.board.panels.every(
      (panel: { window?: object }) => !panel.window || !('open' in panel.window || 'placed' in panel.window)
    )
  ).toBe(true);
  expect(JSON.parse(JSON.stringify(owned(createBoard).latest()))).toEqual(JSON.parse(JSON.stringify(board.latest())));
});

it('migrates v3 kits to window compositions and keeps mixed kits and swatch folders', () => {
  const opener = { ...part('action:layers'), id: 'opener' };
  const swatch = { ...part('color:swatch'), id: 'swatch' };
  const window = {
    owner: opener.id,
    parts: [part('layers:list')],
    window: { name: 'Personal layers', open: true, placed: true, collapsed: true, future: 3 }
  };
  localStorage.setItem(
    'paint.lego.kits',
    JSON.stringify({
      version: 3,
      kits: [
        { id: 'only', name: 'Only', parts: [opener], owned: [window], futureKit: 9 },
        {
          id: 'mixed',
          name: 'Mixed',
          parts: [opener, swatch],
          owned: [window, { owner: swatch.id, parts: [part('color:hex')], window: { name: 'Color' } }]
        },
        { id: 'orphan', name: 'Orphan', parts: [opener], owned: [] }
      ]
    })
  );
  const kits = owned(createKits);
  const only = kits.kits().find((kit) => kit.id === 'only')!;
  expect(only.parts[0]!.kind).toBe('layers:list');
  expect(only.window).toEqual({ name: 'Personal layers', icon: 'layers', future: 3 });
  expect(only.owned).toEqual([]);
  const mixed = kits.kits().find((kit) => kit.id === 'mixed')!;
  expect(mixed.parts.map((part) => part.id)).toEqual(['swatch']);
  expect(mixed.owned[0]!.owner).toBeUndefined();
  expect(mixed.owned[0]!.window).toEqual(only.window);
  expect(mixed.owned[1]!.owner).toBe('swatch');
  expect(mixed.owned[1]!.window).toBeUndefined();
  expect(kits.kits().find((kit) => kit.id === 'orphan')!.window).toEqual({ name: 'Layers', icon: 'layers' });
  kits.rename('only', 'Renamed');
  expect(
    owned(createKits)
      .kits()
      .find((kit) => kit.id === 'only')!.window?.name
  ).toBe('Renamed');
  expect(JSON.parse(localStorage.getItem('paint.lego.kits')!).kits[0].futureKit).toBe(9);
});

it('promotes a sole window kit while retaining its nested folders and unknown panel fields', () => {
  const opener = { ...part('action:layers'), id: 'opener' };
  const swatch = { ...part('color:swatch'), id: 'swatch' };
  localStorage.setItem(
    'paint.lego.kits',
    JSON.stringify({
      version: 3,
      kits: [
        {
          id: 'nested',
          name: 'Nested',
          parts: [opener],
          owned: [
            { owner: 'opener', parts: [swatch], window: { name: 'Layers' }, futurePanel: 8 },
            { owner: 'swatch', parts: [part('color:hex')], futureFolder: 9 }
          ]
        }
      ]
    })
  );
  const kits = owned(createKits);
  const kit = kits.kits().find((kit) => kit.id === 'nested')!;
  expect(kit.window).toEqual({ name: 'Layers', icon: 'layers' });
  expect(kit.parts.map((part) => part.id)).toEqual(['swatch']);
  expect(kit.owned).toHaveLength(1);
  expect(kit.owned[0]!.owner).toBe('swatch');
  const copy = unpackKit(kit);
  expect(copy.panels[0]!.owner).toBe(copy.parts[0]!.id);
  kits.rename('nested', 'Renamed');
  const saved = JSON.parse(localStorage.getItem('paint.lego.kits')!).kits[0];
  expect(saved.futurePanel).toBe(8);
  expect(saved.owned[0].futureFolder).toBe(9);
});
