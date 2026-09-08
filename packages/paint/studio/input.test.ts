// @vitest-environment jsdom
import { flush } from 'solid-js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { defaultBrush } from './brush';
import { defaultCamera, screenToWorld } from './camera';
import { attachInput } from './input';
import { createPaintNavigation as createNavigationPuck } from './paintNavigation';
import type { PaintCommand } from './protocol';

const disposals: (() => void)[] = [];
afterEach(() => {
  disposals.splice(0).forEach((dispose) => dispose());
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('input to worker contract', () => {
  it.each(['mouse', 'pen'])(
    'captures Alt at %s contact without changing the preset or leaking to later strokes',
    (pointerType) => {
      const brush = defaultBrush();
      const saved = structuredClone(brush);
      const { pointer, commands } = setup(undefined, () => brush);
      pointer('pointerdown', 400, 300, { pointerType, altKey: true });
      pointer('pointermove', 410, 310, { pointerType, altKey: false });
      pointer('pointercancel', 410, 310, { pointerType });
      pointer('pointerdown', 400, 300, { pointerType, altKey: false });
      pointer('pointerup', 410, 310, { pointerType });
      const starts = commands.filter((command) => command.type === 'begin');
      expect(starts.map((command) => command.modifiers)).toEqual([{ altKey: true }, { altKey: false }]);
      expect(starts.every((command) => command.brush === brush)).toBe(true);
      expect(brush).toEqual(saved);
    }
  );
  it('consumes Alt canvas actions without drawing, and freezes the picked world point across movement', () => {
    const run = vi.fn();
    const camera = () => ({ ...defaultCamera(), zoom: 0.2, angle: Math.PI / 3, mirrored: true });
    const { pointer, commands } = setup(undefined, defaultBrush, { enabled: (event) => event.altKey, run }, camera);
    pointer('pointerdown', 420, 330, { altKey: true, pointerType: 'pen' });
    expect(run).toHaveBeenCalledExactlyOnceWith(
      screenToWorld({ x: 420, y: 330 }, camera(), { width: 800, height: 600 })
    );
    pointer('pointermove', 470, 350, { pointerType: 'pen' });
    pointer('pointerup', 480, 350, { pointerType: 'pen' });
    expect(commands).toEqual([]);
    pointer('pointerdown', 400, 300);
    pointer('pointermove', 410, 310, { altKey: true });
    pointer('pointerup', 410, 310);
    expect(commands.map((command) => command.type)).toEqual(['begin', 'samples', 'end']);
    expect(run).toHaveBeenCalledOnce();
  });
  it('lets an armed touch pick paint without panning and releases the action on cancellation', () => {
    let armed = true;
    const run = vi.fn(() => {
      armed = false;
    });
    const { pointer, commands, navigate } = setup(undefined, defaultBrush, { enabled: () => armed, run });
    pointer('pointerdown', 400, 300, { pointerType: 'touch' });
    pointer('pointerdown', 420, 320, { pointerType: 'touch', pointerId: 2 });
    pointer('pointermove', 430, 340, { pointerType: 'touch', pointerId: 2 });
    pointer('pointermove', 420, 320, { pointerType: 'touch' });
    pointer('pointercancel', 420, 320, { pointerType: 'touch' });
    expect(navigate).not.toHaveBeenCalled();
    expect(commands).toEqual([]);
    pointer('pointerdown', 400, 300);
    pointer('pointerup', 400, 300);
    expect(commands.map((command) => command.type)).toEqual(['begin', 'end']);
  });
  it('uses raw pen samples once, excluding the corresponding pointermove batch', () => {
    vi.stubGlobal('isSecureContext', true);
    vi.stubGlobal('onpointerrawupdate', null);
    vi.stubGlobal('PointerEvent', MouseEvent);
    const { commands, pointer, rawUpdate } = setup();
    pointer('pointerdown', 0, 0, { pointerType: 'pen', pressure: 0.2 });
    const data = {
      pointerType: 'pen',
      getCoalescedEvents: () => [
        { clientX: 10, clientY: 10, pressure: 0.4, timeStamp: 1 },
        { clientX: 20, clientY: 20, pressure: 0.7, timeStamp: 2 }
      ]
    };
    pointer('pointerrawupdate', 20, 20, data);
    expect(commands.at(-1)).toMatchObject({ type: 'samples', samples: [{ pressure: 0.4 }, { pressure: 0.7 }] });
    pointer('pointermove', 20, 20, data);
    pointer('pointerup', 20, 20, { pointerType: 'pen' });
    expect(
      commands
        .filter((command) => command.type === 'samples')
        .flatMap((command) => command.samples)
        .map((sample) => sample.pressure)
    ).toEqual([0.4, 0.7]);
    expect(rawUpdate).toHaveBeenCalledOnce();
  });
  it('preserves tilt, wheel and barrel rotation on the first and coalesced samples', () => {
    const { commands, pointer } = setup();
    pointer('pointerdown', 10, 10, { pointerType: 'pen', tiltX: 30, tiltY: -10, twist: 350, tangentialPressure: 0.4 });
    expect(commands[0]).toMatchObject({ samples: [{ tiltX: 30, tiltY: -10, rotation: 350, tangentialPressure: 0.4 }] });
    pointer('pointermove', 20, 20, {
      pointerType: 'pen',
      getCoalescedEvents: () => [
        {
          pointerType: 'pen',
          clientX: 20,
          clientY: 20,
          pressure: 0.6,
          tiltX: 40,
          tiltY: -20,
          twist: 5,
          tangentialPressure: 0.2,
          timeStamp: 2
        }
      ]
    });
    expect(commands[1]).toMatchObject({ samples: [{ tiltX: 40, tiltY: -20, rotation: 5, tangentialPressure: 0.2 }] });
  });
  it('builds up a stationary ABR stroke and stops the timer on pen-up and disposal', () => {
    vi.useFakeTimers();
    const { commands, pointer } = setup(undefined, () => ({
      ...defaultBrush(),
      engine: { id: 'abr', settings: { values: { useBuildUp: true } } }
    }));
    pointer('pointerdown', 10, 10);
    vi.advanceTimersByTime(120);
    expect(commands.filter((command) => command.type === 'samples').length).toBeGreaterThan(0);
    pointer('pointerup', 10, 10);
    const count = commands.length;
    vi.advanceTimersByTime(120);
    expect(commands.length).toBe(count);
    pointer('pointerdown', 10, 10);
    disposals.splice(0).forEach((dispose) => dispose());
    const disposed = commands.length;
    vi.advanceTimersByTime(120);
    expect(commands.length).toBe(disposed);
  });
  it('hides the pen ring only during drawing and keeps mouse and hover feedback', () => {
    const { pointer, cursor } = setup();
    pointer('pointermove', 10, 20, { pointerType: 'pen', buttons: 0 });
    expect(cursor).toHaveBeenLastCalledWith({ x: 10, y: 20 });
    pointer('pointerdown', 10, 20, { pointerType: 'pen' });
    expect(cursor).toHaveBeenLastCalledWith(undefined);
    pointer('pointermove', 20, 20, { pointerType: 'pen' });
    expect(cursor).toHaveBeenLastCalledWith(undefined);
    pointer('pointerup', 20, 20, { pointerType: 'pen' });
    expect(cursor).toHaveBeenLastCalledWith({ x: 20, y: 20 });
    pointer('pointerdown', 30, 20);
    expect(cursor).toHaveBeenLastCalledWith({ x: 30, y: 20 });
  });
  it('does not feed a duplicate release into the filter for a stationary pen tap', () => {
    const { commands, pointer } = setup();
    pointer('pointerdown', 10, 20, { pointerType: 'pen', pressure: 0.3 });
    pointer('pointerup', 10, 20, { pointerType: 'pen', pressure: 0 });
    expect(commands.map((command) => command.type)).toEqual(['begin', 'end']);
  });
  it('uses the last contact pressure when the release adds a new endpoint', () => {
    const { commands, pointer } = setup();
    pointer('pointerdown', 10, 20, { pointerType: 'pen', pressure: 0.3 });
    pointer('pointerup', 20, 20, { pointerType: 'pen', pressure: 0 });
    expect(commands[1]).toMatchObject({ type: 'samples', samples: [{ x: -380, y: -280, pressure: 0.3 }] });
  });
  it('routes lasso samples in world coordinates and cancels interrupted selections without painting', () => {
    const selection = { enabled: () => true, begin: vi.fn(), move: vi.fn(), end: vi.fn(), cancel: vi.fn() };
    const { commands, pointer } = setup(selection);
    pointer('pointerdown', 400, 300);
    pointer('pointermove', 420, 330);
    pointer('pointerup', 440, 350);
    expect(selection.begin).toHaveBeenCalledWith({ x: 0, y: 0 });
    expect(selection.move).toHaveBeenLastCalledWith({ x: 40, y: 50 });
    expect(selection.end).toHaveBeenCalledOnce();
    pointer('pointerdown', 400, 300);
    pointer('pointercancel', 450, 350);
    expect(selection.cancel).toHaveBeenCalledOnce();
    expect(selection.end).toHaveBeenCalledOnce();
    expect(commands).toEqual([]);
  });
  it('forwards movement without waiting for a frame and sends the release endpoint before end', () => {
    const { canvas, commands, pointer } = setup();
    pointer('pointerdown', 10, 20);
    pointer('pointermove', 30, 40);
    expect(commands.map((c) => c.type)).toEqual(['begin', 'samples']);
    expect(requestAnimationFrame).not.toHaveBeenCalled();
    pointer('pointerup', 40, 50);
    expect(commands.map((c) => c.type)).toEqual(['begin', 'samples', 'samples', 'end']);
    expect(commands[0]).toMatchObject({ samples: [{ x: -390, y: -280, pressure: 1 }] });
    expect(commands[1]).toMatchObject({ samples: [{ x: -370, y: -260 }] });
    expect(commands[2]).toMatchObject({ samples: [{ x: -360, y: -250 }] });
    expect(canvas.setPointerCapture).toHaveBeenCalledWith(1);
  });
  it('preserves each coalesced pressure sample in one message', () => {
    const { commands, pointer } = setup();
    pointer('pointerdown', 10, 20, { pointerType: 'pen', pressure: 0.2 });
    pointer('pointermove', 30, 40, {
      pointerType: 'pen',
      pressure: 0.9,
      getCoalescedEvents: () => [
        { clientX: 20, clientY: 30, pressure: 0.4, timeStamp: 10 },
        { clientX: 30, clientY: 40, pressure: 0.9, timeStamp: 20 }
      ]
    });
    pointer('pointerup', 30, 40, { pointerType: 'pen', pressure: 0 });
    const batch = commands.find((c) => c.type === 'samples');
    expect(batch?.samples.map((s) => s.pressure)).toEqual([0.4, 0.9]);
    expect(batch?.samples.map((s) => s.time)).toEqual([10, 20]);
  });
  it('preserves pending ink on pointercancel and can start another stroke', () => {
    const { commands, pointer } = setup();
    pointer('pointerdown', 0, 0);
    pointer('pointermove', 5, 5);
    pointer('pointercancel', 5, 5);
    pointer('pointerdown', 10, 10);
    expect(commands.map((c) => c.type)).toEqual(['begin', 'samples', 'end', 'begin']);
  });
  it('uses touch only for navigation and suppresses palm input during pen drawing', () => {
    const { commands, pointer, navigate } = setup();
    pointer('pointerdown', 20, 20, { pointerType: 'touch' });
    pointer('pointermove', 40, 40, { pointerType: 'touch' });
    pointer('pointerup', 40, 40, { pointerType: 'touch' });
    expect(commands).toHaveLength(0);
    expect(navigate).toHaveBeenCalled();
    navigate.mockClear();
    pointer('pointerdown', 10, 10, { pointerType: 'pen' });
    pointer('pointerdown', 20, 20, { pointerType: 'touch', pointerId: 2 });
    pointer('pointermove', 40, 40, { pointerType: 'touch', pointerId: 2 });
    expect(navigate).not.toHaveBeenCalled();
    expect(commands).toHaveLength(1);
  });
  it('commits real samples on capture loss instead of deleting the stroke', () => {
    const { commands, pointer } = setup();
    pointer('pointerdown', 0, 0);
    pointer('pointermove', 20, 20);
    pointer('lostpointercapture', 20, 20);
    expect(commands.map((c) => c.type)).toEqual(['begin', 'samples', 'end']);
  });
  it('ignores delayed capture loss when a new stroke owns the pointer', () => {
    const { canvas, commands, pointer } = setup();
    pointer('pointerdown', 0, 0);
    pointer('pointerup', 10, 10);
    pointer('pointerdown', 20, 20);
    vi.mocked(canvas.hasPointerCapture).mockReturnValue(true);
    pointer('lostpointercapture', 10, 10);
    pointer('pointermove', 30, 30);
    pointer('pointerup', 40, 40);
    expect(commands.map((c) => c.type)).toEqual(['begin', 'samples', 'end', 'begin', 'samples', 'samples', 'end']);
  });
  it('holds Space to open navigation at the pointer and releases it without drawing', () => {
    const { pointer, puck, commands } = setup();
    pointer('pointermove', 220, 180);
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space' }));
    flush();
    expect(puck.center()).toEqual({ x: 220, y: 180 });
    pointer('pointerdown', 200, 200);
    expect(commands).toHaveLength(0);
    window.dispatchEvent(new KeyboardEvent('keyup', { code: 'Space' }));
    flush();
    expect(puck.center()).toBeUndefined();
  });
  it('selects a right-drag action without sending paint commands or reopening on contextmenu', () => {
    const { pointer, puck, commands, navigate, canvas } = setup();
    pointer('pointerdown', 400, 300, { button: 2 });
    flush();
    pointer('pointermove', 300, 300);
    flush();
    expect(puck.activeAction()).toBe('rotate');
    pointer('pointermove', 280, 310);
    pointer('pointerup', 270, 320, { button: 2 });
    canvas.dispatchEvent(new MouseEvent('contextmenu', { cancelable: true }));
    expect(navigate).toHaveBeenCalled();
    expect(commands).toHaveLength(0);
    flush();
    expect(puck.center()).toBeUndefined();
  });
  it('does not interrupt a stroke with Space or leave navigation alive after blur', () => {
    const { pointer, puck } = setup();
    pointer('pointerdown', 20, 20);
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space' }));
    flush();
    expect(puck.center()).toBeUndefined();
    pointer('pointerup', 20, 20);
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space' }));
    flush();
    expect(puck.center()).toBeDefined();
    window.dispatchEvent(new Event('blur'));
    flush();
    expect(puck.center()).toBeUndefined();
  });
  it('keeps CSS coordinates independent of canvas backing resolution', () => {
    const { canvas, commands, pointer } = setup();
    canvas.width = 1600;
    canvas.height = 1200;
    pointer('pointerdown', 400, 300);
    expect(commands[0]).toMatchObject({ samples: [{ x: 0, y: 0 }] });
  });
});

function setup(
  selection?: Parameters<typeof attachInput>[1]['selection'],
  brush = defaultBrush,
  canvasAction?: Parameters<typeof attachInput>[1]['canvasAction'],
  camera = defaultCamera
) {
  vi.stubGlobal(
    'requestAnimationFrame',
    vi.fn(() => 1)
  );
  vi.stubGlobal('cancelAnimationFrame', vi.fn());
  const canvas = document.createElement('canvas');
  canvas.setPointerCapture = vi.fn();
  canvas.hasPointerCapture = vi.fn(() => false);
  const commands: PaintCommand[] = [],
    navigate = vi.fn();
  const cursor = vi.fn(),
    rawUpdate = vi.fn();
  const puck = createNavigationPuck({ size: () => ({ width: 800, height: 600 }), camera: defaultCamera, navigate });
  disposals.push(
    attachInput(canvas, {
      camera,
      size: () => ({ width: 800, height: 600 }),
      brush,
      ready: () => true,
      navigate,
      send: (c) => commands.push(c),
      cursor,
      rawUpdate,
      canvasAction,
      selection,
      puck
    })
  );
  const pointer = (type: string, x: number, y: number, extra: Record<string, unknown> = {}) => {
    const event = new MouseEvent(type, { clientX: x, clientY: y, button: 0, buttons: 1 });
    for (const [key, value] of Object.entries({ pointerId: 1, pointerType: 'mouse', pressure: 1, ...extra }))
      Object.defineProperty(event, key, { value });
    canvas.dispatchEvent(event);
  };
  return { canvas, commands, navigate, pointer, puck, cursor, rawUpdate };
}
