// @vitest-environment jsdom
import { render } from '@solidjs/web';
import { ok } from 'neverthrow';
import { flush } from 'solid-js';
import { afterEach, beforeAll, expect, it, vi } from 'vitest';
import type { EngineHandlers, EngineInit, ExecutionMode } from '../../features/engine/openPaintTransport';
import { LayoutStudio } from './LayoutStudio';
import type { PageLayout } from './pageLayout';
import { layoutParts } from './parts';

const transports = vi.hoisted(() => ({ opened: [] as unknown[] }));
vi.mock('../../features/engine/openPaintTransport', () => ({
  openPaintTransport: (mode: ExecutionMode, canvas: HTMLCanvasElement, init: EngineInit, handlers: EngineHandlers) => {
    const transport = { mode, canvas, init, handlers, post: vi.fn(() => ok()), close: vi.fn() };
    transports.opened.push(transport);
    return ok(transport);
  }
}));

let dispose: (() => void) | undefined;

beforeAll(() => {
  // jsdom lacks what the parts and the session measure with.
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
  globalThis.IntersectionObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
    takeRecords() {
      return [];
    }
  } as unknown as typeof IntersectionObserver;
  globalThis.PointerEvent ??= class extends MouseEvent {
    pointerId = 0;
    pointerType = '';
  } as unknown as typeof PointerEvent;
  window.matchMedia ??= (query: string) =>
    ({
      matches: false,
      media: query,
      addEventListener() {},
      removeEventListener() {},
      addListener() {},
      removeListener() {}
    }) as unknown as MediaQueryList;
});

afterEach(() => {
  dispose?.();
  dispose = undefined;
  transports.opened.length = 0;
  document.body.replaceChildren();
  localStorage.clear();
});

it('shows every part of a page over the drawing session where the layout places it, without unknown ones', () => {
  const ids = Object.keys(layoutParts);
  const layout: PageLayout = {
    version: 1,
    name: 'Everything',
    screen: { width: 1600, height: 900 },
    parts: [
      ...ids.map((part, index) => ({
        part,
        x: 20 + index * 10,
        y: 20,
        width: 280,
        height: 300,
        anchor: { x: 'left', y: 'top' } as const
      })),
      { part: 'gone', x: 0, y: 0, width: 10, height: 10, anchor: { x: 'right', y: 'bottom' } }
    ]
  };

  dispose = render(() => <LayoutStudio layout={layout} />, document.body);
  flush();

  const placed = [...document.querySelectorAll<HTMLElement>('[class*="part"]')].filter((element) => element.style.left);
  expect(placed).toHaveLength(ids.length);
  expect(placed[0]!.style.left).toBe('20px');
  expect(document.querySelector('[aria-label="Layer name"]')).toBeTruthy();
  expect(transports.opened).toHaveLength(1);
});
