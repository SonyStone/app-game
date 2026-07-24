import type { ExplorerSourceId, ExplorerTreeNode } from './model';

/** Stable identifier written into every portable Bookmarks Explorer document. */
export const EXPLORER_DOCUMENT_FORMAT = 'bookmarks-explorer';

/** Current portable document schema version. */
export const EXPLORER_DOCUMENT_VERSION = 1;

/** Browser-independent tree node that can cross backends, browsers, and files. */
export type PortableExplorerNode = PortableExplorerGroup | PortableExplorerLink;

/** Portable branch preserving semantic grouping without backend-local IDs. */
export type PortableExplorerGroup = {
  /** Distinguishes branches from navigable links. */
  kind: 'group';
  /** Cross-backend semantic treatment for the branch. */
  groupKind: 'window' | 'folder' | 'date';
  /** User-facing branch label. */
  title: string;
  /** Ordered portable descendants. */
  children: PortableExplorerNode[];
  /** Whether viewers should initially collapse the branch. */
  defaultCollapsed: boolean;
};

/** Portable navigable item containing only data another backend can consume. */
export type PortableExplorerLink = {
  /** Distinguishes navigable links from branches. */
  kind: 'link';
  /** User-facing link label. */
  title: string;
  /** Destination preserved across backends. */
  url: string;
  /** Optional favicon hint preserved when the originating backend provides one. */
  faviconUrl: string | null;
  /** Optional caller-facing context represented as an always-present string. */
  description: string;
  /** Nested portable descendants used by saved-session trees. */
  children: PortableExplorerNode[];
  /** Whether viewers should initially collapse nested descendants. */
  defaultCollapsed: boolean;
};

/** Versioned file format containing all explorer collections. */
export type ExplorerDocument = {
  /** Stable format discriminator. */
  format: typeof EXPLORER_DOCUMENT_FORMAT;
  /** Schema version used for validation and future migrations. */
  version: typeof EXPLORER_DOCUMENT_VERSION;
  /** User-facing document name. */
  title: string;
  /** Portable tabs, bookmarks, and history collections. */
  sources: Record<ExplorerSourceId, PortableExplorerNode[]>;
};

/** Creates an empty editable explorer document. */
export function createEmptyExplorerDocument(title = 'Untitled document'): ExplorerDocument {
  return {
    format: EXPLORER_DOCUMENT_FORMAT,
    version: EXPLORER_DOCUMENT_VERSION,
    title,
    sources: { explore: [], bookmarks: [], history: [] }
  };
}

/** Converts a normalized explorer node into a backend-independent transfer node. */
export function createPortableExplorerNode(node: ExplorerTreeNode): PortableExplorerNode | null {
  if (node.kind === 'message') {
    return null;
  }

  const children = node.children.flatMap((child) => {
    const portableChild = createPortableExplorerNode(child);
    return portableChild ? [portableChild] : [];
  });

  if (node.kind === 'link') {
    if (!node.url) {
      return null;
    }
    return {
      kind: 'link',
      title: node.title,
      url: node.url,
      faviconUrl: node.faviconUrl,
      description: node.description,
      children,
      defaultCollapsed: node.defaultCollapsed
    };
  }

  if (node.groupKind === 'source') {
    return null;
  }

  return {
    kind: 'group',
    groupKind: node.groupKind,
    title: node.title,
    children,
    defaultCollapsed: node.defaultCollapsed
  };
}

/** Converts the children of a normalized source root into portable nodes. */
export function portableChildren(root: ExplorerTreeNode): PortableExplorerNode[] {
  if (root.kind === 'message') {
    return [];
  }
  return root.children.flatMap((node) => {
    const portableNode = createPortableExplorerNode(node);
    return portableNode ? [portableNode] : [];
  });
}

/** Serializes a portable document as readable, deterministic JSON. */
export function serializeExplorerDocument(document: ExplorerDocument): string {
  return `${JSON.stringify(document, null, 2)}\n`;
}

/** Parses and validates an untrusted portable JSON document. */
export function parseExplorerDocument(serialized: string): ExplorerDocument {
  let value: unknown;
  try {
    value = JSON.parse(serialized);
  } catch (reason: unknown) {
    throw new Error(reason instanceof Error ? `Invalid JSON: ${reason.message}` : 'The file is not valid JSON.');
  }

  if (!isRecord(value) || value.format !== EXPLORER_DOCUMENT_FORMAT) {
    throw new Error(`Expected a ${EXPLORER_DOCUMENT_FORMAT} document.`);
  }
  if (value.version !== EXPLORER_DOCUMENT_VERSION) {
    throw new Error(`Unsupported Bookmarks Explorer document version: ${String(value.version)}.`);
  }
  if (typeof value.title !== 'string' || !isRecord(value.sources)) {
    throw new Error('The document title or sources are invalid.');
  }

  const parseState = { nodeCount: 0 };
  return {
    format: EXPLORER_DOCUMENT_FORMAT,
    version: EXPLORER_DOCUMENT_VERSION,
    title: value.title,
    sources: {
      explore: parseNodeList(value.sources.explore, 'sources.explore', 0, parseState),
      bookmarks: parseNodeList(value.sources.bookmarks, 'sources.bookmarks', 0, parseState),
      history: parseNodeList(value.sources.history, 'sources.history', 0, parseState)
    }
  };
}

/** Validates one untrusted node received through drag-and-drop or another transport. */
export function parsePortableExplorerNode(value: unknown): PortableExplorerNode {
  return parseNode(value, 'item', 0, { nodeCount: 0 });
}

/** Parses a newline-oriented URL list into an Explore document. */
export function parseExplorerText(serialized: string, title = 'Imported links'): ExplorerDocument {
  const links = serialized.split(/\r?\n/u).flatMap((line, index) => {
    const parsed = parseTextLink(line);
    if (!parsed) {
      return [];
    }
    return [
      {
        kind: 'link',
        title: parsed.title || `Link ${index + 1}`,
        url: parsed.url,
        faviconUrl: null,
        description: parsed.url,
        children: [],
        defaultCollapsed: false
      } satisfies PortableExplorerLink
    ];
  });

  if (links.length === 0 && serialized.trim().length > 0) {
    throw new Error('The text file does not contain any recognizable URLs.');
  }

  const document = createEmptyExplorerDocument(title);
  document.sources.explore = links;
  return document;
}

/** Serializes every URL in a source tree as a newline-oriented text file. */
export function serializeExplorerText(nodes: readonly PortableExplorerNode[]): string {
  const urls = nodes.flatMap(collectUrls);
  return urls.length > 0 ? `${urls.join('\n')}\n` : '';
}

type ParseState = { nodeCount: number };

function parseNodeList(value: unknown, path: string, depth: number, state: ParseState): PortableExplorerNode[] {
  if (!Array.isArray(value)) {
    throw new Error(`${path} must be an array.`);
  }
  return value.map((node, index) => parseNode(node, `${path}[${index}]`, depth, state));
}

function parseNode(value: unknown, path: string, depth: number, state: ParseState): PortableExplorerNode {
  if (depth > MAX_DOCUMENT_DEPTH) {
    throw new Error(`The document exceeds the maximum tree depth at ${path}.`);
  }
  state.nodeCount += 1;
  if (state.nodeCount > MAX_DOCUMENT_NODES) {
    throw new Error(`The document exceeds the maximum of ${MAX_DOCUMENT_NODES} nodes.`);
  }
  if (!isRecord(value) || typeof value.kind !== 'string' || typeof value.title !== 'string') {
    throw new Error(`${path} is not a valid explorer node.`);
  }

  const children = parseNodeList(value.children, `${path}.children`, depth + 1, state);
  const defaultCollapsed = value.defaultCollapsed === true;

  if (value.kind === 'link') {
    if (
      typeof value.url !== 'string' ||
      typeof value.description !== 'string' ||
      value.faviconUrl !== undefined && value.faviconUrl !== null && typeof value.faviconUrl !== 'string'
    ) {
      throw new Error(`${path} is not a valid link.`);
    }
    return {
      kind: 'link',
      title: value.title,
      url: value.url,
      faviconUrl: typeof value.faviconUrl === 'string' ? value.faviconUrl : null,
      description: value.description,
      children,
      defaultCollapsed
    };
  }

  if (value.kind === 'group' && isPortableGroupKind(value.groupKind)) {
    return { kind: 'group', groupKind: value.groupKind, title: value.title, children, defaultCollapsed };
  }

  throw new Error(`${path} has an unsupported node kind.`);
}

function parseTextLink(line: string): { title: string; url: string } | null {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith('#')) {
    return null;
  }

  const markdownMatch = /^\[([^\]]*)\]\(([^)]+)\)$/u.exec(trimmed);
  if (markdownMatch?.[2] && isUrl(markdownMatch[2])) {
    return { title: markdownMatch[1] ?? '', url: markdownMatch[2] };
  }

  const tabSeparator = trimmed.lastIndexOf('\t');
  if (tabSeparator >= 0) {
    const url = trimmed.slice(tabSeparator + 1).trim();
    if (isUrl(url)) {
      return { title: trimmed.slice(0, tabSeparator).trim(), url };
    }
  }

  if (isUrl(trimmed)) {
    return { title: trimmed, url: trimmed };
  }

  const urlMatch = /(?:https?|ftp|file|about|chrome):\/\/\S+|about:\S+/u.exec(trimmed);
  if (!urlMatch || !isUrl(urlMatch[0])) {
    return null;
  }
  return { title: trimmed.slice(0, urlMatch.index).replace(/[-–—:]+$/u, '').trim(), url: urlMatch[0] };
}

function isUrl(value: string): boolean {
  try {
    new URL(value);
    return true;
  } catch {
    return false;
  }
}

function collectUrls(node: PortableExplorerNode): string[] {
  return [...(node.kind === 'link' ? [node.url] : []), ...node.children.flatMap(collectUrls)];
}

function isPortableGroupKind(value: unknown): value is PortableExplorerGroup['groupKind'] {
  return value === 'window' || value === 'folder' || value === 'date';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

const MAX_DOCUMENT_DEPTH = 100;
const MAX_DOCUMENT_NODES = 100_000;
