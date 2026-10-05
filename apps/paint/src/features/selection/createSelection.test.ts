import type { PaintCommand } from '@app-game/paint-core/protocol';
import {
  emptySelection,
  summarizeSelection,
  type SelectionMask,
  type SelectionPreview
} from '@app-game/paint-core/selectionMask';
import { ok } from 'neverthrow';
import { flush } from 'solid-js';
import { expect, it, vi } from 'vitest';
import { createSelection, spannedShape } from './createSelection';
import { guardEdits } from './guardEdits';
import { selectionEdit, type SelectionCommand } from './selectionEdit';

it('applies a lasso through the engine, and moves only the outline when dragged inside it', async () => {
  const { selection, commands, mask, settle } = setup();
  const square = [
    { x: 0, y: 0 },
    { x: 20, y: 0 },
    { x: 20, y: 20 },
    { x: 0, y: 20 }
  ];
  selection.begin(square[0]!);
  square.slice(1).forEach(selection.move);
  flush();
  expect(selection.preview()).toEqual({ kind: 'shape', points: square, mode: 'replace' });
  selection.end();
  await settle();
  expect(commands()).toEqual([{ op: 'shape', points: square, mode: 'replace' }]);
  expect(selection.summary().bounds).toEqual({ left: 0, top: 0, right: 20, bottom: 20 });
  expect(selection.preview()).toBeUndefined();

  selection.begin({ x: 10, y: 10 });
  selection.move({ x: 40.3, y: -10.2 });
  flush();
  expect(selection.preview()).toEqual({ kind: 'offset', offset: { x: 30, y: -20 } });
  selection.end();
  await settle();
  expect(commands().at(-1)).toEqual({ op: 'translate', offset: { x: 30, y: -20 } });
  expect(selection.summary().bounds).toEqual({ left: 30, top: -20, right: 50, bottom: 0 });
  expect(mask().outside).toBe(0);
});

it('combines shapes by the chosen mode or by the keys held at the press', async () => {
  const { selection, commands, settle } = setup();
  selection.setTool('rectangle');
  const drag = async (from: { x: number; y: number }, to: { x: number; y: number }, keys = none) => {
    selection.begin(from, keys);
    selection.move(to);
    selection.end();
    await settle();
  };
  await drag({ x: 0, y: 0 }, { x: 10, y: 10 });
  await drag({ x: 5, y: 0 }, { x: 30, y: 10 }, { shiftKey: true, altKey: false });
  expect(selection.summary().bounds).toEqual({ left: 0, top: 0, right: 30, bottom: 10 });
  await drag({ x: 20, y: 0 }, { x: 30, y: 10 }, { shiftKey: false, altKey: true });
  expect(selection.summary().bounds).toEqual({ left: 0, top: 0, right: 20, bottom: 10 });
  await drag({ x: 15, y: -5 }, { x: 40, y: 40 }, { shiftKey: true, altKey: true });
  expect(selection.summary().bounds).toEqual({ left: 15, top: 0, right: 20, bottom: 10 });

  // The mode buttons do the same without keys; a press inside then draws instead of moving.
  selection.setMode('add');
  await drag({ x: 16, y: 2 }, { x: 50, y: 4 });
  expect(commands().at(-1)).toMatchObject({ op: 'shape', mode: 'add' });
  expect(selection.summary().bounds).toEqual({ left: 15, top: 0, right: 50, bottom: 10 });

  // A click that encloses nothing deselects in New mode only.
  selection.setMode('replace');
  await drag({ x: 100, y: 100 }, { x: 100, y: 100 });
  expect(selection.selected()).toBe(false);
});

it('closes a polygon on its first corner, by a double press or by finishing, following the hovering pointer', async () => {
  const { selection, commands, settle } = setup();
  selection.setTool('polygon');
  const press = (x: number, y: number) => {
    selection.begin({ x, y });
    selection.end();
  };
  press(0, 0);
  press(40, 0);
  selection.hover({ x: 40, y: 30 });
  flush();
  expect(selection.preview()).toMatchObject({
    kind: 'shape',
    points: [
      { x: 0, y: 0 },
      { x: 40, y: 0 },
      { x: 40, y: 30 }
    ]
  });
  press(40, 30);
  expect(selection.drawing()).toBe(true);
  press(1, 1);
  await settle();
  expect(selection.drawing()).toBe(false);
  expect(commands().at(-1)).toMatchObject({
    op: 'shape',
    points: [
      { x: 0, y: 0 },
      { x: 40, y: 0 },
      { x: 40, y: 30 }
    ]
  });

  press(100, 100);
  press(140, 100);
  press(140, 130);
  selection.finish();
  await settle();
  // A triangle: the pixel centers along its slanted edge decide its left side.
  expect(selection.summary().bounds).toMatchObject({ top: 100, right: 140, bottom: 130 });

  press(200, 200);
  press(240, 200);
  press(240, 230);
  vi.spyOn(performance, 'now').mockReturnValue(performance.now());
  press(240, 230);
  vi.restoreAllMocks();
  await settle();
  expect(selection.summary().bounds).toMatchObject({ top: 200, right: 240, bottom: 230 });

  // Escape (cancel) drops an open polygon.
  press(0, 0);
  press(10, 0);
  selection.cancel();
  expect(selection.drawing()).toBe(false);
  expect(selection.preview()).toBeUndefined();
});

it('runs the wand where it is pressed, inverts, feathers and selects all', async () => {
  const { selection, commands, mask, settle } = setup();
  selection.setTool('wand');
  selection.begin({ x: 3, y: 4 }, { shiftKey: true, altKey: false });
  await settle();
  expect(commands().at(-1)).toMatchObject({
    op: 'wand',
    point: { x: 3, y: 4 },
    area: { left: 0, top: 0, width: 64, height: 64 },
    tolerance: 32,
    contiguous: true,
    mode: 'add'
  });
  // The empty layer is one color across the view.
  expect(selection.summary().bounds).toEqual({ left: 0, top: 0, right: 64, bottom: 64 });

  selection.invert();
  await settle();
  expect(mask().outside).toBe(255);
  expect(selection.summary().bounds).toBeUndefined();
  selection.selectAll();
  await settle();
  expect(selection.summary()).toMatchObject({ selected: true, inverted: true });
  selection.clear();
  await settle();
  expect(selection.selected()).toBe(false);
  selection.feather(4);
  await settle();
  expect(commands().at(-1)).toEqual({ op: 'feather', radius: 4 });
});

it('runs one change or pixel command at a time, and pastes without a selection', async () => {
  const { selection, send, commands, settle } = setup();
  selection.selectAll();
  selection.invert();
  await settle();
  expect(commands()).toEqual([{ op: 'all' }]);
  selection.action('cut');
  selection.action('cut');
  expect(send).toHaveBeenCalledExactlyOnceWith({ type: 'selection', action: 'cut', layerId: 'layer-1', revision: 4 });
  selection.receive({ type: 'selection', selection: summarizeSelection(emptySelection), hasClipboard: true });
  selection.action('copy');
  expect(send).toHaveBeenCalledOnce();
  selection.action('paste');
  expect(send).toHaveBeenLastCalledWith({ type: 'selection', action: 'paste', layerId: 'layer-1', revision: 4 });
});

it('ends a gesture when a drawing is opened, and keeps the selection through edits and history', () => {
  const sent: string[] = [];
  const cancel = vi.fn();
  const send = guardEdits({ isBusy: () => false, cancel }, (command: PaintCommand) => sent.push(command.type));
  for (const type of ['undo', 'redo', 'end'] as const) {
    send({ type });
  }

  send({ type: 'edit', edit: 'fill', command: {} });
  expect(cancel).not.toHaveBeenCalled();
  send({ type: 'import', text: '{}' });
  expect(cancel).toHaveBeenCalledOnce();
  expect(sent).toEqual(['undo', 'redo', 'end', 'edit', 'import']);
});

it('spans rectangles on whole pixels and ellipses inside the same box, whichever way they are dragged', () => {
  expect(spannedShape('rectangle', { x: 30.6, y: 4.2 }, { x: 10.2, y: 20.7 })).toEqual([
    { x: 10, y: 4 },
    { x: 31, y: 4 },
    { x: 31, y: 21 },
    { x: 10, y: 21 }
  ]);

  const ellipse = spannedShape('ellipse', { x: 0, y: 0 }, { x: 40, y: 20 });
  expect(ellipse).toHaveLength(96);
  expect(ellipse[0]).toEqual({ x: 40, y: 10 });
  expect(Math.min(...ellipse.map(({ x }) => x))).toBeCloseTo(0);
  expect(Math.max(...ellipse.map(({ y }) => y))).toBeCloseTo(20);
});

const none = { shiftKey: false, altKey: false };

/** A selection whose changes run the real selection edit on an empty layer, as the engine would. */
function setup() {
  let mask: SelectionMask = emptySelection;
  const commands: SelectionCommand[] = [];
  let pending: Promise<unknown> = Promise.resolve();
  const send = vi.fn();
  const selection = createSelection({
    send,
    run(command) {
      const parsed = command.command as SelectionCommand;
      commands.push(parsed);
      const result = selectionEdit
        .run(
          {
            layers: [],
            active: { id: 'layer-1', name: 'Layer', visible: true, opacity: 1, blend: 'normal', tiles: new Map() },
            readTile: async () => new Uint8Array(),
            linearBlending: false,
            selection: mask,
            state: { get: () => undefined, set: () => {} },
            floating: { show: () => {}, move: () => {}, clear: async () => {} }
          },
          parsed
        )
        .then((edited) => {
          mask = edited.selection!;
          selection.receive({ type: 'selection', selection: summarizeSelection(mask), hasClipboard: false });
          return ok(undefined);
        });
      pending = result;
      return result;
    },
    document: () => ({ activeId: 'layer-1', revision: 4 }),
    ready: () => true,
    area: () => ({ left: 0, top: 0, width: 64, height: 64 }),
    closeDistance: () => 4,
    onError: (error) => {
      throw new Error(error.message);
    }
  });
  return {
    selection,
    send,
    commands: () => commands,
    mask: () => mask,
    settle: async () => {
      await pending;
      flush();
    },
    preview: () => selection.preview() as SelectionPreview | undefined
  };
}
