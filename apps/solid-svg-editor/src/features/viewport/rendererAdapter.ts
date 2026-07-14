import { rectFromPoints, unionRects, type Point, type Rect } from '../../editor/geometry';
import type {
  RendererContribution,
  SelectionBoxMeasureRequest,
  SvgNodeRendererAdapter,
  ViewportRendererAdapter
} from '../../editor/kernel';
import { nodeIdsFromSelectionTargets, nodeSelectionTarget } from '../../editor/selection-targets';
import type { SelectionTarget } from '../../editor/selection-targets';
import type { DragSelectionMode } from '../../editor/types';

export type {
  SelectionBoxMeasureRequest,
  SvgNodeRendererAdapter,
  SvgNodeRenderProps,
  ViewportRendererAdapter
} from '../../editor/kernel';

const renderedNodeSelector = '[data-node-id]';
const marqueeSelectableTags = new Set(['path', 'circle', 'ellipse', 'rect', 'line', 'polygon', 'polyline', 'text', 'image', 'use']);

export interface RendererAdapter extends SvgNodeRendererAdapter, ViewportRendererAdapter {}

type DomAdapterTarget<T> = T | (() => T | undefined);

export interface DomRendererAdapterOptions {
  readonly queryRoot?: DomAdapterTarget<ParentNode>;
  readonly viewportElement?: DomAdapterTarget<Element>;
}

export function createViewportRendererFromContributions(
  renderers: readonly RendererContribution[],
  base: ViewportRendererAdapter
): ViewportRendererAdapter {
  return renderers.reduce((current, renderer) => renderer.createViewportRenderer?.(current) ?? current, base);
}

export function createDomRendererAdapter(options: DomRendererAdapterOptions = {}): ViewportRendererAdapter {
  function queryRoot(): ParentNode {
    return resolveDomTarget(options.queryRoot) ?? document;
  }

  function viewportElement(): Element | undefined {
    return resolveDomTarget(options.viewportElement);
  }

  function measureSelectionBox(request: SelectionBoxMeasureRequest): Rect | undefined {
    const targetIds = nodeIdsFromSelectionTargets(request.selectedTargets ?? []);
    const selectedIds = targetIds.length > 0 ? targetIds : request.selectedIds;
    const selected = new Set(selectedIds.filter((id) => id !== request.rootId));

    if (selected.size === 0 || request.useRasterPreview) {
      return undefined;
    }

    const rects: Rect[] = [];

    for (const element of queryRoot().querySelectorAll<SVGGraphicsElement>(renderedNodeSelector)) {
      const id = element.getAttribute('data-node-id');

      if (!id || !selected.has(id)) {
        continue;
      }

      const clientRect = element.getBoundingClientRect();

      if (clientRect.width <= 0 || clientRect.height <= 0) {
        continue;
      }

      const worldRect = clientRectToWorldRect(clientRect, request.clientToSvgPoint);

      if (worldRect) {
        rects.push(worldRect);
      }
    }

    return unionRects(rects);
  }

  function hitTestRenderedNodeIds(rect: Rect, mode: DragSelectionMode): readonly string[] {
    const ids: string[] = [];

    for (const element of queryRoot().querySelectorAll<SVGGraphicsElement>(renderedNodeSelector)) {
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

  function hitTestMarqueeTargets(rect: Rect, mode: DragSelectionMode): readonly SelectionTarget[] {
    return hitTestRenderedNodeIds(rect, mode).map(nodeSelectionTarget);
  }

  function renderedNodeIdFromEventTarget(target: EventTarget | null): string | undefined {
    if (!(target instanceof Element)) {
      return undefined;
    }

    return target.closest(renderedNodeSelector)?.getAttribute('data-node-id') ?? undefined;
  }

  function selectionTargetFromEventTarget(target: EventTarget | null): SelectionTarget | undefined {
    const nodeId = renderedNodeIdFromEventTarget(target);
    return nodeId ? nodeSelectionTarget(nodeId) : undefined;
  }

  function clientRectToViewportOverlay(rect: Rect): Rect {
    const viewport = viewportClientRect();

    if (!viewport) {
      return rect;
    }

    return {
      x: rect.x - viewport.left,
      y: rect.y - viewport.top,
      width: rect.width,
      height: rect.height
    };
  }

  function viewportClientRect(): DOMRectReadOnly | undefined {
    return viewportElement()?.getBoundingClientRect();
  }

  return {
    measureSelectionBox,
    hitTestMarqueeTargets,
    selectionTargetFromEventTarget,
    clientRectToViewportOverlay,
    viewportClientRect
  } satisfies ViewportRendererAdapter;
}

function resolveDomTarget<T>(target: DomAdapterTarget<T> | undefined): T | undefined {
  if (!target) {
    return undefined;
  }

  return isDomTargetFactory(target) ? target() : target;
}

function isDomTargetFactory<T>(target: DomAdapterTarget<T>): target is () => T | undefined {
  return typeof target === 'function';
}

function clientRectToWorldRect(
  clientRect: DOMRectReadOnly,
  clientToSvgPoint: (clientX: number, clientY: number, snapToGrid?: boolean) => Point
): Rect | undefined {
  return rectFromPoints([
    clientToSvgPoint(clientRect.left, clientRect.top, false),
    clientToSvgPoint(clientRect.right, clientRect.top, false),
    clientToSvgPoint(clientRect.right, clientRect.bottom, false),
    clientToSvgPoint(clientRect.left, clientRect.bottom, false)
  ]);
}

function isMarqueeSelectableElement(element: Element): boolean {
  return marqueeSelectableTags.has(element.tagName.toLowerCase());
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
