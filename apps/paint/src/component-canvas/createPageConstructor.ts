import { createContext, createSignal } from 'solid-js';
import { anchorOf, layoutId, type PageLayout } from '../variants/layout';

/**
 * The page the constructor is building: parts placed on a screen the size of the MovinkPad, landscape or portrait, and
 * the drag that brings a part from a specimen into it. `build` saves the page as a layout file through the dev server
 * (`layoutsBridge.ts`), which the variant registry turns into a page `layout-<id>`.
 */
export function createPageConstructor() {
  const [placed, setPlaced] = createSignal<readonly PlacedOnScreen[]>([]);
  const [orientation, setOrientation] = createSignal<'landscape' | 'portrait'>('landscape');
  const [dragging, setDragging] = createSignal<{ part: string; at: { x: number; y: number } }>();
  let nextKey = 1;
  /** The screen element, for drops: set by the constructor's frame. */
  let screenElement: HTMLElement | undefined;
  const screen = () => screens[orientation()];
  /** CSS pixels of the screen per screen pixel as the canvas draws it now. */
  const scale = () => (screenElement ? screenElement.getBoundingClientRect().width / screen().width : 1);
  const clamp = (value: number, max: number) => Math.max(0, Math.min(max - 40, value));
  const add = (part: string, at?: { x: number; y: number }) => {
    const point = at ?? { x: screen().width / 2 - 140, y: screen().height / 2 - 160 };
    setPlaced((list) => [
      ...list,
      { key: nextKey++, part, x: clamp(point.x, screen().width), y: clamp(point.y, screen().height) }
    ]);
  };

  return {
    placed,
    orientation,
    setOrientation,
    screen,
    /** The part being dragged in from a specimen, and where the pointer is, in window coordinates. */
    dragging,
    /** Binds the screen element that takes drops. */
    bindScreen(element: HTMLElement) {
      screenElement = element;
    },
    /** Places `part` with its top left corner at `at`, screen pixels, or in the screen's middle. */
    add,
    /** Moves a placed part by `dx`, `dy` window pixels, as the canvas draws the screen. */
    moveBy(key: number, dx: number, dy: number) {
      const factor = scale();
      setPlaced((list) =>
        list.map((item) =>
          item.key === key
            ? {
                ...item,
                x: clamp(item.x + dx / factor, screen().width),
                y: clamp(item.y + dy / factor, screen().height)
              }
            : item
        )
      );
    },
    remove(key: number) {
      setPlaced((list) => list.filter((item) => item.key !== key));
    },
    /** Replaces the page with a saved one, in the orientation its screen had. */
    load(layout: PageLayout) {
      setOrientation(layout.screen.height > layout.screen.width ? 'portrait' : 'landscape');
      setPlaced(layout.parts.map((part) => ({ key: nextKey++, part: part.part, x: part.x, y: part.y })));
    },
    /**
     * Starts dragging `part` from a specimen with the press `event`; dropping it on the screen places it under the
     * pointer, anywhere else drops nothing. Follows the press with pointer capture on the pressed element.
     */
    startDrag(part: string, event: PointerEvent) {
      const element = event.currentTarget as HTMLElement;
      element.setPointerCapture(event.pointerId);
      setDragging({ part, at: { x: event.clientX, y: event.clientY } });
      let at = { x: event.clientX, y: event.clientY };
      const move = (next: PointerEvent) => {
        at = { x: next.clientX, y: next.clientY };
        setDragging({ part, at });
      };
      // A lift drops the part where the pointer was last; a cancel, or capture lost elsewhere, drops nothing.
      const end = (last: Event) => {
        element.removeEventListener('pointermove', move);
        element.removeEventListener('pointerup', end);
        element.removeEventListener('pointercancel', end);
        element.removeEventListener('lostpointercapture', end);
        setDragging(undefined);
        const box = screenElement?.getBoundingClientRect();
        if (last.type === 'pointerup' && box && inside(box, at.x, at.y)) {
          const factor = scale();
          // The part's header lands under the pointer.
          add(part, { x: (at.x - box.left) / factor - 20, y: (at.y - box.top) / factor - 14 });
        }
      };
      element.addEventListener('pointermove', move);
      element.addEventListener('pointerup', end);
      element.addEventListener('pointercancel', end);
      element.addEventListener('lostpointercapture', end);
    },
    /**
     * The page as a layout named `name`, with each part's measured size (`sizeOf`, screen pixels) and the edges it is
     * nearest to.
     */
    layout(name: string, sizeOf: (key: number) => { width: number; height: number }): PageLayout {
      const parts = placed().map((item) => {
        const box = { x: item.x, y: item.y, ...sizeOf(item.key) };
        return { part: item.part, ...box, anchor: anchorOf(box, screen()) };
      });
      return { version: 1, name, screen: screen(), parts };
    },
    /** Saves `layout` as the page file of its name; resolves to the variant's id, or rejects with the reason. */
    async build(layout: PageLayout) {
      const id = layoutId(layout.name);
      const response = await fetch(`${endpoint}/${id}`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(layout)
      });
      if (!response.ok || !response.headers.get('content-type')?.includes('json')) {
        throw new Error(response.ok ? 'No dev server: pages are saved only by `vite dev`.' : await response.text());
      }

      return `layout-${id}`;
    },
    /** The saved pages by id, or none without the dev server. */
    async saved(): Promise<Record<string, unknown>> {
      try {
        const response = await fetch(endpoint);
        return response.ok && response.headers.get('content-type')?.includes('json') ? await response.json() : {};
      } catch {
        return {};
      }
    },
    /** Measures the screen's scale, for sizes measured on screen. */
    scale
  };
}

/** A part on the constructor's screen: its top left corner in screen pixels. */
export type PlacedOnScreen = { key: number; part: string; x: number; y: number };

/** The page constructor of the canvas, for specimens that can be dragged into it. */
export const PageConstructor = createContext<ReturnType<typeof createPageConstructor> | undefined>(undefined);

/**
 * The MovinkPad's screen in CSS pixels: 2880 × 1800 at 280 dpi with a device pixel ratio of 1.75 is 1646 × 1029;
 * Chrome's bar takes about 120 of them, so a page has 1646 × 909 in landscape and 1029 × 1526 in portrait.
 */
const screens = {
  landscape: { width: 1646, height: 909 },
  portrait: { width: 1029, height: 1526 }
} as const;

function inside(box: DOMRect, x: number, y: number) {
  return x >= box.left && x <= box.right && y >= box.top && y <= box.bottom;
}

const endpoint = '/__paint-layouts';
