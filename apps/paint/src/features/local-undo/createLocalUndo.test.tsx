// @vitest-environment jsdom
import { render } from '@solidjs/web';
import { ok } from 'neverthrow';
import { createSignal, flush } from 'solid-js';
import { afterEach, expect, it, vi } from 'vitest';
import { createLocalUndo } from './createLocalUndo';
import type { LocalUndoCommand, LocalUndoReply } from './localUndoEdit';

let dispose: (() => void) | undefined;
afterEach(() => {
  dispose?.();
  dispose = undefined;
  document.body.replaceChildren();
  localStorage.clear();
});

const contact = { pressure: 1, altKey: false, shiftKey: false };

it('marks a lasso region, shows the reply, and applies the session when another tool is chosen', async () => {
  const { localUndo, sent, setActive } = mount();
  localUndo.update({ mode: 'lasso' });
  localUndo.canvasAction.run({ x: 0, y: 0 }, { ...contact, shiftKey: true });
  localUndo.canvasAction.move!({ x: 10, y: 0 }, contact);
  localUndo.canvasAction.move!({ x: 10, y: 10 }, contact);
  flush();
  expect(localUndo.gesture()).toMatchObject({ kind: 'lasso', mode: 'add' });
  localUndo.canvasAction.end!(false);
  await settle();
  expect(sent()).toEqual([{ type: 'lasso', points: expect.any(Array), mode: 'add', depth: 1 }]);
  expect(localUndo.open()).toBe(true);
  expect(localUndo.shown()).toMatchObject({ depth: 1, count: 3 });

  // A depth change sends only its latest value; the next session starts at depth 1 again.
  localUndo.setDepth(2);
  localUndo.setDepth(3);
  await settle();
  expect(sent().at(-1)).toEqual({ type: 'depth', depth: 3 });
  setActive(false);
  await settle();
  expect(sent().at(-1)).toEqual({ type: 'apply' });
  expect(localUndo.open()).toBe(false);
  expect(localUndo.depth()).toBe(1);
});

it('ends the session without changes when the drawing changes elsewhere, and cancels on request', async () => {
  const { localUndo, sent, setDocument } = mount();
  localUndo.update({ mode: 'tap' });
  localUndo.canvasAction.run({ x: 5, y: 5 }, contact);
  await settle();
  expect(localUndo.open()).toBe(true);

  setDocument({ top: 8, activeId: 'layer' });
  await settle();
  expect(localUndo.open()).toBe(false);
  expect(sent().at(-1)).toEqual({ type: 'cancel' });

  localUndo.canvasAction.run({ x: 5, y: 5 }, contact);
  await settle();
  await localUndo.cancel();
  expect(sent().at(-1)).toEqual({ type: 'cancel' });
  expect(localUndo.shown()).toBeUndefined();
});

it('sends a brush stroke in parts that continue each other, erasing with Alt', async () => {
  const { localUndo, sent } = mount();
  localUndo.canvasAction.run({ x: 0, y: 0 }, { ...contact, altKey: true, pressure: 0.5 });
  localUndo.canvasAction.move!({ x: 4, y: 0 }, contact);
  await new Promise((resolve) => requestAnimationFrame(resolve));
  localUndo.canvasAction.move!({ x: 8, y: 0 }, contact);
  localUndo.canvasAction.end!(false);
  await settle();
  const strokes = sent().filter((command) => command.type === 'brush');
  expect(strokes.map(({ points }) => points.map(({ x }) => x))).toEqual([[0, 4], [4, 8]]);
  expect(strokes[0]).toMatchObject({ erase: true, hardness: 0.5, depth: 1 });
  expect(strokes[0]!.points[0]!.radius).toBe(20);
  expect(localUndo.gesture()).toBeUndefined();
});

/** Mounts a local undo whose engine replies to every marking command with a region of three steps. */
function mount() {
  const [active, setActive] = createSignal(true);
  const [documentState, setDocument] = createSignal({ top: 7 as number | undefined, activeId: 'layer' });
  const commands: LocalUndoCommand[] = [];
  const run = vi.fn(async (command: { command: unknown }) => {
    const sent = command.command as LocalUndoCommand;
    commands.push(sent);
    if (sent.type === 'apply' || sent.type === 'cancel') {
      return ok(undefined);
    }

    const reply: LocalUndoReply = {
      kind: 'region',
      depth: sent.type === 'depth' ? sent.depth : 1,
      count: 3,
      outline: undefined,
      layerId: 'layer',
      top: 7
    };
    return ok(reply);
  });
  let localUndo!: ReturnType<typeof createLocalUndo>;
  const host = document.createElement('div');
  document.body.append(host);
  dispose = render(() => {
    localUndo = createLocalUndo({
      active,
      run,
      canStart: () => true,
      document: documentState,
      onError: () => {}
    });
    return <div />;
  }, host);
  flush();
  return { localUndo, sent: () => commands, setActive, setDocument };
}

/** Lets queued commands and their replies run, then flushes Solid. */
async function settle() {
  for (let i = 0; i < 10; i++) {
    await Promise.resolve();
  }

  flush();
  await new Promise((resolve) => setTimeout(resolve, 20));
  flush();
}
