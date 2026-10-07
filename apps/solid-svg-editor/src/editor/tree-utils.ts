import { attributeNumberRange, getAttributeDefault, getRecognizedAttributes, propagatedAttributes } from "../svg-db";
import { formatPathData, simplifyPathCommands, tryParsePathData } from "../path-data";
import { convertElement } from "./element-conversion";
import { getAttribute, type SvgAttribute, type SvgElementNode, type SvgNode } from "../svg-model";

import type { AppSettings, InspectorRow, OptimizerSettings, ThemePreset } from "./types";

/**
 * The element's recognized attributes in GodSVG order, then its other attributes. Recognized attributes the element
 * does not set have an empty value; show `inheritedAttributeValue` as their placeholder.
 */
export function orderedAttributes(node: SvgElementNode): readonly SvgAttribute[] {
  const recognized = getRecognizedAttributes(node.name);
  const existing = node.attrs;
  const ordered: SvgAttribute[] = [];

  for (const name of recognized) {
    const attr = existing.find((item) => item.name === name);
    ordered.push(attr ?? { name, value: "" });
  }

  for (const attr of existing) {
    if (!recognized.includes(attr.name)) {
      ordered.push(attr);
    }
  }

  return ordered;
}

/**
 * The value an element renders for an attribute it does not set, like GodSVG's `get_default`: propagated presentation
 * attributes (fill, stroke, …) come from the nearest ancestor that sets them, others from the element's own default.
 * `ancestors` runs from the parent up to the root, as returned by `ancestorElements`.
 */
export function inheritedAttributeValue(element: SvgElementNode, ancestors: readonly SvgElementNode[], name: string): string {
  if ((propagatedAttributes as readonly string[]).includes(name)) {
    for (const ancestor of ancestors) {
      const value = getAttribute(ancestor, name, true);

      if (value !== "") {
        return value;
      }
    }

    return getAttributeDefault(name, "svg");
  }

  return getAttributeDefault(name, element.name);
}

/** Ancestors of a node from its parent up to the root; empty for the root or an unknown id. */
export function ancestorElements(root: SvgElementNode, id: string): readonly SvgElementNode[] {
  if (root.id === id) {
    return [];
  }

  for (const child of root.children) {
    if (child.id === id) {
      return [root];
    }

    if (child.kind === "element") {
      const path = ancestorElements(child, id);

      if (path.length > 0) {
        return [...path, root];
      }
    }
  }

  return [];
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

  for (const child of root.children) {
    visit(child, 0);
  }

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
  const pathCommandCount = pathData ? estimatePathCommandCount(pathData) : 0;
  const pointCount = pointData ? estimatePointCount(pointData) : 0;

  return 34 + Math.ceil(attrCount / 4) * 25 + pathCommandCount * 22 + pointCount * 28;
}

function estimatePathCommandCount(value: string): number {
  return value.match(/[AaCcHhLlMmQqSsTtVvZz]/g)?.length ?? 0;
}

function estimatePointCount(value: string): number {
  const parts = value.trim().split(/[\s,]+/).filter(Boolean);
  return Math.ceil(parts.length / 2);
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/**
 * Clamps a numeric attribute to its range (`positive` lengths, `unit` opacities) while keeping any unit suffix such as
 * `mm` or `em`. Percentages, non-numeric text, and in-range values are returned unchanged.
 */
export function clampNumericAttribute(name: string, value: string): string {
  const ranges: Record<string, string> = attributeNumberRange;
  const range = ranges[name];
  const match = /^\s*([-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?)\s*([a-zA-Z]*)\s*$/.exec(value);

  if (!range || !match) {
    return value;
  }

  const number = Number(match[1]);
  const unit = match[2] ?? "";
  const clamped = range === "positive" ? Math.max(0, number) : range === "unit" && unit === "" ? clamp(number, 0, 1) : number;

  return clamped === number ? value : `${clamped}${unit}`;
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
        const commands = tryParsePathData(attr.value);
        return commands ? { ...attr, value: formatPathData(simplifyPathCommands(commands)) } : attr;
      }

      return attr;
    });
  const children = node.children.map((child) => optimizeNode(child, settings)).filter((child): child is SvgNode => child !== null);
  const optimized = { ...node, attrs, children };

  return settings.convertShapes ? (convertToSimplerShape(optimized) ?? optimized) : optimized;
}

/**
 * The optimizer's shape conversion, as in GodSVG: an ellipse with equal radii becomes a circle; a rect becomes a
 * circle, an ellipse, or (with square corners) a path; polygons, polylines, and lines become paths.
 */
function convertToSimplerShape(element: SvgElementNode): SvgElementNode | undefined {
  switch (element.name) {
    case "ellipse":
      return convertElement(element, "circle");
    case "rect": {
      const radius = getAttribute(element, "rx", true) || getAttribute(element, "ry", true);
      const hasRoundedCorners = radius !== "" && Number.parseFloat(radius) !== 0;
      return (
        convertElement(element, "circle") ??
        convertElement(element, "ellipse") ??
        (hasRoundedCorners ? undefined : convertElement(element, "path"))
      );
    }
    case "polygon":
    case "polyline":
    case "line":
      return convertElement(element, "path");
    default:
      return undefined;
  }
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

