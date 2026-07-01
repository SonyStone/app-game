import { commandParameters, formatPathData, formatPoints, parsePathData, parsePoints, updateCommandValue, updatePoint, type PathCommand } from "../path-data";
import { findNode, getAttribute, parseLength, setAttribute, updateNode, type SvgElementNode } from "../svg-model";

import { identityMatrix, invertMatrix, multiplyMatrices, parseTransformList, transformPoint, type Matrix2D } from "./geometry";
import type { HandleDescriptor, ViewRect } from "./types";

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

export function getHandles(root: SvgElementNode, selectedIds: readonly string[]): readonly HandleDescriptor[] {
  const descriptors: HandleDescriptor[] = [];
  const selected = new Set(selectedIds);

  collectHandles(root, identityMatrix, selected, descriptors);

  return descriptors;
}

function collectHandles(node: SvgElementNode, inheritedTransform: Matrix2D, selectedIds: ReadonlySet<string>, descriptors: HandleDescriptor[]): void {
  const transform = multiplyMatrices(inheritedTransform, parseTransformList(getAttribute(node, "transform", true)));

  if (selectedIds.has(node.id)) {
    descriptors.push(...handlesForElement(node).map((handle) => transformHandle(handle, transform)));
  }

  for (const child of node.children) {
    if (child.kind === "element") {
      collectHandles(child, transform, selectedIds, descriptors);
    }
  }
}

function handlesForElement(node: SvgElementNode): readonly HandleDescriptor[] {
  switch (node.name) {
    case "circle": {
      const cx = parseLength(getAttribute(node, "cx"));
      const cy = parseLength(getAttribute(node, "cy"));
      const r = parseLength(getAttribute(node, "r"));
      return [
        numericHandle(node.id, "center", cx, cy, "center", (root, x, y) => updateNumericAttrs(root, node.id, { cx: x, cy: y })),
        numericHandle(node.id, "radius", cx + r, cy, "r", (root, x) => updateNumericAttrs(root, node.id, { r: Math.max(0, x - cx) }))
      ];
    }
    case "ellipse": {
      const cx = parseLength(getAttribute(node, "cx"));
      const cy = parseLength(getAttribute(node, "cy"));
      const rx = parseLength(getAttribute(node, "rx"));
      const ry = parseLength(getAttribute(node, "ry"));
      return [
        numericHandle(node.id, "center", cx, cy, "center", (root, x, y) => updateNumericAttrs(root, node.id, { cx: x, cy: y })),
        numericHandle(node.id, "rx", cx + rx, cy, "rx", (root, x) => updateNumericAttrs(root, node.id, { rx: Math.max(0, x - cx) })),
        numericHandle(node.id, "ry", cx, cy + ry, "ry", (root, _x, y) => updateNumericAttrs(root, node.id, { ry: Math.max(0, y - cy) }))
      ];
    }
    case "rect": {
      const x = parseLength(getAttribute(node, "x"));
      const y = parseLength(getAttribute(node, "y"));
      const width = parseLength(getAttribute(node, "width"));
      const height = parseLength(getAttribute(node, "height"));
      return [
        numericHandle(node.id, "origin", x, y, "origin", (root, nextX, nextY) => updateNumericAttrs(root, node.id, { x: nextX, y: nextY })),
        numericHandle(node.id, "size", x + width, y + height, "size", (root, nextX, nextY) => updateNumericAttrs(root, node.id, { width: Math.max(0, nextX - x), height: Math.max(0, nextY - y) }))
      ];
    }
    case "line": {
      const x1 = parseLength(getAttribute(node, "x1"));
      const y1 = parseLength(getAttribute(node, "y1"));
      const x2 = parseLength(getAttribute(node, "x2"));
      const y2 = parseLength(getAttribute(node, "y2"));
      return [
        numericHandle(node.id, "p1", x1, y1, "x1 y1", (root, x, y) => updateNumericAttrs(root, node.id, { x1: x, y1: y })),
        numericHandle(node.id, "p2", x2, y2, "x2 y2", (root, x, y) => updateNumericAttrs(root, node.id, { x2: x, y2: y }))
      ];
    }
    case "polygon":
    case "polyline":
      return parsePoints(getAttribute(node, "points", true)).map(([x, y], index) =>
        numericHandle(node.id, `point-${index}`, x, y, `point ${index + 1}`, (root, nextX, nextY) => {
          const current = findNode(root, node.id);

          if (!current || current.kind !== "element") {
            return root;
          }

          const points = parsePoints(getAttribute(current, "points", true));
          const updated = formatPoints(updatePoint(updatePoint(points, index, 0, nextX), index, 1, nextY));
          return updateNumericAttrAsText(root, node.id, "points", updated);
        })
      );
    case "path":
      return pathHandles(node);
    default:
      return [];
  }
}

function pathHandles(node: SvgElementNode): readonly HandleDescriptor[] {
  const commands = parsePathData(getAttribute(node, "d", true));
  const handles: HandleDescriptor[] = [];
  let currentX = 0;
  let currentY = 0;
  let subpathX = 0;
  let subpathY = 0;

  commands.forEach((command, commandIndex) => {
    const startX = currentX;
    const startY = currentY;
    const upper = command.command.toUpperCase();
    const relative = command.command === command.command.toLowerCase();
    const paramList = commandParameters(command.command);

    for (const pair of [
      ["x1", "y1", true],
      ["x2", "y2", true],
      ["x", "y", false]
    ] as const) {
      const xParam = paramList.find((param) => param.name === pair[0]);
      const yParam = paramList.find((param) => param.name === pair[1]);

      if (!xParam || !yParam) {
        continue;
      }

      const rawX = command.values[xParam.index] ?? 0;
      const rawY = command.values[yParam.index] ?? 0;
      const absoluteX = relative ? startX + rawX : rawX;
      const absoluteY = relative ? startY + rawY : rawY;

      handles.push(
        numericHandle(node.id, `cmd-${commandIndex}-${pair[0]}`, absoluteX, absoluteY, `${command.command} ${pair[0]}/${pair[1]}`, (root, x, y) =>
          updatePathCommand(root, node.id, commandIndex, (items) => {
            const nextX = relative ? x - startX : x;
            const nextY = relative ? y - startY : y;
            return updateCommandValue(updateCommandValue(items, commandIndex, xParam.index, nextX), commandIndex, yParam.index, nextY);
          })
        , pair[2])
      );
    }

    if (upper === "H") {
      const x = command.values[0] ?? 0;
      const absoluteX = relative ? currentX + x : x;
      handles.push(numericHandle(node.id, `cmd-${commandIndex}-h`, absoluteX, currentY, `${command.command} x`, (root, xValue) => updatePathCommand(root, node.id, commandIndex, (items) => updateCommandValue(items, commandIndex, 0, relative ? xValue - startX : xValue))));
      currentX = absoluteX;
    } else if (upper === "V") {
      const y = command.values[0] ?? 0;
      const absoluteY = relative ? currentY + y : y;
      handles.push(numericHandle(node.id, `cmd-${commandIndex}-v`, currentX, absoluteY, `${command.command} y`, (root, _x, yValue) => updatePathCommand(root, node.id, commandIndex, (items) => updateCommandValue(items, commandIndex, 0, relative ? yValue - startY : yValue))));
      currentY = absoluteY;
    } else if (upper === "Z") {
      currentX = subpathX;
      currentY = subpathY;
    } else {
      const xIndex = paramList.find((param) => param.name === "x")?.index;
      const yIndex = paramList.find((param) => param.name === "y")?.index;

      if (xIndex !== undefined) {
        currentX = relative ? currentX + (command.values[xIndex] ?? 0) : command.values[xIndex] ?? currentX;
      }

      if (yIndex !== undefined) {
        currentY = relative ? currentY + (command.values[yIndex] ?? 0) : command.values[yIndex] ?? currentY;
      }

      if (upper === "M") {
        subpathX = currentX;
        subpathY = currentY;
      }
    }
  });

  return handles;
}

function numericHandle(
  nodeId: string,
  id: string,
  x: number,
  y: number,
  label: string,
  update: (root: SvgElementNode, x: number, y: number) => SvgElementNode,
  small = false
): HandleDescriptor {
  return { id, nodeId, x, y, label, small, update };
}

function updateNumericAttrs(root: SvgElementNode, nodeId: string, attrs: Record<string, number>): SvgElementNode {
  let next = root;

  for (const [name, value] of Object.entries(attrs)) {
    next = updateNumericAttrAsText(next, nodeId, name, formatHandleNumber(value));
  }

  return next;
}

function updateNumericAttrAsText(root: SvgElementNode, nodeId: string, name: string, value: string): SvgElementNode {
  return updateNode(root, nodeId, (node) => {
    if (node.kind !== "element") {
      return node;
    }

    return setAttribute(node, name, value);
  });
}

function updatePathCommand(
  root: SvgElementNode,
  nodeId: string,
  commandIndex: number,
  updater: (commands: readonly PathCommand[]) => readonly PathCommand[]
): SvgElementNode {
  return updateNode(root, nodeId, (node) => {
    if (node.kind !== "element") {
      return node;
    }

    const commands = parsePathData(getAttribute(node, "d", true));

    if (commandIndex < 0 || commandIndex >= commands.length) {
      return node;
    }

    return setAttribute(node, "d", formatPathData(updater(commands)));
  });
}

function formatHandleNumber(value: number): string {
  const rounded = Math.round(value * 1000) / 1000;
  return Number.isInteger(rounded) ? String(rounded) : String(rounded);
}

function transformHandle(handle: HandleDescriptor, matrix: Matrix2D): HandleDescriptor {
  const transformed = transformPoint(matrix, handle);
  const inverse = invertMatrix(matrix);

  return {
    ...handle,
    x: transformed.x,
    y: transformed.y,
    update: (root, x, y) => {
      if (!inverse) {
        return root;
      }

      const local = transformPoint(inverse, { x, y });
      return handle.update(root, local.x, local.y);
    }
  };
}
