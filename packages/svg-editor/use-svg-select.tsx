import { createEventListenerMap } from '@solid-primitives/event-listener';
import { createMutationObserver } from '@solid-primitives/mutation-observer';
import { ReactiveSet } from '@solid-primitives/set';
import { batch, createEffect, createMemo, createSignal, For, Match, Show, Switch } from 'solid-js';
import { SVGNode } from './svg-node';

export const SVG_GRAPHICS_ELEMENTS = ['rect', 'circle', 'ellipse', 'line', 'polyline', 'polygon', 'path'] as const;

export type DataWrapper<T, N> = T & {
  _inner_id: N;
};

export function useSvgSelect<T>() {
  const selectedElementsIdsMap = new ReactiveSet<T>();
  const [svgRef, setSvgRef] = createSignal<SVGSVGElement | null>(null);
  const spatialIndex = useSpatialIndex();

  const [rectSelection, setRectSelection] = createSignal<{
    startX: number;
    startY: number;
    currentX: number;
    currentY: number;
    active: boolean;
  } | null>(null);

  const [lassoSelection, setLassoSelection] = createSignal<{
    points: Array<{ x: number; y: number }>;
    active: boolean;
  } | null>(null);

  const pointInPolygon = (point: { x: number; y: number }, polygon: Array<{ x: number; y: number }>) => {
    let inside = false;
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
      if (
        polygon[i].y > point.y !== polygon[j].y > point.y &&
        point.x <
          ((polygon[j].x - polygon[i].x) * (point.y - polygon[i].y)) / (polygon[j].y - polygon[i].y) + polygon[i].x
      ) {
        inside = !inside;
      }
    }
    return inside;
  };

  // Check if element is inside lasso polygon
  const isElementInLasso = (element: SVGGraphicsElement, polygon: Array<{ x: number; y: number }>) => {
    const bbox = element.getBBox();
    const corners = [
      { x: bbox.x, y: bbox.y },
      { x: bbox.x + bbox.width, y: bbox.y },
      { x: bbox.x + bbox.width, y: bbox.y + bbox.height },
      { x: bbox.x, y: bbox.y + bbox.height }
    ];

    // Element is selected if any corner is inside the lasso
    return corners.some((corner) => pointInPolygon(corner, polygon));
  };

  const eventListenerMap = {
    pointerdown: (e: PointerEvent) => {
      const target = e.target as DataWrapper<SVGGraphicsElement, SVGNode>;

      {
        // If clicking on empty space with Shift key, start lasso selection
        if (target.tagName === 'svg' && e.shiftKey) {
          const rect = target.getBoundingClientRect();
          const x = e.clientX - rect.left;
          const y = e.clientY - rect.top;

          setLassoSelection({
            points: [{ x, y }],
            active: true
          });

          target.setPointerCapture(e.pointerId);
          return;
        }
      }

      {
        // If clicking on empty space, start rectangle selection
        if (target.tagName === 'svg') {
          const rect = target.getBoundingClientRect();
          const x = e.clientX - rect.left;
          const y = e.clientY - rect.top;

          setRectSelection({
            startX: x,
            startY: y,
            currentX: x,
            currentY: y,
            active: true
          });

          target.setPointerCapture(e.pointerId);
          return;
        }
      }

      {
        // Existing single element selection logic
        if (SVG_GRAPHICS_ELEMENTS.includes(target.tagName as (typeof SVG_GRAPHICS_ELEMENTS)[number])) {
          if (e.ctrlKey || e.metaKey) {
            selectedElementsIdsMap.add(target._inner_id);
          } else {
            batch(() => {
              selectedElementsIdsMap.clear();
              selectedElementsIdsMap.add(target._inner_id);
            });
          }
        }
      }
    },
    pointermove: (e: PointerEvent) => {
      {
        const lasso = lassoSelection();
        if (lasso?.active) {
          const target = e.target as DataWrapper<SVGGraphicsElement, SVGNode>;
          const rect = target.getBoundingClientRect();
          const x = e.clientX - rect.left;
          const y = e.clientY - rect.top;

          setLassoSelection({
            ...lasso,
            points: [...lasso.points, { x, y }]
          });
          return;
        }
      }

      {
        const selection = rectSelection();
        if (!selection?.active) return;

        const target = e.target as DataWrapper<SVGGraphicsElement, SVGNode>;
        const rect = target.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;

        setRectSelection({
          ...selection,
          currentX: x,
          currentY: y
        });
        return;
      }
    },
    pointerup: (e: PointerEvent) => {
      {
        const lasso = lassoSelection();
        if (lasso?.active) {
          if (lasso.points.length > 2) {
            const elementsInLasso = [...spatialIndex.spatialIndex.keys()].filter((element) =>
              isElementInLasso(element, lasso.points)
            );

            if (e.ctrlKey || e.metaKey) {
              batch(() => {
                for (const element of elementsInLasso as DataWrapper<SVGGraphicsElement, SVGNode>[]) {
                  selectedElementsIdsMap.add(element._inner_id);
                }
              });
            } else {
              batch(() => {
                selectedElementsIdsMap.clear();
                for (const element of elementsInLasso as DataWrapper<SVGGraphicsElement, SVGNode>[]) {
                  selectedElementsIdsMap.add(element._inner_id);
                }
              });
            }
          }

          setLassoSelection(null);
          (e.target as DataWrapper<SVGGraphicsElement, SVGNode>).releasePointerCapture(e.pointerId);
          return;
        }
      }

      {
        const selection = rectSelection();
        if (!selection?.active) return;

        // Find elements within selection rectangle
        const minX = Math.min(selection.startX, selection.currentX);
        const maxX = Math.max(selection.startX, selection.currentX);
        const minY = Math.min(selection.startY, selection.currentY);
        const maxY = Math.max(selection.startY, selection.currentY);

        const elementsInSelection = spatialIndex.getElementsInRect(minX, minY, maxX, maxY);

        if (e.ctrlKey || e.metaKey) {
          batch(() => {
            for (const element of elementsInSelection as DataWrapper<SVGGraphicsElement, SVGNode>[]) {
              selectedElementsIdsMap.add(element._inner_id);
            }
          });
        } else {
          batch(() => {
            selectedElementsIdsMap.clear();
            for (const element of elementsInSelection as DataWrapper<SVGGraphicsElement, SVGNode>[]) {
              selectedElementsIdsMap.add(element._inner_id);
            }
          });
        }

        setRectSelection(null);
        (e.target as DataWrapper<SVGGraphicsElement, SVGNode>).releasePointerCapture(e.pointerId);
      }
    }
  };

  createEffect(() => {
    const svg = svgRef();
    if (!svg) return;

    spatialIndex.initializeSpatialIndex(svg);
    createMutationObserver(svg, { childList: true }, () => {
      spatialIndex.initializeSpatialIndex(svg);
    });

    createEventListenerMap(svg, eventListenerMap, { passive: true, capture: true, once: false });
  });

  return {
    selectedElementsIdsMap,
    setSvgRef,
    LassoSelectionPreview: () => <LassoSelectionPreview lassoSelection={lassoSelection()} />,
    RectangleSelectionPreview: () => <RectangleSelectionPreview rectSelection={rectSelection()} />
  };
}

function useSpatialIndex() {
  const spatialIndex = new Map<SVGGraphicsElement, { x: number; y: number; width: number; height: number }>();

  const registerElement = (element: SVGGraphicsElement) => {
    if (!element) return;
    const bbox = element.getBBox();
    spatialIndex.set(element, {
      x: bbox.x,
      y: bbox.y,
      width: bbox.width,
      height: bbox.height
    });
  };

  const updateSpatialIndex = (element: SVGGraphicsElement) => {
    const bbox = element.getBBox();
    spatialIndex.set(element, {
      x: bbox.x,
      y: bbox.y,
      width: bbox.width,
      height: bbox.height
    });
  };

  // Fast rectangle selection
  const getElementsInRect = (minX: number, minY: number, maxX: number, maxY: number) => {
    const result: SVGGraphicsElement[] = [];
    for (const [element, bounds] of spatialIndex) {
      if (bounds.x < maxX && bounds.x + bounds.width > minX && bounds.y < maxY && bounds.y + bounds.height > minY) {
        result.push(element);
      }
    }
    return result;
  };

  const selector = SVG_GRAPHICS_ELEMENTS.join(', ');

  const initializeSpatialIndex = (svg: SVGSVGElement) => {
    spatialIndex.clear();
    svg.querySelectorAll(selector).forEach((element) => {
      registerElement(element as SVGSVGElement);
    });
  };

  return {
    spatialIndex,
    updateSpatialIndex,
    getElementsInRect,
    initializeSpatialIndex
  };
}

export const OutlinePreview = (props: { selectedElements: SVGNode[] }) => (
  <For each={props.selectedElements}>
    {(selected) => (
      <Switch>
        <Match when={selected.component === SVG_GRAPHICS_ELEMENTS[6]}>
          <path
            d={selected.d ?? ''}
            class="contain-layout contain-style contain-paint pointer-events-none fill-none stroke-[rgb(245,92,54)] stroke-2 [vector-effect:non-scaling-stroke]"
            transform="matrix(1, 0, 0, 1, 0, 0)"
            data-ignore-selection={true}
          />
        </Match>
        <Match when={selected.component === SVG_GRAPHICS_ELEMENTS[1]}>
          <circle
            cx={selected.cx}
            cy={selected.cy}
            r={selected.r}
            class="contain-layout contain-style contain-paint pointer-events-none fill-none stroke-[rgb(245,92,54)] stroke-2 [vector-effect:non-scaling-stroke]"
            transform="matrix(1, 0, 0, 1, 0, 0)"
            data-ignore-selection={true}
          />
        </Match>
        <Match when={selected.component === SVG_GRAPHICS_ELEMENTS[3]}>
          <line
            x1={selected.x1}
            y1={selected.y1}
            x2={selected.x2}
            y2={selected.y2}
            class="contain-layout contain-style contain-paint pointer-events-none fill-none stroke-[rgb(245,92,54)] stroke-2 [vector-effect:non-scaling-stroke]"
            data-ignore-selection={true}
          />
        </Match>
      </Switch>
    )}
  </For>
);

export const BoxesPreview = (props: { selectedElements: SVGNode[] }) => (
  <For each={props.selectedElements}>
    {(selected) => {
      const { x, y, width, height } = selected.getBBox();
      return (
        <rect
          x={x}
          y={y}
          width={width}
          height={height}
          class="stroke-dashed pointer-events-none fill-none stroke-blue-500 stroke-1 [vector-effect:non-scaling-stroke] [stroke-dasharray:4,2]"
          data-ignore-selection={true}
        />
      );
    }}
  </For>
);

export const RectangleSelectionPreview = (props: {
  rectSelection: {
    startX: number;
    startY: number;
    currentX: number;
    currentY: number;
    active: boolean;
  } | null;
}) => (
  <Show when={props.rectSelection?.active}>
    {(() => {
      const rect = createMemo(() => {
        const selection = props.rectSelection!;
        const x = Math.min(selection.startX, selection.currentX);
        const y = Math.min(selection.startY, selection.currentY);
        const width = Math.abs(selection.currentX - selection.startX);
        const height = Math.abs(selection.currentY - selection.startY);
        return { x, y, width, height };
      });

      return (
        <rect
          {...rect()}
          class="stroke-dashed pointer-events-none fill-blue-200/30 stroke-blue-500 stroke-1 [vector-effect:non-scaling-stroke] [stroke-dasharray:4,2]"
          data-ignore-selection={true}
        />
      );
    })()}
  </Show>
);

export const LassoSelectionPreview = (props: {
  lassoSelection: {
    points: Array<{ x: number; y: number }>;
    active: boolean;
  } | null;
}) => (
  <Show when={props.lassoSelection?.active}>
    {(() => {
      const pointsData = createMemo(() => {
        const lasso = props.lassoSelection!;
        return lasso.points.map((point) => `${point.x},${point.y}`).join(' ');
      });

      return (
        <polygon
          points={pointsData()}
          class="stroke-dashed pointer-events-none fill-green-200/30 stroke-green-500 stroke-1 [vector-effect:non-scaling-stroke] [stroke-dasharray:4,2]"
          data-ignore-selection={true}
        />
      );
    })()}
  </Show>
);
