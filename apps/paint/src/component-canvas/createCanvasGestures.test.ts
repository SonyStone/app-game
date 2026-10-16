// @vitest-environment jsdom
import { createRoot, flush } from 'solid-js';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { createCanvasCamera } from './createCanvasCamera';
import { createCanvasGestures } from './createCanvasGestures';

// jsdom has no PointerEvent, which the canvas constructs to take a finger back from a component.
globalThis.PointerEvent ??= class extends MouseEvent {
  pointerId: number;
  pointerType: string;
  constructor(type: string, init: PointerEventInit = {}) {
    super(type, init);
    this.pointerId = init.pointerId ?? 0;
    this.pointerType = init.pointerType ?? '';
  }
} as unknown as typeof PointerEvent;

let dispose: (() => void) | undefined;
let camera: ReturnType<typeof createCanvasCamera>;
let seen: string[];
let background: HTMLElement;
let component: HTMLElement;
let strip: HTMLElement;
let star: HTMLElement;

beforeEach(() => {
  localStorage.clear();
  seen = [];
  document.body.innerHTML = `
    <div id="viewport">
      <div id="world">
        <div id="background"></div>
        <div data-canvas-content><div id="component"></div></div>
        <canvas id="strip" data-canvas-content data-canvas-touch-pans></canvas>
        <button id="star"></button>
      </div>
    </div>`;
  background = document.getElementById('background')!;
  component = document.getElementById('component')!;
  strip = document.getElementById('strip')!;
  star = document.getElementById('star')!;
  for (const element of [component, strip, star]) {
    for (const type of ['pointerdown', 'pointermove', 'pointerup', 'pointercancel', 'click']) {
      element.addEventListener(type, (event) =>
        seen.push(`${element.id} ${(event as PointerEvent).pointerType ?? ''} ${type}`)
      );
    }
  }

  createRoot((disposeRoot) => {
    dispose = disposeRoot;
    const viewport = document.getElementById('viewport')!;
    camera = createCanvasCamera({
      world: () => document.getElementById('world')!,
      viewport: () => ({ width: 1000, height: 800 })
    });
    createCanvasGestures({ viewport: () => viewport, camera });
  });
});

afterEach(() => {
  dispose?.();
  dispose = undefined;
});

it('pans with one finger from empty space', () => {
  pointer(background, 'pointerdown', 'touch', 100, 100, 1);
  pointer(background, 'pointermove', 'touch', 130, 90, 1);
  pointer(background, 'pointerup', 'touch', 130, 90, 1);

  expect(camera.current()).toEqual({ x: 30, y: -10, zoom: 1 });
});

it('leaves one finger on a component to the component', () => {
  pointer(component, 'pointerdown', 'touch', 100, 100, 1);
  pointer(component, 'pointermove', 'touch', 130, 100, 1);
  pointer(component, 'pointerup', 'touch', 130, 100, 1);

  expect(camera.current()).toEqual({ x: 0, y: 0, zoom: 1 });
  expect(seen).toEqual(['component touch pointerdown', 'component touch pointermove', 'component touch pointerup']);
});

it('turns a component touch into a pinch when a second finger lands, taking it back from the component', () => {
  pointer(component, 'pointerdown', 'touch', 100, 100, 1);
  pointer(background, 'pointerdown', 'touch', 200, 100, 2);
  // The fingers spread from 100 to 200 px apart around the same center.
  pointer(component, 'pointermove', 'touch', 50, 100, 1);
  pointer(background, 'pointermove', 'touch', 250, 100, 2);
  pointer(component, 'pointerup', 'touch', 50, 100, 1);
  pointer(background, 'pointerup', 'touch', 250, 100, 2);

  expect(camera.current()).toEqual({ x: -150, y: -100, zoom: 2 });
  expect(seen).toEqual(['component touch pointerdown', 'component touch pointercancel']);
});

it('pans with a finger on a test strip, which only the pen and the mouse draw on', () => {
  pointer(strip, 'pointerdown', 'touch', 100, 100, 1);
  pointer(strip, 'pointermove', 'touch', 100, 140, 1);
  pointer(strip, 'pointerup', 'touch', 100, 140, 1);
  pointer(strip, 'pointerdown', 'pen', 100, 100, 2);
  pointer(strip, 'pointerup', 'pen', 100, 100, 2);

  expect(camera.current()).toEqual({ x: 0, y: 40, zoom: 1 });
  expect(seen).toEqual(['strip pen pointerdown', 'strip pen pointerup']);
});

it('never moves with the pen', () => {
  pointer(background, 'pointerdown', 'pen', 100, 100, 1);
  pointer(background, 'pointermove', 'pen', 200, 200, 1);
  pointer(background, 'pointerup', 'pen', 200, 200, 1);

  expect(camera.current()).toEqual({ x: 0, y: 0, zoom: 1 });
});

it('pans with the middle mouse button from a component, which sees none of it', () => {
  pointer(component, 'pointerdown', 'mouse', 100, 100, 1, 1);
  pointer(component, 'pointermove', 'mouse', 120, 100, 1, 1);
  pointer(component, 'pointerup', 'mouse', 120, 100, 1, 1);
  click(component, 120, 100);

  expect(camera.current()).toEqual({ x: 20, y: 0, zoom: 1 });
  expect(seen).toEqual([]);
});

it('swallows the click after a pan from a button, but lets a tap click it', () => {
  pointer(star, 'pointerdown', 'mouse', 100, 100, 1);
  pointer(star, 'pointermove', 'mouse', 140, 100, 1);
  pointer(star, 'pointerup', 'mouse', 140, 100, 1);
  click(star, 140, 100);
  expect(seen).toEqual(['star mouse pointerdown']);

  seen = [];
  pointer(star, 'pointerdown', 'mouse', 300, 100, 1);
  pointer(star, 'pointerup', 'mouse', 302, 100, 1);
  click(star, 302, 100);
  expect(seen).toEqual(['star mouse pointerdown', 'star  click']);
});

it('zooms around a point, keeping it in place, within limits', () => {
  camera.zoomAt({ x: 100, y: 50 }, 2);
  expect(camera.current()).toEqual({ x: -100, y: -50, zoom: 2 });

  camera.zoomAt({ x: 0, y: 0 }, 100);
  expect(camera.current().zoom).toBe(4);
});

it('remembers the camera, and starts afresh from a malformed one', () => {
  localStorage.setItem('paint.componentCanvas.camera', JSON.stringify({ version: 1, x: 10, y: 20, zoom: 9 }));
  createRoot((disposeRoot) => {
    const remembered = createCanvasCamera({ world: () => undefined, viewport: () => ({ width: 1, height: 1 }) });
    expect(remembered.remembered).toBe(true);
    expect(remembered.current()).toEqual({ x: 10, y: 20, zoom: 4 });
    disposeRoot();
  });

  localStorage.setItem('paint.componentCanvas.camera', JSON.stringify({ version: 2, x: 10, y: 20, zoom: 1 }));
  createRoot((disposeRoot) => {
    expect(createCanvasCamera({ world: () => undefined, viewport: () => ({ width: 1, height: 1 }) }).remembered).toBe(
      false
    );
    disposeRoot();
  });
});

/**
 * Dispatches a pointer event on `target` and settles signals, as the browser does between events. jsdom has no
 * PointerEvent constructor, so a MouseEvent carries `pointerType` and `pointerId`.
 */
function pointer(
  target: Element,
  type: string,
  pointerType: string,
  clientX: number,
  clientY: number,
  pointerId: number,
  button = 0
) {
  target.dispatchEvent(
    Object.assign(new MouseEvent(type, { bubbles: true, cancelable: true, clientX, clientY, button }), {
      pointerType,
      pointerId
    })
  );
  flush();
}

function click(target: Element, clientX: number, clientY: number) {
  target.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, clientX, clientY }));
  flush();
}
