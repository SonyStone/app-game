import {
  matrixAround,
  rectCenter,
  rotateMatrix,
  scaleMatrix,
  type Matrix2D,
  type Point,
  type Rect
} from '../../editor/geometry';
import { createTransformSelectedCommand } from '../../editor/commands/transformCommands';
import { clamp } from '../../editor/tree-utils';
import type { TransformBoxHandleKind } from '../../editor/types';
import type { SvgElementNode, SvgNode } from '../../svg-model';

export function transformMatrixForBoxHandle(
  box: Rect,
  kind: TransformBoxHandleKind,
  point: Point,
  startAngle: number
): Matrix2D {
  const center = rectCenter(box);

  if (kind === 'rotate') {
    const angle = Math.atan2(point.y - center.y, point.x - center.x);
    return matrixAround(center, rotateMatrix(angle - startAngle));
  }

  const anchor = anchorForTransformHandle(box, kind);
  const startPoint = pointForTransformHandle(box, kind);
  const scaleX = transformHandleChangesX(kind) ? clampedScaleRatio(point.x, startPoint.x, anchor.x) : 1;
  const scaleY = transformHandleChangesY(kind) ? clampedScaleRatio(point.y, startPoint.y, anchor.y) : 1;

  return matrixAround(anchor, scaleMatrix(scaleX, scaleY));
}

export function applyGlobalTransformToSelected(
  root: SvgElementNode,
  ids: readonly string[],
  transform: Matrix2D
): SvgElementNode {
  return createTransformSelectedCommand({ ids, transform }).apply(root);
}

export function topLevelSelectedElementIds(root: SvgElementNode, ids: readonly string[]): readonly string[] {
  const selected = new Set(ids);
  const result: string[] = [];

  function visit(node: SvgNode, hasSelectedAncestor: boolean): void {
    const isSelected = selected.has(node.id);

    if (node.kind === 'element' && node.id !== root.id && isSelected && !hasSelectedAncestor) {
      result.push(node.id);
    }

    if (node.kind !== 'element') {
      return;
    }

    for (const child of node.children) {
      visit(child, hasSelectedAncestor || isSelected);
    }
  }

  visit(root, false);
  return result;
}

function pointForTransformHandle(box: Rect, kind: TransformBoxHandleKind): Point {
  const center = rectCenter(box);
  const left = box.x;
  const right = box.x + box.width;
  const top = box.y;
  const bottom = box.y + box.height;

  switch (kind) {
    case 'nw':
      return { x: left, y: top };
    case 'n':
      return { x: center.x, y: top };
    case 'ne':
      return { x: right, y: top };
    case 'e':
      return { x: right, y: center.y };
    case 'se':
      return { x: right, y: bottom };
    case 's':
      return { x: center.x, y: bottom };
    case 'sw':
      return { x: left, y: bottom };
    case 'w':
      return { x: left, y: center.y };
    case 'rotate':
      return { x: center.x, y: top };
  }
}

function anchorForTransformHandle(box: Rect, kind: TransformBoxHandleKind): Point {
  const center = rectCenter(box);
  const left = box.x;
  const right = box.x + box.width;
  const top = box.y;
  const bottom = box.y + box.height;

  switch (kind) {
    case 'nw':
      return { x: right, y: bottom };
    case 'n':
      return { x: center.x, y: bottom };
    case 'ne':
      return { x: left, y: bottom };
    case 'e':
      return { x: left, y: center.y };
    case 'se':
      return { x: left, y: top };
    case 's':
      return { x: center.x, y: top };
    case 'sw':
      return { x: right, y: top };
    case 'w':
      return { x: right, y: center.y };
    case 'rotate':
      return center;
  }
}

function transformHandleChangesX(kind: TransformBoxHandleKind): boolean {
  return kind === 'nw' || kind === 'ne' || kind === 'e' || kind === 'se' || kind === 'sw' || kind === 'w';
}

function transformHandleChangesY(kind: TransformBoxHandleKind): boolean {
  return kind === 'nw' || kind === 'n' || kind === 'ne' || kind === 'se' || kind === 's' || kind === 'sw';
}

function clampedScaleRatio(current: number, start: number, anchor: number): number {
  const denominator = start - anchor;

  if (Math.abs(denominator) < 0.0001) {
    return 1;
  }

  return clamp((current - anchor) / denominator, 0.02, 50);
}
