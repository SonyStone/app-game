import type { PortableExplorerNode } from './portable';
import {
  createPortableTextNote,
  parseExplorerText,
  parsePortableExplorerNode,
  portableNodeTitle
} from './portable';

/** Custom clipboard MIME type preserving a complete Browser Atlas hierarchy. */
export const EXPLORER_CLIPBOARD_DATA_TYPE = 'application/x-browser-atlas-items+json';

/** Versioned clipboard envelope used between Browser Atlas panes and browser windows. */
export type ExplorerClipboardPayload = {
  format: 'browser-atlas-clipboard';
  version: 2;
  items: PortableExplorerNode[];
};

/** Writes a hierarchy in native, human-readable, and Browser Atlas-specific clipboard formats. */
export function writeExplorerClipboard(
  clipboardData: ClipboardDataStore,
  items: readonly PortableExplorerNode[]
): boolean {
  const payload = {
    format: 'browser-atlas-clipboard',
    version: 2,
    items: [...items]
  } satisfies ExplorerClipboardPayload;
  const serializedPayload = JSON.stringify(payload);

  let wroteData = setClipboardData(clipboardData, EXPLORER_CLIPBOARD_DATA_TYPE, serializedPayload);
  wroteData = setClipboardData(clipboardData, 'application/json', serializedPayload) || wroteData;
  wroteData = setClipboardData(clipboardData, 'text/plain', serializeClipboardText(items)) || wroteData;
  wroteData = setClipboardData(clipboardData, 'text/html', serializeClipboardHtml(items)) || wroteData;

  const urls = items.flatMap(collectPortableUrls);
  if (urls.length > 0) {
    wroteData = setClipboardData(clipboardData, 'text/uri-list', urls.join('\r\n')) || wroteData;
  }
  return wroteData;
}

/** Reads Browser Atlas hierarchies, URL lists, or arbitrary text from a clipboard event. */
export function readExplorerClipboard(clipboardData: ClipboardDataStore): PortableExplorerNode[] {
  for (const type of [EXPLORER_CLIPBOARD_DATA_TYPE, 'application/json']) {
    const serialized = clipboardData.getData(type);
    if (!serialized) {
      continue;
    }
    const payload = parseExplorerClipboardPayload(serialized);
    if (payload) {
      return payload.items;
    }
  }

  const plainText = clipboardData.getData('text/plain');
  const serializedLinks = clipboardData.getData('text/uri-list') || plainText;
  if (serializedLinks.trim()) {
    try {
      const links = parseExplorerText(serializedLinks, 'Pasted links').sources.explore;
      if (links.length > 0) {
        return links;
      }
    } catch {
      // Arbitrary clipboard text becomes a note below.
    }
  }

  return plainText.trim() ? [createPortableTextNote(plainText)] : [];
}

/** Parses an untrusted clipboard envelope without throwing for unrelated JSON content. */
export function parseExplorerClipboardPayload(serialized: string): ExplorerClipboardPayload | null {
  try {
    const value: unknown = JSON.parse(serialized);
    if (
      !isRecord(value) ||
      value.format !== 'browser-atlas-clipboard' ||
      value.version !== 2 ||
      !Array.isArray(value.items)
    ) {
      return null;
    }
    return {
      format: 'browser-atlas-clipboard',
      version: 2,
      items: value.items.map(parsePortableExplorerNode)
    };
  } catch {
    return null;
  }
}

/** Produces an indented representation suitable for chat, notes, and plain-text editors. */
export function serializeClipboardText(items: readonly PortableExplorerNode[]): string {
  return items.flatMap((item) => serializeTextNode(item, 0)).join('\n');
}

/** Produces a nested semantic list suitable for rich-text clipboard consumers. */
export function serializeClipboardHtml(items: readonly PortableExplorerNode[]): string {
  return `<ul>${items.map(serializeHtmlNode).join('')}</ul>`;
}

type ClipboardDataStore = {
  getData(format: string): string;
  setData(format: string, data: string): void;
};

function serializeTextNode(node: PortableExplorerNode, depth: number): string[] {
  const prefix = '  '.repeat(depth);
  const label = node.kind === 'link' ? `${node.title}\t${node.url}` : portableNodeTitle(node);
  return [`${prefix}${label}`, ...node.children.flatMap((child) => serializeTextNode(child, depth + 1))];
}

function serializeHtmlNode(node: PortableExplorerNode): string {
  const label =
    node.kind === 'link'
      ? `<a href="${escapeHtml(node.url)}">${escapeHtml(node.title)}</a>`
      : escapeHtml(portableNodeTitle(node));
  const children = node.children.length > 0 ? `<ul>${node.children.map(serializeHtmlNode).join('')}</ul>` : '';
  return `<li>${label}${children}</li>`;
}

function collectPortableUrls(node: PortableExplorerNode): string[] {
  return [...(node.kind === 'link' ? [node.url] : []), ...node.children.flatMap(collectPortableUrls)];
}

function setClipboardData(clipboardData: ClipboardDataStore, type: string, value: string): boolean {
  try {
    clipboardData.setData(type, value);
    return true;
  } catch {
    // Some browsers reject custom formats; standard representations remain available.
    return false;
  }
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/gu, escapeHtmlCharacter);
}

function escapeHtmlCharacter(character: string): string {
  switch (character) {
    case '&':
      return '&amp;';
    case '<':
      return '&lt;';
    case '>':
      return '&gt;';
    case '"':
      return '&quot;';
    case "'":
      return '&#39;';
    default:
      return character;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
