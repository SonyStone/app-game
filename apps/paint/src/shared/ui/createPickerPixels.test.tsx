// @vitest-environment jsdom
import { render } from '@solidjs/web';
import { createSignal, flush } from 'solid-js';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { CoolorusWheel } from '../../features/coolorus-wheel/CoolorusWheel';
import { HueTriangle } from '../../features/hue-triangle/HueTriangle';
import { ColorDisc } from '../../variants/zen/ColorDisc';
import { PickerScale } from './createPickerPixels';

let dispose: (() => void) | undefined;
const frames = new Map<number, FrameRequestCallback>();
const resized = new Map<Element, ResizeObserverCallback>();
let id = 0;
beforeEach(() => {
  vi.stubGlobal('devicePixelRatio', 2);
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    frames.set(++id, callback);
    return id;
  });
  vi.stubGlobal('cancelAnimationFrame', (frame: number) => {
    frames.delete(frame);
  });
  vi.stubGlobal(
    'ResizeObserver',
    class {
      constructor(private callback: ResizeObserverCallback) {}
      observe(element: Element) {
        resized.set(element, this.callback);
      }
      unobserve(element: Element) {
        resized.delete(element);
      }
      disconnect() {
        resized.clear();
      }
    }
  );
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(160);
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 0, 80, 80));
});
afterEach(() => {
  dispose?.();
  dispose = undefined;
  frames.clear();
  resized.clear();
  document.body.replaceChildren();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it.each([ColorDisc, HueTriangle, CoolorusWheel])(
  'sizes %s from displayed width and repaints only bitmap inputs',
  (Picker) => {
    const painted = vi.fn();
    const allocate = vi.fn((width: number, height: number) => ({
      width,
      height,
      data: new Uint8ClampedArray(width * height * 4)
    }));
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
      createImageData: allocate,
      putImageData: painted
    } as unknown as ReturnType<HTMLCanvasElement['getContext']>);
    const [color, setColor] = createSignal('#ff0000');
    const [scale, setScale] = createSignal(0.5);
    dispose = render(
      () => (
        <PickerScale value={scale}>
          <Picker
            color={color()}
            onInput={() => {}}
            onCommit={() => {}}
            onChange={() => {}}
            onSettle={() => {}}
            settings={{ hues: 'rgb', lockLightness: false }}
            onSettings={() => {}}
          />
        </PickerScale>
      ),
      document.body
    );
    drain();
    const canvas = document.querySelector('canvas')!;
    expect(canvas.width).toBe(160);
    expect(painted).toHaveBeenCalled();
    painted.mockClear();
    allocate.mockClear();

    setColor('#cc0000');
    drain();
    expect(painted).not.toHaveBeenCalled();

    setColor('#00cc00');
    drain();
    expect(painted).toHaveBeenCalledOnce();
    expect(allocate).not.toHaveBeenCalled();

    setScale(0.25);
    drain();
    expect(canvas.width).toBe(80);
    const notify = resized.get(canvas)!;
    notify(
      [{ target: canvas, contentRect: new DOMRect(0, 0, 200, 200) } as unknown as ResizeObserverEntry],
      {} as ResizeObserver
    );
    drain();
    expect(canvas.width).toBe(100);

    vi.stubGlobal('devicePixelRatio', 3);
    window.dispatchEvent(new Event('resize'));
    drain();
    expect(canvas.width).toBe(150);
    painted.mockClear();
    setColor('#0000cc');
    flush();
    dispose();
    dispose = undefined;
    drain();
    expect(painted).not.toHaveBeenCalled();
  }
);

function drain() {
  flush();
  const pending = [...frames.values()];
  frames.clear();
  pending.forEach((callback) => callback(0));
  flush();
}
