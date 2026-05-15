import { createSignal, onCleanup } from 'solid-js';

export type GapStateOptions = Parameters<typeof createGapState>[0];
export type GapState = ReturnType<typeof createGapState>;

/** Sentinel key used for the live gap placeholder. */
export const GAP_KEY = Symbol('dnd_gap');
export type GapKey = typeof GAP_KEY;

export function isGapKey(key: unknown): key is GapKey {
  return key === GAP_KEY;
}

export function findGapElement<K>(getElement: (key: K | GapKey) => HTMLElement | undefined): HTMLElement | null {
  const gap = getElement(GAP_KEY);
  return gap?.isConnected ? gap : null;
}

/**
 * Tracks the live gap element and its rendered size.
 *
 * This stays intentionally small: it owns only gap DOM state, while higher-level
 * composites decide when the gap should exist and how it participates in display
 * lists, FLIP keys, and insertion logic.
 */
export function createGapState(_options?: {}) {
  const [element, setElement] = createSignal<HTMLElement | undefined>(undefined);
  const [height, setHeight] = createSignal(0);
  const [width, setWidth] = createSignal(0);

  function setRef(nextElement: HTMLElement): void {
    setElement(nextElement);
    onCleanup(() => {
      setElement((current) => (current === nextElement ? undefined : current));
    });
  }

  function setSizeFromElement(source: Pick<HTMLElement, 'getBoundingClientRect'>): void {
    const rect = source.getBoundingClientRect();
    setHeight(rect.height);
    setWidth(rect.width);
  }

  function resetSize(): void {
    setHeight(0);
    setWidth(0);
  }

  return {
    element,
    height,
    width,
    setRef,
    setSizeFromElement,
    resetSize
  };
}
