import type { Rect } from '../../editor/geometry';
import type { DragSelectionMode } from '../../editor/types';

export function normalizeClientRect(startX: number, startY: number, endX: number, endY: number): Rect {
  const x = Math.min(startX, endX);
  const y = Math.min(startY, endY);
  return {
    x,
    y,
    width: Math.abs(endX - startX),
    height: Math.abs(endY - startY)
  };
}

export function idsInMarquee(rect: Rect, mode: DragSelectionMode): readonly string[] {
  const ids: string[] = [];

  for (const element of document.querySelectorAll<SVGGraphicsElement>('[data-node-id]')) {
    if (!isMarqueeSelectableElement(element)) {
      continue;
    }

    const id = element.getAttribute('data-node-id');

    if (!id) {
      continue;
    }

    const elementRect = element.getBoundingClientRect();

    if (elementRect.width <= 0 || elementRect.height <= 0) {
      continue;
    }

    const selected =
      mode === 'contain' ? clientRectContains(rect, elementRect) : clientRectsIntersect(rect, elementRect);

    if (selected) {
      ids.push(id);
    }
  }

  return ids;
}

export function mergeSelection(initial: readonly string[], added: readonly string[]): readonly string[] {
  const ids = new Set(initial);

  for (const id of added) {
    ids.add(id);
  }

  return [...ids];
}

function isMarqueeSelectableElement(element: Element): boolean {
  return ['path', 'circle', 'ellipse', 'rect', 'line', 'polygon', 'polyline', 'text', 'image', 'use'].includes(
    element.tagName.toLowerCase()
  );
}

function clientRectContains(selection: Rect, element: DOMRectReadOnly): boolean {
  return (
    element.left >= selection.x &&
    element.right <= selection.x + selection.width &&
    element.top >= selection.y &&
    element.bottom <= selection.y + selection.height
  );
}

function clientRectsIntersect(selection: Rect, element: DOMRectReadOnly): boolean {
  return (
    element.right >= selection.x &&
    element.left <= selection.x + selection.width &&
    element.bottom >= selection.y &&
    element.top <= selection.y + selection.height
  );
}
