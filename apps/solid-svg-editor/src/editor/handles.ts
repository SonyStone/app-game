import type { SvgElementNode } from "../svg-model";

import { identityMatrix, invertMatrix, multiplyMatrices, parseTransformList, transformPoint, type Matrix2D } from "./geometry";
import type { SvgHandleContext } from "./kernel";
import { getSvgAttribute } from "./svg-attributes";
import type { HandleDescriptor, ViewRect } from "./types";

export type ElementHandleProvider = (context: SvgHandleContext) => readonly HandleDescriptor[];

export function createGridLines(viewRect: ViewRect, zoom: number, targetSpacing = 64) {
  const step = Math.max(1, 2 ** Math.ceil(Math.log2(targetSpacing / Math.max(zoom, 0.001))));
  const majorStep = step * 4;
  const minorVertical: number[] = [];
  const minorHorizontal: number[] = [];
  const majorVertical: number[] = [];
  const majorHorizontal: number[] = [];

  for (let x = Math.floor(viewRect.x / step) * step; x <= viewRect.x + viewRect.width; x += step) {
    (x % majorStep === 0 ? majorVertical : minorVertical).push(roundGridValue(x));
  }

  for (let y = Math.floor(viewRect.y / step) * step; y <= viewRect.y + viewRect.height; y += step) {
    (y % majorStep === 0 ? majorHorizontal : minorHorizontal).push(roundGridValue(y));
  }

  return { minorVertical, minorHorizontal, majorVertical, majorHorizontal };
}

function roundGridValue(value: number): number {
  return Math.abs(value) < 0.0001 ? 0 : Math.round(value * 1000) / 1000;
}

export function getHandlesFromProviders(
  root: SvgElementNode,
  selectedIds: readonly string[],
  createHandles: ElementHandleProvider
): readonly HandleDescriptor[] {
  const descriptors: HandleDescriptor[] = [];
  const selected = new Set(selectedIds);

  collectHandles(root, root, identityMatrix, selected, descriptors, createHandles);

  return descriptors;
}

function collectHandles(
  root: SvgElementNode,
  node: SvgElementNode,
  inheritedTransform: Matrix2D,
  selectedIds: ReadonlySet<string>,
  descriptors: HandleDescriptor[],
  createHandles: ElementHandleProvider
): void {
  const transform = multiplyMatrices(inheritedTransform, parseTransformList(getSvgAttribute(node, "transform")));

  if (selectedIds.has(node.id)) {
    descriptors.push(...createHandles({ root, node }).map((handle) => transformHandle(handle, transform)));
  }

  for (const child of node.children) {
    if (child.kind === "element") {
      collectHandles(root, child, transform, selectedIds, descriptors, createHandles);
    }
  }
}

function transformHandle(handle: HandleDescriptor, matrix: Matrix2D): HandleDescriptor {
  const transformed = transformPoint(matrix, handle);
  const inverse = invertMatrix(matrix);

  if (handle.commandMode === "command") {
    const { createCommand, ...descriptor } = handle;

    if (!inverse) {
      return {
        ...descriptor,
        commandMode: "legacy",
        x: transformed.x,
        y: transformed.y,
        update: (root) => root
      } satisfies HandleDescriptor;
    }

    return {
      ...descriptor,
      x: transformed.x,
      y: transformed.y,
      createCommand: (x: number, y: number) => {
        const local = transformPoint(inverse, { x, y });
        return createCommand(local.x, local.y);
      }
    } satisfies HandleDescriptor;
  }

  return {
    ...handle,
    x: transformed.x,
    y: transformed.y,
    update: (root: SvgElementNode, x: number, y: number) => {
      if (!inverse) {
        return root;
      }

      const local = transformPoint(inverse, { x, y });
      return handle.update(root, local.x, local.y);
    }
  } satisfies HandleDescriptor;
}
