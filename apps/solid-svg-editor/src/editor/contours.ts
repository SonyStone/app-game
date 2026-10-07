import { parsePathData, pathSegmentOutlines } from '../path-data';
import { getAttribute, parseLength, type SvgElementNode } from '../svg-model';
import { formatMatrixTransform, identityMatrix, multiplyMatrices, parseTransformList, type Matrix2D, type Point } from './geometry';

/** GodSVG's interaction states, which pick the contour and handle colors. */
export type InteractionState = 'normal' | 'hovered' | 'selected' | 'hovered-selected';

/** What the pointer is over: an element, or one command of a path (or one point of a polygon/polyline). */
export type HoverTarget = { readonly nodeId: string; readonly commandIndex?: number };

/** One outline drawn over the document: a shape or path segment, or a helper line (tangent, radius). */
export type Contour = {
  readonly key: string;
  readonly nodeId: string;
  readonly state: InteractionState;
  /** Accumulated transform of the element and its ancestors, as an SVG `matrix(...)`. */
  readonly transform: string;
} & (
  | { readonly kind: 'shape'; readonly name: string; readonly attrs: Readonly<Record<string, string>> }
  | { readonly kind: 'path'; readonly d: string; readonly commandIndex: number }
  | { readonly kind: 'helper'; readonly from: Point; readonly to: Point }
);

/**
 * Outlines of the selected and hovered elements and their descendants, like GodSVG's contours: shapes as outlines,
 * paths split per command so a hovered or selected command stands out, plus helper lines (curve tangents and circle
 * or ellipse radii). Elements that are neither hovered nor selected are skipped to keep large documents fast.
 */
export function collectContours(
  root: SvgElementNode,
  options: {
    readonly selectedIds: readonly string[];
    readonly hovered: HoverTarget | undefined;
    readonly selectedCommand: { readonly nodeId: string; readonly index: number } | undefined;
  }
): readonly Contour[] {
  const selected = new Set(options.selectedIds);
  const contours: Contour[] = [];

  function visit(element: SvgElementNode, parentTransform: Matrix2D, ancestorHovered: boolean, ancestorSelected: boolean): void {
    const matrix = multiplyMatrices(parentTransform, parseTransformList(getAttribute(element, 'transform', true)));
    const hovered = ancestorHovered || (options.hovered?.nodeId === element.id && options.hovered.commandIndex === undefined);
    const isSelected = ancestorSelected || selected.has(element.id);
    const commandHovered = options.hovered?.nodeId === element.id && options.hovered.commandIndex !== undefined;

    if (hovered || isSelected || commandHovered) {
      contours.push(...elementContours(element, formatMatrixTransform(matrix), stateOf(hovered, isSelected), options));
    }

    for (const child of element.children) {
      if (child.kind === 'element') {
        visit(child, matrix, hovered, isSelected);
      }
    }
  }

  for (const child of root.children) {
    if (child.kind === 'element') {
      visit(child, identityMatrix, false, false);
    }
  }

  return contours;
}

function stateOf(hovered: boolean, selected: boolean): InteractionState {
  if (hovered && selected) {
    return 'hovered-selected';
  }

  return hovered ? 'hovered' : selected ? 'selected' : 'normal';
}

function elementContours(
  element: SvgElementNode,
  transform: string,
  state: InteractionState,
  options: Parameters<typeof collectContours>[1]
): readonly Contour[] {
  const base = { nodeId: element.id, transform };
  const number = (name: string) => parseLength(getAttribute(element, name));
  const helper = (key: string, from: Point, to: Point): Contour => ({ ...base, key: `${element.id}:${key}`, kind: 'helper', state, from, to });
  const shape = (names: readonly string[]): Contour => ({
    ...base,
    key: element.id,
    kind: 'shape',
    name: element.name,
    state,
    // Unset optional attributes (a rect's "auto" rx/ry) are left out rather than written empty.
    attrs: Object.fromEntries(names.map((name) => [name, getAttribute(element, name)]).filter(([, value]) => value !== ''))
  });

  switch (element.name) {
    case 'circle': {
      const center = { x: number('cx'), y: number('cy') };
      return [shape(['cx', 'cy', 'r']), helper('radius', center, { x: center.x + Math.abs(number('r')), y: center.y })];
    }
    case 'ellipse': {
      const center = { x: number('cx'), y: number('cy') };
      return [
        shape(['cx', 'cy', 'rx', 'ry']),
        helper('rx', center, { x: center.x + Math.abs(number('rx')), y: center.y }),
        helper('ry', center, { x: center.x, y: center.y + Math.abs(number('ry')) })
      ];
    }
    case 'rect':
      return [shape(['x', 'y', 'width', 'height', 'rx', 'ry'])];
    case 'line':
      return [shape(['x1', 'y1', 'x2', 'y2'])];
    case 'polygon':
    case 'polyline':
      return [shape(['points'])];
    case 'path':
      return pathSegmentOutlines(parsePathData(getAttribute(element, 'd', true))).flatMap((segment) => {
        const commandHovered = options.hovered?.nodeId === element.id && options.hovered.commandIndex === segment.index;
        const commandSelected = options.selectedCommand?.nodeId === element.id && options.selectedCommand.index === segment.index;
        const segmentState = stateOf(state === 'hovered' || state === 'hovered-selected' || commandHovered, state === 'selected' || state === 'hovered-selected' || commandSelected);

        return [
          { ...base, key: `${element.id}:${segment.index}`, kind: 'path' as const, state: segmentState, d: segment.d, commandIndex: segment.index },
          ...segment.tangents.map(([from, to], tangent) => ({
            ...base,
            key: `${element.id}:${segment.index}:tangent-${tangent}`,
            kind: 'helper' as const,
            state: segmentState,
            from,
            to
          }))
        ];
      });
    default:
      return [];
  }
}
