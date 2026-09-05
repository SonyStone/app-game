// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { defaultBrush } from './brush';
import { defaultCamera } from './camera';
import { attachInput } from './input';
import type { PaintCommand } from './protocol';

const disposals: (() => void)[] = [];
afterEach(() => {
  disposals.splice(0).forEach((dispose) => dispose());
  vi.unstubAllGlobals();
});

describe('input to worker contract', () => {
  it('sends a tap as begin/end and flushes samples before pointerup', () => {
    const { canvas, commands, pointer } = setup();
    pointer('pointerdown', 10, 20);
    pointer('pointermove', 30, 40);
    pointer('pointerup', 40, 50);
    expect(commands.map((c) => c.type)).toEqual(['begin', 'samples', 'end']);
    expect(commands[0]).toMatchObject({ samples: [{ x: -390, y: -280, pressure: 1 }] });
    expect(commands[1]).toMatchObject({
      samples: [
        { x: -370, y: -260 },
        { x: -360, y: -250 }
      ]
    });
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
    expect(batch?.samples.map((s) => s.pressure)).toEqual([0.4, 0.9, 0.9]);
  });
  it('discards pending input on pointercancel and can start another stroke', () => {
    const { commands, pointer } = setup();
    pointer('pointerdown', 0, 0);
    pointer('pointermove', 5, 5);
    pointer('pointercancel', 5, 5);
    pointer('pointerdown', 10, 10);
    expect(commands.map((c) => c.type)).toEqual(['begin', 'cancel', 'begin']);
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
  it('keeps CSS coordinates independent of canvas backing resolution', () => {
    const { canvas, commands, pointer } = setup();
    canvas.width = 1600;
    canvas.height = 1200;
    pointer('pointerdown', 400, 300);
    expect(commands[0]).toMatchObject({ samples: [{ x: 0, y: 0 }] });
  });
});

function setup() {
  vi.stubGlobal(
    'requestAnimationFrame',
    vi.fn(() => 1)
  );
  vi.stubGlobal('cancelAnimationFrame', vi.fn());
  const canvas = document.createElement('canvas');
  canvas.setPointerCapture = vi.fn();
  const commands: PaintCommand[] = [],
    navigate = vi.fn();
  disposals.push(
    attachInput(canvas, {
      camera: defaultCamera,
      size: () => ({ width: 800, height: 600 }),
      brush: defaultBrush,
      ready: () => true,
      navigate,
      send: (c) => commands.push(c),
      cursor: vi.fn(),
      puck: vi.fn()
    })
  );
  const pointer = (type: string, x: number, y: number, extra: Record<string, unknown> = {}) => {
    const event = new MouseEvent(type, { clientX: x, clientY: y, button: 0, buttons: 1 });
    for (const [key, value] of Object.entries({ pointerId: 1, pointerType: 'mouse', pressure: 1, ...extra }))
      Object.defineProperty(event, key, { value });
    canvas.dispatchEvent(event);
  };
  return { canvas, commands, navigate, pointer };
}
