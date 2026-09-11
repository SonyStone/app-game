import { render } from '@solidjs/web';
import { createRoot, createSignal, flush } from 'solid-js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CardStack } from '../src/CardStack';
import { createCardStackRecording } from '../src/debug/createCardStackRecording';
import { pointerSegments } from '../src/debug/motionView';
import { createMotionRecorder } from '../src/debug/createMotionRecorder';

const disposers: (() => void)[] = [];
afterEach(() => {
  disposers.splice(0).forEach((dispose) => dispose());
  document.body.replaceChildren();
  vi.restoreAllMocks();
});

describe('motion recording', () => {
  it('keeps the last five seconds, freezes detached data and starts a fresh recording', () => {
    const clock = frameClock();
    let x = 0;
    const recorder = owned(() => createMotionRecorder<{ x: number }, string>(() => ({ x })));
    expect(clock.pending()).toBe(0);
    recorder.start();
    for (let i = 0; i < 8; i++) {
      x++;
      clock.advance(1000);
      recorder.mark(`event-${i}`);
    }
    recorder.freeze();
    flush();
    const capture = recorder.capture()!;
    expect(capture.frames[0]?.t).toBe(3000);
    expect(capture.frames.at(-1)?.t).toBe(8000);
    expect(capture.frames.at(-1)?.data.x).toBe(8);
    expect(capture.events[0]?.t).toBe(3000);
    expect(recorder.summary().duration).toBe(5000);
    expect(clock.pending()).toBe(0);
    const serialized = JSON.stringify(capture);
    x = 900;
    clock.advance(1000);
    recorder.mark('ignored');
    recorder.start();
    flush();
    expect(recorder.capture()).toBeUndefined();
    expect(recorder.summary().samples).toBe(1);
    expect(recorder.summary().events).toBe(0);
    expect(JSON.stringify(capture)).toBe(serialized);
    recorder.freeze();
    flush();
    expect(recorder.capture()!.frames[0]?.data.x).toBe(900);
  });

  it('auto-stops on the deadline without dropping the beginning or inventing a late frame', () => {
    const clock = frameClock();
    const recorder = owned(() => createMotionRecorder(() => ({ x: 1 })));
    recorder.start({ durationMs: 1000, autoStop: true });
    flush();
    clock.advance(400);
    clock.advance(400);
    recorder.mark('before deadline');
    clock.advance(300);
    recorder.mark('too late');
    flush();
    const capture = recorder.capture()!;
    expect(capture.reason).toBe('duration-limit');
    expect(capture.frames.map((frame) => frame.t)).toEqual([0, 400, 800]);
    expect(capture.events.map((event) => event.data)).toEqual(['before deadline']);
    expect(capture.windowMs).toBe(1000);
    expect(capture.recordingOptions).toEqual({ durationMs: 1000, autoStop: true, delayMs: 0 });
    expect(clock.pending()).toBe(0);
  });

  it('keeps the configured rolling window when auto-stop is disabled', () => {
    const clock = frameClock();
    const recorder = owned(() => createMotionRecorder(() => 1));
    recorder.start({ durationMs: 10_000, autoStop: false });
    for (let i = 0; i < 12; i++) clock.advance(1000);
    expect(recorder.status()).toBe('recording');
    recorder.freeze();
    flush();
    expect(recorder.capture()!.frames[0]!.t).toBe(2000);
    expect(recorder.summary().duration).toBe(10_000);
  });

  it('delays sampling, snapshots settings and lets a pending start be cancelled without replacing the capture', () => {
    const clock = frameClock();
    const read = vi.fn(() => 1);
    const recorder = owned(() => createMotionRecorder(read));
    recorder.start();
    flush();
    clock.advance(100);
    recorder.freeze();
    flush();
    const previous = recorder.capture();
    const settings = { durationMs: 1000, delayMs: 2000, autoStop: true };
    recorder.start(settings);
    flush();
    const reads = read.mock.calls.length;
    expect(recorder.status()).toBe('scheduled');
    clock.advance(1000);
    expect(recorder.countdown()).toBe(1);
    expect(read).toHaveBeenCalledTimes(reads);
    recorder.mark('during countdown');
    recorder.freeze();
    flush();
    clock.advance(2000);
    expect(recorder.capture()).toBe(previous);
    expect(recorder.status()).toBe('captured');
    expect(clock.pending()).toBe(0);
    recorder.start(settings);
    settings.durationMs = 60_000;
    flush();
    clock.advance(2000);
    expect(recorder.status()).toBe('recording');
    expect(recorder.preview()[0]!.t).toBe(0);
    expect(recorder.previewEvents()).toEqual([]);
    clock.advance(500);
    clock.advance(500);
    expect(recorder.capture()!.reason).toBe('duration-limit');
    expect(recorder.capture()!.windowMs).toBe(1000);
    recorder.start({ delayMs: 1000 });
    flush();
    disposers.pop()!();
    const calls = read.mock.calls.length;
    clock.advance(3000);
    expect(read).toHaveBeenCalledTimes(calls);
    expect(clock.pending()).toBe(0);
  });

  it('bounds high-frequency data and cancels observation on disposal', () => {
    const clock = frameClock();
    const read = vi.fn(() => ({ x: 1 }));
    const recorder = owned(() => createMotionRecorder<ReturnType<typeof read>, string>(read));
    recorder.start();
    for (let i = 0; i < 2500; i++) {
      clock.advance(1);
      recorder.mark('move');
    }
    recorder.freeze();
    flush();
    expect(recorder.capture()!.frames).toHaveLength(1200);
    expect(recorder.capture()!.events).toHaveLength(2400);
    recorder.start();
    disposers.pop()!();
    const count = read.mock.calls.length;
    clock.advance(20);
    recorder.start();
    expect(read).toHaveBeenCalledTimes(count);
    expect(clock.pending()).toBe(0);
  });
});

describe('card-stack recorder', () => {
  it('keeps tracking touch after implicit capture transfers from the tab to the deck', () => {
    const clock = frameClock();
    const root = deck();
    root.hasPointerCapture = () => true;
    const tab = root.querySelector('button')!;
    const recorder = owned(() => createCardStackRecording(() => root));
    flush();
    recorder.start();
    flush();
    const pointerEvent = (type: string, y: number) => Object.assign(
      new MouseEvent(type, { bubbles: true, clientX: 20, clientY: y, button: 0 }),
      { pointerId: 7, isPrimary: true }
    );
    tab.dispatchEvent(pointerEvent('pointerdown', 20));
    tab.dispatchEvent(pointerEvent('lostpointercapture', 30));
    root.dispatchEvent(pointerEvent('pointermove', 70));
    clock.advance(20);
    document.dispatchEvent(pointerEvent('pointerup', 80));
    recorder.freeze();
    flush();
    const capture = recorder.capture()!;
    expect(capture.frames[1]?.data.pointer).toEqual({ id: 7, x: 20, y: 70 });
    expect(capture.events.map((event) => event.data.type)).toEqual(['pointerdown', 'lostpointercapture', 'pointermove', 'pointerup']);
    expect(capture.events[1]?.data.captureTransfer).toBe(true);
    expect(capture.frames.at(-1)?.data.pointer).toBeNull();
  });

  it('records event-time coordinates, capture targets and separate gestures without observing inspector input', () => {
    const clock = frameClock();
    const root = deck();
    const tab = root.querySelector('button')!;
    const outside = document.createElement('button');
    document.body.append(outside);
    let top = 80;
    vi.spyOn(root, 'getBoundingClientRect').mockImplementation(() => new DOMRect(50, top, 400, 600));
    Object.defineProperty(document, 'elementFromPoint', { configurable: true, value: () => tab });
    const recorder = owned(() => createCardStackRecording(() => root));
    flush();
    recorder.start();
    flush();
    const dispatch = (target: EventTarget, type: string, x = 120, y = 140) => target.dispatchEvent(Object.assign(
      new MouseEvent(type, { bubbles: true, clientX: x, clientY: y, button: 0, buttons: type === 'pointerup' ? 0 : 1 }),
      { pointerId: 7, isPrimary: true, pointerType: 'mouse', pressure: 0.5 }
    ));
    dispatch(outside, 'pointerdown');
    dispatch(outside, 'pointermove');
    expect(recorder.summary().events).toBe(0);
    dispatch(tab, 'pointerdown');
    clock.advance(16);
    top = 100;
    dispatch(root, 'pointermove', 140, 170);
    clock.advance(250);
    expect(recorder.previewEvents()).toHaveLength(2);
    dispatch(document, 'pointerup', 140, 180);
    dispatch(outside, 'pointermove');
    dispatch(tab, 'pointerdown');
    dispatch(tab, 'pointercancel');
    dispatch(root, 'pointermove');
    recorder.freeze();
    flush();
    const events = recorder.capture()!.events;
    expect(events.map((event) => event.data.type)).toEqual(['pointerdown', 'pointermove', 'pointerup', 'pointerdown', 'pointercancel']);
    expect(events[0]!.data.pointer).toMatchObject({ x: 120, y: 140, rootX: 70, rootY: 60, pointerType: 'mouse', buttons: 1 });
    expect(events[1]!).toMatchObject({ t: 16, data: { pointer: { rootX: 90, rootY: 70 }, receiver: { label: 'Deck' }, hit: { label: 'notes / tab' } } });
    expect(events[0]!.data.receiver?.instance).toBe(recorder.capture()!.frames[0]!.data.elements[1]!.instance);
    expect(pointerSegments(events).map((segment) => segment.length)).toEqual([3, 2]);
    recorder.start();
    flush();
    expect(recorder.previewEvents()).toEqual([]);
    delete (document as Partial<Document>).elementFromPoint;
  });

  it('measures both axes relative to the root and distinguishes live cards, echoes and replacement echoes', () => {
    const clock = frameClock();
    const root = deck();
    const card = root.querySelector<HTMLElement>('[data-tabs-card]')!;
    const tab = card.querySelector<HTMLElement>('[data-tabs-trigger]')!;
    card.style.zIndex = '7';
    tab.style.zIndex = '1';
    const panel = card.querySelector<HTMLElement>('[data-tabs-panel]')!;
    vi.spyOn(panel, 'getBoundingClientRect').mockReturnValue(new DOMRect(50, 180, 400, 460));
    vi.spyOn(root, 'getBoundingClientRect').mockReturnValue(new DOMRect(50, 80, 400, 600));
    vi.spyOn(card, 'getBoundingClientRect').mockReturnValue(new DOMRect(50, 140, 400, 500));
    vi.spyOn(tab, 'getBoundingClientRect').mockReturnValue(new DOMRect(150, 140, 100, 40));
    const recorder = owned(() => createCardStackRecording(() => root));
    flush();
    recorder.start();
    flush();
    const echo = card.cloneNode(true) as HTMLElement;
    echo.dataset.tabsEcho = '';
    root.append(echo);
    clock.advance(20);
    echo.replaceWith(echo.cloneNode(true));
    clock.advance(20);
    recorder.freeze();
    flush();
    const frames = recorder.capture()!.frames;
    const first = frames[0]!.data;
    expect(first.elements.map(({ x, y, part }) => ({ x, y, part }))).toEqual([
      { x: 0, y: 60, part: 'card' }, { x: 100, y: 60, part: 'tab' }
    ]);
    expect(first.elements[0]!.paint).toMatchObject({ cardZ: 7, domOrder: 0, x: 0, y: 100, width: 400, height: 460 });
    expect(first.elements[1]!.paint).toMatchObject({ cardZ: 7, domOrder: 0, localZ: 1, x: 100, y: 60 });
    expect(first.root.x).toBe(50);
    expect(first.elements[0]?.representation).toBe('live');
    expect(first.elements).toHaveLength(2); // Nested decks are not included.
    const firstEcho = frames[1]!.data.elements.find((element) => element.representation === 'echo')!;
    const secondEcho = frames[2]!.data.elements.find((element) => element.representation === 'echo')!;
    expect(firstEcho.itemId).toBe('notes');
    expect(secondEcho.instance).not.toBe(firstEcho.instance);
    expect(JSON.stringify(recorder.capture())).not.toContain('private draft');
  });

  it('detaches old targets without mixing their recordings and freezes when the page is hidden', () => {
    const clock = frameClock();
    const first = deck();
    const second = deck();
    const state = owned(() => {
      const [target, setTarget] = createSignal<HTMLElement | undefined>(first);
      return { setTarget, recorder: createCardStackRecording(target) };
    });
    flush();
    state.recorder.start();
    flush();
    first.click();
    clock.advance(20);
    state.setTarget(second);
    flush();
    expect(state.recorder.capture()?.reason).toBe('target-changed');
    expect(clock.pending()).toBe(0);
    state.recorder.start();
    flush();
    first.click();
    second.click();
    vi.spyOn(document, 'hidden', 'get').mockReturnValue(true);
    document.dispatchEvent(new Event('visibilitychange'));
    flush();
    expect(state.recorder.capture()?.reason).toBe('document-hidden');
    expect(state.recorder.capture()?.events).toHaveLength(1);
    const capture = JSON.stringify(state.recorder.capture());
    second.click();
    expect(JSON.stringify(state.recorder.capture())).toBe(capture);
    state.setTarget(undefined);
    flush();
    state.recorder.start();
    flush();
    expect(state.recorder.capture()?.reason).toBe('target-unavailable');
    expect(clock.pending()).toBe(0);
  });

  it('cancels a delayed start when its deck changes or the document is hidden', () => {
    const clock = frameClock();
    const state = owned(() => {
      const [target, setTarget] = createSignal<HTMLElement | undefined>(deck());
      return { setTarget, recorder: createCardStackRecording(target) };
    });
    flush();
    state.recorder.start({ delayMs: 2000 });
    flush();
    state.setTarget(deck());
    flush();
    clock.advance(3000);
    expect(state.recorder.status()).toBe('idle');
    expect(clock.pending()).toBe(0);
    state.recorder.start({ delayMs: 2000 });
    flush();
    vi.spyOn(document, 'hidden', 'get').mockReturnValue(true);
    document.dispatchEvent(new Event('visibilitychange'));
    flush();
    clock.advance(3000);
    expect(state.recorder.status()).toBe('idle');
    expect(state.recorder.preview()).toEqual([]);
    expect(clock.pending()).toBe(0);
  });

  it('mounts controls only when enabled, outside the deck, and cleans up while recording', () => {
    frameClock();
    const host = document.createElement('div');
    document.body.append(host);
    const [debug, setDebug] = createSignal(false);
    disposers.push(render(() => (
      <CardStack debug={debug()} items={[{ id: 'notes' }]} label="Notes" getLabel={(item) => item.id} renderTab={(item) => item.id}>
        {() => <p>Notes content</p>}
      </CardStack>
    ), host));
    flush();
    expect(document.querySelector('[data-motion-debug]')).toBeNull();
    setDebug(true);
    flush();
    const remote = document.querySelector<HTMLElement>('[data-motion-debug]')!;
    const root = host.querySelector('[data-tabs-root]')!;
    expect(root.contains(remote)).toBe(false);
    remote.querySelector('button')!.click();
    flush();
    expect(remote.dataset.state).toBe('recording');
    expect(root.hasAttribute('data-dragging')).toBe(false);
    setDebug(false);
    flush();
    expect(document.querySelector('[data-motion-debug]')).toBeNull();
  });
});

function owned<T>(create: () => T) {
  return createRoot((dispose) => { disposers.push(dispose); return create(); });
}

function deck() {
  const root = document.createElement('div');
  root.dataset.tabsRoot = '';
  root.dataset.tabOrder = 'notes';
  root.innerHTML = '<div data-tabs-card="notes"><button data-tabs-trigger="notes">Notes</button><section data-tabs-panel><input value="private draft"><div data-tabs-root><div data-tabs-card="nested"></div></div></section></div>';
  document.body.append(root);
  return root;
}

function frameClock() {
  let time = 0;
  let sequence = 0;
  const frames = new Map<number, FrameRequestCallback>();
  vi.spyOn(performance, 'now').mockImplementation(() => time);
  vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => { frames.set(++sequence, callback); return sequence; });
  vi.spyOn(window, 'cancelAnimationFrame').mockImplementation((id) => { frames.delete(id); });
  return {
    pending: () => frames.size,
    advance(ms: number) {
      time += ms;
      const callbacks = [...frames.values()];
      frames.clear();
      callbacks.forEach((callback) => callback(time));
      flush();
    }
  };
}
