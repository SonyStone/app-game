import { createEventListener } from '@solid-primitives/event-listener';
import { createContext, createSignal, useContext } from 'solid-js';
import type { Point } from './createSketchCanvas';

/**
 * The screen a variant lives on: the window on the gallery page, or a box of a page that shows several variants at
 * once, such as the component canvas. A variant places itself with `position: fixed`, so a box must be its containing
 * block (`contain: layout`), and it reads every position, size and window event through its screen instead of the
 * window: `point` for an event's `clientX`/`clientY`, `rect` for `getBoundingClientRect`, `size` for
 * `innerWidth`/`innerHeight` and `listenOnScreen` for listeners on the window. Coordinates are the screen's CSS
 * pixels, unscaled however the box is zoomed.
 */
export type VariantScreen = {
  /** The screen's size in its CSS pixels; follows the window's on the gallery. Reactive. */
  size: () => { width: number; height: number };
  /** Room at the top that the page keeps for itself, such as the gallery's bar: variants open below it. */
  top: number;
  /** Where a client point (an event's `clientX`/`clientY`) lies on the screen. */
  point: (client: { clientX: number; clientY: number }) => Point;
  /** Where a point of the screen lies in client pixels, for `document.elementFromPoint`. */
  client: (point: Point) => Point;
  /** An element's `getBoundingClientRect` in the screen's pixels. */
  rect: (element: Element) => DOMRect;
  /**
   * Whether an event on the window is the screen's: on a shared page, keys only reach the screen last pressed, and
   * pointer events only the screen they happen on or whose press they continue.
   */
  owns: (event: Event) => boolean;
};

/** The variant's screen; the window's unless a page provides one. */
export function useScreen() {
  return useContext(ScreenContext);
}

/**
 * Listens on the window for the events that are the variant's screen's (see `VariantScreen.owns`), as
 * `createEventListener(window, …)` would. Must run within the variant's owner, like `useScreen`.
 */
export function listenOnScreen<K extends keyof WindowEventMap>(
  type: K,
  handler: (event: WindowEventMap[K]) => void,
  options?: AddEventListenerOptions
) {
  const screen = useScreen();
  createEventListener(
    window,
    type,
    (event) => {
      if (screen.owns(event)) {
        handler(event as WindowEventMap[K]);
      }
    },
    options
  );
}

/**
 * The screen an element is on: that of the nearest box marked by `markScreen`, or the window's. For code that holds an
 * element but runs outside the variant's owner, such as press handlers.
 */
export function screenOf(element: Element) {
  const box = element.closest(`[${screenAttribute}]`);
  return (box && screens.get(box)) || windowScreen;
}

/** Marks `box` as the element of `screen`, for `screenOf`; returns the cleanup. */
export function markScreen(box: Element, screen: VariantScreen) {
  screens.set(box, screen);
  box.setAttribute(screenAttribute, '');
  return () => {
    screens.delete(box);
    box.removeAttribute(screenAttribute);
  };
}

const screenAttribute = 'data-variant-screen';
const screens = new WeakMap<Element, VariantScreen>();

const [windowSize, setWindowSize] = createSignal({ width: innerWidth, height: innerHeight });
addEventListener('resize', () => setWindowSize({ width: innerWidth, height: innerHeight }));

/** The whole window, as the gallery page shows a variant. */
export const windowScreen: VariantScreen = {
  size: windowSize,
  top: 52,
  point: (client) => ({ x: client.clientX, y: client.clientY }),
  client: (point) => point,
  rect: (element) => element.getBoundingClientRect(),
  owns: () => true
};

/** Provides a variant's screen to it and everything it renders. */
export const ScreenContext = createContext<VariantScreen>(windowScreen);
