// @vitest-environment jsdom
import { createRoot, createSignal, flush } from 'solid-js';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { arrivalStorageWaitMs, arrivedByMove, createFreshTab } from './createFreshTab';

let dispose: (() => void) | undefined;
beforeEach(() => localStorage.clear());
afterEach(() => {
  dispose?.();
  vi.restoreAllMocks();
});

it('offers the move once hover is lost, and moves to a new tab that continues the drawing', async () => {
  const { freshTab, setLost, moveOut, close } = start();
  const open = vi.spyOn(window, 'open').mockReturnValue({} as Window);

  setLost(1);
  flush();
  expect(freshTab.offered()).toBe(false);
  setLost(2);
  flush();
  expect(freshTab.offered()).toBe(true);

  // Without `auto`, a lift does not move.
  lift();
  expect(open).not.toHaveBeenCalled();

  freshTab.move();
  freshTab.move();
  expect(open).toHaveBeenCalledOnce();
  expect(new URL(open.mock.calls[0]![0] as string).searchParams.has('paintMoved')).toBe(true);
  expect(moveOut).toHaveBeenCalledOnce();
  flush();
  expect(freshTab.offered()).toBe(false);
  await Promise.resolve();
  expect(close).toHaveBeenCalledOnce();
});

it('moves by itself at the pen lift with `auto`, while idle, and remembers the choice', () => {
  const { freshTab, setLost, setIdle, moveOut } = start();
  vi.spyOn(window, 'open').mockReturnValue({} as Window);
  freshTab.setAuto(true);
  setLost(2);
  flush();

  setIdle(false);
  lift();
  lift('touch');
  expect(moveOut).not.toHaveBeenCalled();

  setIdle(true);
  lift();
  expect(moveOut).toHaveBeenCalledOnce();

  dispose?.();
  expect(start().freshTab.auto()).toBe(true);
});

it('asks for a tap when Chrome does not open the tab, and keeps the drawing here', () => {
  const { freshTab, setLost, moveOut } = start();
  vi.spyOn(window, 'open').mockReturnValue(null);
  freshTab.setAuto(true);
  setLost(2);
  flush();
  lift();
  flush();
  expect(freshTab.blocked()).toBe(true);
  expect(freshTab.offered()).toBe(true);
  expect(moveOut).not.toHaveBeenCalled();
});

it('stops offering the move once dismissed', () => {
  const { freshTab, setLost } = start();
  setLost(2);
  freshTab.dismiss();
  flush();
  expect(freshTab.offered()).toBe(false);
});

it('waits longer for the drawing in a tab opened by a move, once, and still knows the tab moved', () => {
  expect(arrivedByMove()).toBe(false);
  history.replaceState(null, '', '/paint/?paintMoved=&paintThread=main');
  expect(arrivedByMove()).toBe(true);
  expect(arrivalStorageWaitMs()).toBeGreaterThan(5000);
  expect(location.search).toBe('?paintThread=main');
  expect(arrivalStorageWaitMs()).toBeUndefined();
  expect(arrivedByMove()).toBe(true);
});

function start() {
  const [lost, setLost] = createSignal(0);
  let idle = true;
  const moveOut = vi.fn(async () => true);
  // A real close would end jsdom's window for the following tests.
  const close = vi.spyOn(window, 'close').mockImplementation(() => {});
  const freshTab = createRoot((disposeRoot) => {
    dispose = disposeRoot;
    return createFreshTab({ lostContacts: lost, idle: () => idle, moveOut });
  });
  return {
    freshTab,
    setLost: (count: number) => setLost(count),
    setIdle: (next: boolean) => (idle = next),
    moveOut,
    close
  };
}

/** A pen lift; jsdom has no PointerEvent constructor, so a MouseEvent carries `pointerType`. */
function lift(pointerType = 'pen') {
  window.dispatchEvent(Object.assign(new MouseEvent('pointerup'), { pointerType }));
}
