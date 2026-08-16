import type {
  ExplorerDocument,
  PortableExplorerGroup,
  PortableExplorerLink,
  PortableExplorerNode,
  PortableExplorerSeparator
} from './portable';
import { createEmptyExplorerDocument } from './portable';

/** Parses an original Tabs Outliner tree export or hierarchy interchange payload. */
export function parseTabsOutlinerDocument(serialized: string, title: string): ExplorerDocument {
  let value: unknown;
  try {
    value = JSON.parse(serialized);
  } catch (reason: unknown) {
    throw new Error(reason instanceof Error ? `Invalid Tabs Outliner JSON: ${reason.message}` : 'Invalid Tabs Outliner JSON.');
  }

  const root = Array.isArray(value)
    ? parseOperationLog(value)
    : isHierarchyEnvelope(value)
      ? parseHierarchyEnvelope(value, 'root', 0, { count: 0 })
      : isLegacyNodeValue(value)
        ? parseLegacyNode(value, 'root', 0, { count: 0 })
        : undefined;
  if (!root) {
    throw new Error('The JSON file is not a recognized Tabs Outliner tree export.');
  }
  if (legacyNodeType(root.value) !== 'session' && Array.isArray(value)) {
    throw new Error('The Tabs Outliner operation log root is not a session.');
  }

  const document = createEmptyExplorerDocument(title);
  document.sources.explore = legacyNodeType(root.value) === 'session'
    ? root.children.map(convertLegacyNode)
    : [convertLegacyNode(root)];
  return document;
}

type LegacyNode = {
  value: Record<string, unknown>;
  children: LegacyNode[];
};

type ParseState = { count: number };

function parseOperationLog(entries: readonly unknown[]): LegacyNode {
  if (entries.length > MAX_LEGACY_NODES + 2) {
    throw new Error(`The Tabs Outliner export exceeds the maximum of ${MAX_LEGACY_NODES} nodes.`);
  }
  const rootEntry = entries[0];
  if (!isRecord(rootEntry) || rootEntry.type !== ROOT_OPERATION || !('node' in rootEntry)) {
    throw new Error('The file is not a Tabs Outliner operation log.');
  }

  const root = parseLegacyNode(rootEntry.node, 'root', 0, { count: 0 });
  const childrenByParent = new Map<string, { index: number; node: LegacyNode; path: string }[]>();
  for (const [offset, entry] of entries.slice(1).entries()) {
    if (isRecord(entry) && entry.type === END_OPERATION) {
      continue;
    }
    if (!isInsertOperation(entry)) {
      throw new Error(`Invalid Tabs Outliner operation at index ${offset + 1}.`);
    }
    const [, nodeValue, path] = entry;
    const index = path.at(-1);
    if (index === undefined) {
      throw new Error(`Tabs Outliner operation ${offset + 1} has an empty path.`);
    }
    const itemPath = path.join('.');
    const parentPath = path.slice(0, -1).join('.');
    const siblings = childrenByParent.get(parentPath) ?? [];
    siblings.push({
      index,
      node: parseLegacyNode(nodeValue, `operation[${offset + 1}]`, 0, { count: offset + 1 }),
      path: itemPath
    });
    childrenByParent.set(parentPath, siblings);
  }

  attachOperationChildren(root, '', childrenByParent, 0);
  if (childrenByParent.size > 0) {
    throw new Error('The Tabs Outliner operation log contains nodes whose parent path is missing.');
  }
  return root;
}

function attachOperationChildren(
  node: LegacyNode,
  path: string,
  childrenByParent: Map<string, { index: number; node: LegacyNode; path: string }[]>,
  depth: number
): void {
  if (depth > MAX_LEGACY_DEPTH) {
    throw new Error(`The Tabs Outliner export exceeds the maximum depth of ${MAX_LEGACY_DEPTH}.`);
  }
  const children = [...(childrenByParent.get(path) ?? [])].sort((left, right) => left.index - right.index);
  childrenByParent.delete(path);
  node.children = children.map((child) => {
    attachOperationChildren(child.node, child.path, childrenByParent, depth + 1);
    return child.node;
  });
}

function parseHierarchyEnvelope(
  value: unknown,
  path: string,
  depth: number,
  state: ParseState
): LegacyNode {
  if (!isRecord(value) || !('n' in value)) {
    throw new Error(`${path} is not a Tabs Outliner hierarchy node.`);
  }
  const node = parseLegacyNode(value.n, `${path}.n`, depth, state);
  const children = value.s === undefined ? [] : value.s;
  if (!Array.isArray(children)) {
    throw new Error(`${path}.s must be an array.`);
  }
  node.children = children.map((child, index) =>
    parseHierarchyEnvelope(child, `${path}.s[${index}]`, depth + 1, state)
  );
  return node;
}

function parseLegacyNode(value: unknown, path: string, depth: number, state: ParseState): LegacyNode {
  if (depth > MAX_LEGACY_DEPTH) {
    throw new Error(`The Tabs Outliner export exceeds the maximum depth at ${path}.`);
  }
  state.count += 1;
  if (state.count > MAX_LEGACY_NODES) {
    throw new Error(`The Tabs Outliner export exceeds the maximum of ${MAX_LEGACY_NODES} nodes.`);
  }
  if (!isRecord(value)) {
    throw new Error(`${path} is not a Tabs Outliner node.`);
  }
  const children = value.children;
  if (children !== undefined && !Array.isArray(children)) {
    throw new Error(`${path}.children must be an array.`);
  }
  return {
    value,
    children: (children ?? []).map((child, index) =>
      parseLegacyNode(child, `${path}.children[${index}]`, depth + 1, state)
    )
  };
}

function convertLegacyNode(node: LegacyNode): PortableExplorerNode {
  const type = legacyNodeType(node.value);
  const data = isRecord(node.value.data) ? node.value.data : {};
  const marks = isRecord(node.value.marks) ? node.value.marks : {};
  const children = node.children.map(convertLegacyNode);
  const defaultCollapsed = node.value.colapsed === true ||
    typeof node.value.type === 'number' && node.value.type < 0;

  if (type === 'textnote') {
    return {
      kind: 'note',
      text: readString(data.note) ?? readLegacyTitle(data, marks, type),
      children,
      defaultCollapsed
    };
  }
  if (type === 'separatorline') {
    return {
      kind: 'separator',
      style: readSeparatorStyle(data.separatorIndx),
      children,
      defaultCollapsed
    };
  }
  if (isWindowType(type) || type === 'group' || type === 'session') {
    return {
      kind: 'group',
      groupKind: isWindowType(type) ? 'window' : 'group',
      title: readLegacyTitle(data, marks, type),
      children,
      defaultCollapsed
    } satisfies PortableExplorerGroup;
  }

  const url = readNonEmptyString(data.url) ?? readNonEmptyString(data.pendingUrl);
  if (!url) {
    return {
      kind: 'group',
      groupKind: 'group',
      title: readLegacyTitle(data, marks, type),
      children,
      defaultCollapsed
    };
  }
  return {
    kind: 'link',
    title: readCustomTitle(marks) ?? readNonEmptyString(data.title) ?? url,
    url,
    faviconUrl: readCustomFavicon(marks) ?? readNonEmptyString(data.favIconUrl),
    description: `Imported from Tabs Outliner · ${url}`,
    children,
    defaultCollapsed,
    ...(hasCustomProtection(marks) ? { keepOnClose: true } : {})
  } satisfies PortableExplorerLink;
}

function readLegacyTitle(
  data: Record<string, unknown>,
  marks: Record<string, unknown>,
  type: string
): string {
  const title = readCustomTitle(marks) ?? readNonEmptyString(data.title);
  if (title) {
    return title;
  }
  if (type === 'session') {
    return 'Current Session';
  }
  if (type === 'group') {
    return 'Untitled group';
  }
  if (isWindowType(type)) {
    const timestamp = typeof data.closeDate === 'number' ? data.closeDate : data.crashDetectedDate;
    return typeof timestamp === 'number' ? `Window (${new Date(timestamp).toLocaleString()})` : 'Window';
  }
  return 'Untitled tab';
}

function legacyNodeType(value: Record<string, unknown>): string {
  if (typeof value.type === 'string') {
    return value.type;
  }
  return typeof value.type === 'number'
    ? LEGACY_NUMERIC_NODE_TYPES[Math.abs(value.type)] ?? 'savedtab'
    : 'savedtab';
}

function hasCustomProtection(marks: Record<string, unknown>): boolean {
  return readNonEmptyString(marks.customColorActive) !== null ||
    readNonEmptyString(marks.customColorSaved) !== null ||
    readNonEmptyString(marks.U) !== null ||
    readNonEmptyString(marks.V) !== null;
}

function readCustomTitle(marks: Record<string, unknown>): string | null {
  return readNonEmptyString(marks.customTitle) ??
    readNonEmptyString(marks.J) ??
    readNonEmptyString(marks.W);
}

function readCustomFavicon(marks: Record<string, unknown>): string | null {
  return readNonEmptyString(marks.customFavicon) ??
    readNonEmptyString(marks.u) ??
    readNonEmptyString(marks.I);
}

function readSeparatorStyle(value: unknown): PortableExplorerSeparator['style'] {
  return value === 1 || value === 2 ? value : 0;
}

function readString(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

function readNonEmptyString(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function isInsertOperation(value: unknown): value is readonly [number, unknown, number[]] {
  return Array.isArray(value) &&
    value.length === 3 &&
    value[0] === INSERT_OPERATION &&
    Array.isArray(value[2]) &&
    value[2].every((segment) => Number.isInteger(segment) && segment >= 0);
}

function isHierarchyEnvelope(value: unknown): value is Record<'n', unknown> & { s?: unknown } {
  return isRecord(value) && 'n' in value;
}

function isLegacyNodeValue(value: unknown): value is Record<string, unknown> {
  return isRecord(value) && (
    'type' in value ||
    'data' in value ||
    'marks' in value ||
    'dId' in value ||
    'children' in value
  );
}

function isWindowType(type: string): boolean {
  return type === 'win' || type === 'savedwin' || type === 'waitingwin';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

const ROOT_OPERATION = 2_000;
const INSERT_OPERATION = 2_001;
const END_OPERATION = 11_111;
const MAX_LEGACY_DEPTH = 100;
const MAX_LEGACY_NODES = 100_000;
const LEGACY_NUMERIC_NODE_TYPES = [
  'zero',
  'session',
  'textnote',
  'separatorline',
  'tab',
  'savedtab',
  'group',
  'win',
  'savedwin',
  'attachwaitingtab',
  'waitingwin',
  'waitingtab'
] as const;
