/** Rect — Axis-aligned bounding rectangle */
export type Rect = Readonly<{ x: number; y: number; width: number; height: number }>;

export const Zero: Rect = { x: 0, y: 0, width: 0, height: 0 };

export function of(x: number, y: number, width: number, height: number): Rect {
  return { x, y, width, height };
}

/**
 * Create a Rect from an element's bounding client rect.
 * Returns `undefined` when no element is provided.
 */
export function fromElement(el: Pick<Element, 'getBoundingClientRect'>): Rect;
export function fromElement(el: Pick<Element, 'getBoundingClientRect'> | undefined): Rect | undefined;
export function fromElement(el?: Pick<Element, 'getBoundingClientRect'>): Rect | undefined {
  if (!el) {
    return undefined;
  }
  const r = el.getBoundingClientRect();
  return { x: r.x, y: r.y, width: r.width, height: r.height };
}

export function equals(a: Rect | undefined, b: Rect | undefined): boolean {
  if (a === b) {
    return true;
  }
  if (!a || !b) {
    return false;
  }
  return a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height;
}
