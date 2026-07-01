import { defaultElements, getAttributeDefault, isRecognizedElement, isValidChild, type RecognizedElement } from "./svg-db";

export interface SvgAttribute {
  readonly name: string;
  readonly value: string;
}

export interface SvgElementNode {
  readonly id: string;
  readonly kind: "element";
  readonly name: string;
  readonly attrs: readonly SvgAttribute[];
  readonly children: readonly SvgNode[];
  readonly expanded: boolean;
}

export interface SvgTextNode {
  readonly id: string;
  readonly kind: "text";
  readonly text: string;
}

export interface SvgCommentNode {
  readonly id: string;
  readonly kind: "comment";
  readonly text: string;
}

export interface SvgCDataNode {
  readonly id: string;
  readonly kind: "cdata";
  readonly text: string;
}

export type SvgNode = SvgElementNode | SvgTextNode | SvgCommentNode | SvgCDataNode;
export type DropPosition = "before" | "after" | "inside";

export type ParseResult =
  | { readonly ok: true; readonly root: SvgElementNode }
  | { readonly ok: false; readonly error: "not-svg" | "invalid-xml"; readonly message: string };

let nextId = 1;

export function createId(): string {
  const id = `x${nextId}`;
  nextId += 1;
  return id;
}

export function resetIdCounter(): void {
  nextId = 1;
}

export function createElementNode(
  name: string,
  attrs: readonly SvgAttribute[] = [],
  children: readonly SvgNode[] = [],
  expanded = true
): SvgElementNode {
  return {
    id: createId(),
    kind: "element",
    name,
    attrs: [...attrs],
    children: [...children],
    expanded
  };
}

export function createDefaultElement(name: RecognizedElement | string): SvgElementNode {
  const defaults: Record<string, string> = isRecognizedElement(name) ? defaultElements[name] : {};
  return createElementNode(
    name,
    Object.entries(defaults).map(([attrName, value]) => ({ name: attrName, value }))
  );
}

export function createDefaultRoot(): SvgElementNode {
  const defs = defaultElements.svg;
  return createElementNode("svg", [
    { name: "xmlns", value: defs.xmlns },
    { name: "width", value: defs.width },
    { name: "height", value: defs.height },
    { name: "viewBox", value: defs.viewBox }
  ]);
}

export function cloneRoot(root: SvgElementNode): SvgElementNode {
  return cloneNode(root) as SvgElementNode;
}

export function cloneNode(node: SvgNode): SvgNode {
  switch (node.kind) {
    case "element":
      return {
        id: node.id,
        kind: "element",
        name: node.name,
        attrs: node.attrs.map((attr) => ({ ...attr })),
        children: node.children.map(cloneNode),
        expanded: node.expanded
      };
    case "text":
    case "comment":
    case "cdata":
      return { ...node };
  }
}

export function cloneWithFreshIds(node: SvgNode): SvgNode {
  switch (node.kind) {
    case "element":
      return {
        id: createId(),
        kind: "element",
        name: node.name,
        attrs: node.attrs.map((attr) => ({ ...attr })),
        children: node.children.map(cloneWithFreshIds),
        expanded: node.expanded
      };
    case "text":
      return { id: createId(), kind: "text", text: node.text };
    case "comment":
      return { id: createId(), kind: "comment", text: node.text };
    case "cdata":
      return { id: createId(), kind: "cdata", text: node.text };
  }
}

export function parseSvgMarkup(markup: string): ParseResult {
  if (!markup.trim()) {
    return { ok: false, error: "not-svg", message: "Doesn't describe an SVG." };
  }

  resetIdCounter();
  const parser = new DOMParser();
  const doc = parser.parseFromString(markup, "image/svg+xml");
  const parserError = doc.querySelector("parsererror");

  if (parserError) {
    return { ok: false, error: "invalid-xml", message: parserError.textContent?.trim() || "Improper nesting." };
  }

  const svgElement = doc.querySelector("svg");

  if (!svgElement) {
    return { ok: false, error: "not-svg", message: "Doesn't describe an SVG." };
  }

  const root = domElementToSvgNode(svgElement);

  return { ok: true, root };
}

function domNodeToSvgNode(node: Node): SvgNode | null {
  switch (node.nodeType) {
    case Node.ELEMENT_NODE:
      return domElementToSvgNode(node as Element);
    case Node.TEXT_NODE: {
      const text = node.textContent ?? "";
      return text.trim() ? { id: createId(), kind: "text", text } : null;
    }
    case Node.COMMENT_NODE:
      return { id: createId(), kind: "comment", text: node.textContent ?? "" };
    case Node.CDATA_SECTION_NODE:
      return { id: createId(), kind: "cdata", text: node.textContent ?? "" };
    default:
      return null;
  }
}

function domElementToSvgNode(element: Element): SvgElementNode {
  const attrs = Array.from(element.attributes).map((attribute) => ({
    name: attribute.name,
    value: attribute.value
  }));

  const children = Array.from(element.childNodes)
    .map(domNodeToSvgNode)
    .filter((node): node is SvgNode => node !== null);

  return createElementNode(element.tagName, attrs, children);
}

export function getAttribute(node: SvgElementNode, name: string, real = false): string {
  const attr = node.attrs.find((item) => item.name === name);
  return attr ? attr.value : real ? "" : getAttributeDefault(name);
}

export function hasAttribute(node: SvgElementNode, name: string): boolean {
  return node.attrs.some((attr) => attr.name === name);
}

export function setAttribute(node: SvgElementNode, name: string, value: string): SvgElementNode {
  const trimmedName = name.trim();

  if (!trimmedName) {
    return node;
  }

  const existingIndex = node.attrs.findIndex((attr) => attr.name === trimmedName);

  if (value === "") {
    return existingIndex === -1 ? node : { ...node, attrs: node.attrs.filter((_, index) => index !== existingIndex) };
  }

  if (existingIndex === -1) {
    return { ...node, attrs: [...node.attrs, { name: trimmedName, value }] };
  }

  const existing = node.attrs[existingIndex];

  if (existing?.value === value) {
    return node;
  }

  const attrs = [...node.attrs];
  attrs[existingIndex] = { name: trimmedName, value };
  return { ...node, attrs };
}

export function removeAttribute(node: SvgElementNode, name: string): SvgElementNode {
  return node.attrs.some((attr) => attr.name === name) ? { ...node, attrs: node.attrs.filter((attr) => attr.name !== name) } : node;
}

export function findNode(root: SvgElementNode, id: string): SvgNode | undefined {
  if (root.id === id) {
    return root;
  }

  return findNodeInChildren(root.children, id);
}

function findNodeInChildren(nodes: readonly SvgNode[], id: string): SvgNode | undefined {
  for (const node of nodes) {
    if (node.id === id) {
      return node;
    }

    if (node.kind === "element") {
      const found = findNodeInChildren(node.children, id);

      if (found) {
        return found;
      }
    }
  }

  return undefined;
}

export function findParent(root: SvgElementNode, id: string): SvgElementNode | undefined {
  for (const child of root.children) {
    if (child.id === id) {
      return root;
    }

    if (child.kind === "element") {
      const found = findParent(child, id);

      if (found) {
        return found;
      }
    }
  }

  return undefined;
}

export function updateNode(root: SvgElementNode, id: string, updater: (node: SvgNode) => SvgNode): SvgElementNode {
  if (root.id === id) {
    const updated = updater(root);
    return updated.kind === "element" ? updated : root;
  }

  const children = updateNodeList(root.children, id, updater);
  return children === root.children ? root : { ...root, children };
}

function updateNodeList(nodes: readonly SvgNode[], id: string, updater: (node: SvgNode) => SvgNode): readonly SvgNode[] {
  let changed = false;
  const next = nodes.map((node) => {
    if (node.id === id) {
      const updated = updater(node);
      changed ||= updated !== node;
      return updated;
    }

    if (node.kind === "element") {
      const children = updateNodeList(node.children, id, updater);

      if (children !== node.children) {
        changed = true;
        return { ...node, children };
      }
    }

    return node;
  });

  return changed ? next : nodes;
}

export function removeNode(root: SvgElementNode, id: string): SvgElementNode {
  if (root.id === id) {
    return root;
  }

  const children = removeNodeFromChildren(root.children, id);
  return children === root.children ? root : { ...root, children };
}

function removeNodeFromChildren(nodes: readonly SvgNode[], id: string): readonly SvgNode[] {
  let changed = false;
  const next: SvgNode[] = [];

  for (const node of nodes) {
    if (node.id === id) {
      changed = true;
      continue;
    }

    if (node.kind === "element") {
      const children = removeNodeFromChildren(node.children, id);

      if (children !== node.children) {
        changed = true;
        next.push({ ...node, children });
        continue;
      }
    }

    next.push(node);
  }

  return changed ? next : nodes;
}

export function appendChild(root: SvgElementNode, parentId: string, child: SvgNode): SvgElementNode {
  return updateNode(root, parentId, (node) => {
    if (node.kind !== "element") {
      return node;
    }

    return { ...node, children: [...node.children, child], expanded: true };
  });
}

export function insertSibling(root: SvgElementNode, targetId: string, child: SvgNode, after: boolean): SvgElementNode {
  if (root.id === targetId) {
    return root;
  }

  const children = insertSiblingInChildren(root.children, targetId, child, after);
  return children === root.children ? root : { ...root, children };
}

function insertSiblingInChildren(nodes: readonly SvgNode[], targetId: string, child: SvgNode, after: boolean): readonly SvgNode[] {
  const index = nodes.findIndex((node) => node.id === targetId);

  if (index !== -1) {
    const next = [...nodes];
    next.splice(after ? index + 1 : index, 0, child);
    return next;
  }

  let changed = false;
  const next = nodes.map((node) => {
    if (node.kind === "element") {
      const children = insertSiblingInChildren(node.children, targetId, child, after);

      if (children !== node.children) {
        changed = true;
        return { ...node, children };
      }
    }

    return node;
  });

  return changed ? next : nodes;
}

export function moveNode(root: SvgElementNode, id: string, direction: -1 | 1): SvgElementNode {
  const children = moveInChildren(root.children, id, direction);
  return children === root.children ? root : { ...root, children };
}

export function moveNodesTo(root: SvgElementNode, ids: readonly string[], targetId: string, position: DropPosition): SvgElementNode {
  const movingIds = topLevelNodeIds(root, ids).filter((id) => id !== root.id);

  if (movingIds.length === 0 || movingIds.includes(targetId)) {
    return root;
  }

  const target = findNode(root, targetId);
  const targetParent = position === "inside" && target?.kind === "element" ? target : findParent(root, targetId);

  if (!target || !targetParent) {
    return root;
  }

  for (const id of movingIds) {
    const movingNode = findNode(root, id);

    if (!movingNode || nodeContainsId(movingNode, targetParent.id)) {
      return root;
    }

    if (movingNode.kind === "element" && !isValidChild(targetParent.name, movingNode.name)) {
      return root;
    }
  }

  const targetIndex = position === "inside" ? 0 : targetParent.children.findIndex((child) => child.id === targetId) + (position === "after" ? 1 : 0);

  if (targetIndex < 0) {
    return root;
  }

  const movingNodes = movingIds.map((id) => findNode(root, id)).filter((node): node is SvgNode => Boolean(node));
  const removedBeforeTarget = movingIds.filter((id) => {
    const parent = findParent(root, id);

    if (parent?.id !== targetParent.id) {
      return false;
    }

    return parent.children.findIndex((child) => child.id === id) < targetIndex;
  }).length;
  const adjustedIndex = Math.max(0, targetIndex - removedBeforeTarget);
  const withoutMoving = movingIds.reduce((next, id) => removeNode(next, id), root);

  return insertChildrenAt(withoutMoving, targetParent.id, movingNodes, adjustedIndex);
}

function topLevelNodeIds(root: SvgElementNode, ids: readonly string[]): readonly string[] {
  const selected = new Set(ids);
  const ordered: string[] = [];

  function visit(node: SvgNode, selectedAncestor: boolean): void {
    const isSelected = selected.has(node.id);

    if (isSelected && !selectedAncestor) {
      ordered.push(node.id);
    }

    if (node.kind !== "element") {
      return;
    }

    for (const child of node.children) {
      visit(child, selectedAncestor || isSelected);
    }
  }

  visit(root, false);
  return ordered;
}

function nodeContainsId(node: SvgNode, id: string): boolean {
  if (node.id === id) {
    return true;
  }

  if (node.kind !== "element") {
    return false;
  }

  return node.children.some((child) => nodeContainsId(child, id));
}

function insertChildrenAt(root: SvgElementNode, parentId: string, childrenToInsert: readonly SvgNode[], index: number): SvgElementNode {
  return updateNode(root, parentId, (node) => {
    if (node.kind !== "element") {
      return node;
    }

    const nextChildren = [...node.children];
    nextChildren.splice(Math.max(0, Math.min(index, nextChildren.length)), 0, ...childrenToInsert);
    return { ...node, children: nextChildren, expanded: true };
  });
}

function moveInChildren(nodes: readonly SvgNode[], id: string, direction: -1 | 1): readonly SvgNode[] {
  const index = nodes.findIndex((node) => node.id === id);

  if (index !== -1) {
    const targetIndex = index + direction;

    if (targetIndex < 0 || targetIndex >= nodes.length) {
      return nodes;
    }

    const next = [...nodes];
    const item = next[index];

    if (!item) {
      return nodes;
    }

    next.splice(index, 1);
    next.splice(targetIndex, 0, item);
    return next;
  }

  let changed = false;
  const next = nodes.map((node) => {
    if (node.kind === "element") {
      const children = moveInChildren(node.children, id, direction);

      if (children !== node.children) {
        changed = true;
        return { ...node, children };
      }
    }

    return node;
  });

  return changed ? next : nodes;
}

export function flattenElements(root: SvgElementNode): readonly SvgElementNode[] {
  const result: SvgElementNode[] = [root];
  visitElements(root, result);
  return result;
}

function visitElements(node: SvgElementNode, result: SvgElementNode[]): void {
  for (const child of node.children) {
    if (child.kind === "element") {
      result.push(child);
      visitElements(child, result);
    }
  }
}

export function svgSize(root: SvgElementNode): { readonly width: number; readonly height: number; readonly viewBox: readonly [number, number, number, number] } {
  const viewBox = parseNumberList(getAttribute(root, "viewBox")).slice(0, 4);
  const width = parseLength(getAttribute(root, "width")) || viewBox[2] || 900;
  const height = parseLength(getAttribute(root, "height")) || viewBox[3] || 900;
  const parsedViewBox = [
    viewBox[0] ?? 0,
    viewBox[1] ?? 0,
    viewBox[2] ?? width,
    viewBox[3] ?? height
  ] as const;

  return { width, height, viewBox: parsedViewBox };
}

export function parseLength(value: string): number {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function parseNumberList(value: string): number[] {
  return value
    .trim()
    .split(/[\s,]+/)
    .map((part) => Number.parseFloat(part))
    .filter((num) => Number.isFinite(num));
}

export function nodeLabel(node: SvgNode): string {
  switch (node.kind) {
    case "element": {
      const id = getAttribute(node, "id", true);
      return id ? `${node.name}#${id}` : node.name;
    }
    case "text":
      return "text";
    case "comment":
      return "comment";
    case "cdata":
      return "CDATA";
  }
}
