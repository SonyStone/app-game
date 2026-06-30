import { attributeNumberRange, getAttributeDefault, getRecognizedAttributes } from "../svg-db";
import { createCommand, formatPathData, parsePathData, parsePoints, type PathCommand } from "../path-data";
import { getAttribute, type SvgAttribute, type SvgElementNode, type SvgNode } from "../svg-model";

import type { AppSettings, InspectorRow, OptimizerSettings, ThemePreset } from "./types";

export function orderedAttributes(node: SvgElementNode): readonly SvgAttribute[] {
  const recognized = getRecognizedAttributes(node.name);
  const existing = node.attrs;
  const ordered: SvgAttribute[] = [];

  for (const name of recognized) {
    const attr = existing.find((item) => item.name === name);
    ordered.push(attr ?? { name, value: getAttributeDefault(name) });
  }

  for (const attr of existing) {
    if (!recognized.includes(attr.name)) {
      ordered.push(attr);
    }
  }

  return ordered;
}

export function attrsToObject(attrs: readonly SvgAttribute[]): Record<string, string> {
  const result: Record<string, string> = {};

  for (const attr of attrs) {
    result[attr.name] = attr.value;
  }

  return result;
}

export function flattenAllNodes(root: SvgElementNode): readonly SvgNode[] {
  const result: SvgNode[] = [root];

  function visit(node: SvgElementNode): void {
    for (const child of node.children) {
      result.push(child);

      if (child.kind === "element") {
        visit(child);
      }
    }
  }

  visit(root);
  return result;
}

export function flattenInspectorRows(root: SvgElementNode, previousRows: readonly InspectorRow[] = []): readonly InspectorRow[] {
  const previousById = new Map(previousRows.map((row) => [row.node.id, row]));
  const rows: InspectorRow[] = [];

  function visit(node: SvgNode, depth: number): void {
    const previous = previousById.get(node.id);
    rows.push(previous && canReuseInspectorRow(previous, node, depth) ? previous : { node, depth });

    if (node.kind === "element") {
      for (const child of node.children) {
        visit(child, depth + 1);
      }
    }
  }

  visit(root, 0);
  return rows;
}

function canReuseInspectorRow(row: InspectorRow, node: SvgNode, depth: number): boolean {
  return row.depth === depth && inspectorNodesEqual(row.node, node);
}

function inspectorNodesEqual(previous: SvgNode, next: SvgNode): boolean {
  if (previous === next) {
    return true;
  }

  if (previous.id !== next.id || previous.kind !== next.kind) {
    return false;
  }

  if (previous.kind !== "element" && next.kind !== "element") {
    return previous.text === next.text;
  }

  if (previous.kind === "element" && next.kind === "element") {
    return previous.name === next.name && attrsEqual(previous.attrs, next.attrs);
  }

  return false;
}

function attrsEqual(previous: readonly SvgAttribute[], next: readonly SvgAttribute[]): boolean {
  if (previous === next) {
    return true;
  }

  if (previous.length !== next.length) {
    return false;
  }

  return previous.every((attr, index) => {
    const other = next[index];
    return other !== undefined && attr.name === other.name && attr.value === other.value;
  });
}

export function estimateInspectorRowHeight(node: SvgNode): number {
  if (node.kind !== "element") {
    return 112;
  }

  const attrCount = Math.max(getRecognizedAttributes(node.name).length, node.attrs.length);
  const pathData = getAttribute(node, "d", true);
  const pointData = getAttribute(node, "points", true);
  const pathCommandCount = pathData ? parsePathData(pathData).length : 0;
  const pointCount = pointData ? parsePoints(pointData).length : 0;

  return 52 + attrCount * 30 + pathCommandCount * 38 + pointCount * 34;
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function clampNumericAttribute(name: string, value: string): string {
  const ranges: Record<string, string> = attributeNumberRange;
  const range = ranges[name];

  if (!range) {
    return value;
  }

  const number = Number.parseFloat(value);

  if (!Number.isFinite(number) || value.trim().endsWith("%")) {
    return value;
  }

  if (range === "positive") {
    return String(Math.max(0, number));
  }

  if (range === "unit") {
    return String(clamp(number, 0, 1));
  }

  return value;
}

export function normalizeColorInput(value: string): string | undefined {
  if (/^#[0-9a-f]{6}$/i.test(value)) {
    return value;
  }

  if (/^#[0-9a-f]{3}$/i.test(value)) {
    const [, r, g, b] = value;
    return r && g && b ? `#${r}${r}${g}${g}${b}${b}` : undefined;
  }

  return undefined;
}

export function hasSvgDrag(event: DragEvent): boolean {
  const types = Array.from(event.dataTransfer?.types ?? []);

  if (types.includes("Files")) {
    return true;
  }

  return types.includes("text/plain") || types.includes("text/html") || types.includes("text/uri-list");
}

export function optimizeNode(node: SvgNode, settings: OptimizerSettings): SvgNode | null {
  if (node.kind === "comment" && settings.removeComments) {
    return null;
  }

  if (node.kind !== "element") {
    if (node.kind === "text" && !node.text.trim()) {
      return null;
    }

    return node;
  }

  const attrs = node.attrs
    .filter((attr) => attr.value !== "")
    .map((attr) => {
      if (settings.simplifyPathParameters && attr.name === "d") {
        return { ...attr, value: formatPathData(parsePathData(attr.value), true) };
      }

      return attr;
    });
  const children = node.children.map((child) => optimizeNode(child, settings)).filter((child): child is SvgNode => child !== null);

  return { ...node, attrs, children };
}

export function themePresetSettings(preset: ThemePreset, settings: AppSettings): AppSettings {
  switch (preset) {
    case "light":
      return { ...settings, themePreset: preset, baseColor: "#e6f0ff", accentColor: "#0053a6", canvasColor: "#ffffff", gridColor: "#666666" };
    case "black":
      return { ...settings, themePreset: preset, baseColor: "#000000", accentColor: "#7c8dbf", canvasColor: "#000000", gridColor: "#808080" };
    case "gray":
      return { ...settings, themePreset: preset, baseColor: "#262626", accentColor: "#80aaff", canvasColor: "#404040", gridColor: "#999999" };
    case "dark":
      return { ...settings, themePreset: preset, baseColor: "#10121d", accentColor: "#6699ff", canvasColor: "#1f2233", gridColor: "#808080" };
  }
}

export function insertPathCommand(commands: readonly PathCommand[], index: number, command: string): readonly PathCommand[] {
  const next = [...commands];
  next.splice(index + 1, 0, createCommand(command));
  return next;
}
