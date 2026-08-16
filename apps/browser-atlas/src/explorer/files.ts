import type { ExplorerBackend } from './backend';
import type { ExplorerSourceId } from './model';
import { parseTabsOutlinerDocument } from './legacyTabsOutliner';
import type { ExplorerDocument, PortableExplorerNode } from './portable';
import {
  createEmptyExplorerDocument,
  parseExplorerDocument,
  parseExplorerText,
  portableChildren,
  serializeExplorerDocument,
  serializeExplorerText
} from './portable';

/** Reads a portable JSON document or newline-oriented URL text file. */
export async function readExplorerFile(file: File): Promise<ExplorerDocument> {
  const serialized = await file.text();
  const title = removeExtension(file.name) || 'Imported document';
  if (file.name.toLowerCase().endsWith('.html') || /^\s*<!doctype\s+html|^\s*<html[\s>]/iu.test(serialized)) {
    return parseExplorerHtmlDocument(serialized);
  }
  if (
    file.name.toLowerCase().endsWith('.json') ||
    file.name.toLowerCase().endsWith('.tree') ||
    /^[\[{]/u.test(serialized.trimStart())
  ) {
    return hasBrowserAtlasFormat(serialized)
      ? parseExplorerDocument(serialized)
      : parseTabsOutlinerDocument(serialized, title);
  }
  return parseExplorerText(serialized, title);
}

function hasBrowserAtlasFormat(serialized: string): boolean {
  try {
    const value: unknown = JSON.parse(serialized);
    return typeof value === 'object' &&
      value !== null &&
      'format' in value &&
      value.format === 'browser-atlas';
  } catch {
    return false;
  }
}

/** Captures every available source from a backend as a portable document. */
export async function createExplorerDocumentSnapshot(
  backend: ExplorerBackend,
  title: string
): Promise<ExplorerDocument> {
  const document = createEmptyExplorerDocument(title);
  for (const source of EXPLORER_SOURCE_IDS) {
    if (!backend.capabilities.sources[source]) {
      continue;
    }
    const root = await backend.load(source);
    document.sources[source] = portableChildren(root);
  }
  return document;
}

/** Downloads a complete portable document as JSON. */
export function downloadExplorerDocument(document: ExplorerDocument): void {
  downloadText(`${safeFilename(document.title)}.browser-atlas.json`, serializeExplorerDocument(document), 'application/json');
}

/** Downloads one portable collection as a newline-oriented URL list. */
export function downloadExplorerSourceText(
  title: string,
  source: ExplorerSourceId,
  nodes: readonly PortableExplorerNode[]
): void {
  downloadText(`${safeFilename(`${title}-${source}`)}.txt`, serializeExplorerText(nodes), 'text/plain');
}

/** One currently visible explorer row captured for HTML export or printing. */
export type ExplorerHtmlRow = Readonly<{
  depth: number;
  title: string;
  url: string | null;
  description: string;
}>;

/** Downloads the currently visible tree rows as a standalone, printable HTML document. */
export function downloadExplorerHtml(
  title: string,
  source: ExplorerSourceId,
  rows: readonly ExplorerHtmlRow[],
  nodes: readonly PortableExplorerNode[]
): void {
  const sourceLabel = source[0]?.toLocaleUpperCase() + source.slice(1);
  const documentTitle = `${title} · ${sourceLabel}`;
  const document = createEmptyExplorerDocument(documentTitle);
  document.sources[source] = [...nodes];
  downloadText(
    `${safeFilename(`${title}-${source}`)}.html`,
    serializeExplorerHtml(documentTitle, rows, document),
    'text/html'
  );
}

/** Serializes visible rows without depending on their virtualized DOM representation. */
export function serializeExplorerHtml(
  title: string,
  rows: readonly ExplorerHtmlRow[],
  document?: ExplorerDocument
): string {
  const contents = rows.map((row) => {
    const label = row.url
      ? `<a href="${escapeHtml(row.url)}">${escapeHtml(row.title)}</a>`
      : `<span>${escapeHtml(row.title)}</span>`;
    const description = row.description
      ? `<small>${escapeHtml(row.description)}</small>`
      : '';
    return `<li style="--depth:${Math.max(0, row.depth)}">${label}${description}</li>`;
  }).join('');
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(title)}</title>
  <style>
    body{font:14px/1.45 system-ui,sans-serif;margin:2rem;color:#171717;background:#fff}
    h1{font-size:1.25rem;margin:0 0 1rem}ol{list-style:none;margin:0;padding:0}
    li{margin:.2rem 0;padding-left:calc(var(--depth)*1.25rem)}a{color:#075985;text-decoration:none}
    small{display:block;color:#737373;font-size:.75rem}@media print{body{margin:.5in}a{color:inherit}}
  </style>
</head>
<body><h1>${escapeHtml(title)}</h1><ol>${contents}</ol>${document ? serializeHtmlDocumentEnvelope(document) : ''}</body>
</html>`;
}

/** Recovers and validates the portable tree embedded in a Browser Atlas HTML export. */
export function parseExplorerHtmlDocument(serialized: string): ExplorerDocument {
  const start = serialized.indexOf(EXPLORER_HTML_DOCUMENT_PREFIX);
  if (start < 0) {
    throw new Error('This HTML file does not contain an embedded Browser Atlas tree.');
  }
  const contentsStart = start + EXPLORER_HTML_DOCUMENT_PREFIX.length;
  const end = serialized.indexOf(EXPLORER_HTML_DOCUMENT_SUFFIX, contentsStart);
  if (end < 0) {
    throw new Error('The embedded Browser Atlas tree is incomplete.');
  }
  return parseExplorerDocument(serialized.slice(contentsStart, end).trim());
}

function serializeHtmlDocumentEnvelope(document: ExplorerDocument): string {
  const serialized = serializeExplorerDocument(document)
    .trimEnd()
    .replaceAll('&', '\\u0026')
    .replaceAll('<', '\\u003c')
    .replaceAll('>', '\\u003e');
  return `${EXPLORER_HTML_DOCUMENT_PREFIX}${serialized}${EXPLORER_HTML_DOCUMENT_SUFFIX}`;
}

function downloadText(filename: string, contents: string, type: string): void {
  const url = URL.createObjectURL(new Blob([contents], { type }));
  const browserDocument = Reflect.get(globalThis, 'document') as {
    createElement: (tagName: 'a') => { href: string; download: string; click: () => void };
  };
  const anchor = browserDocument.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  queueMicrotask(() => URL.revokeObjectURL(url));
}

function safeFilename(value: string): string {
  const filename = value.trim().replace(/[<>:"/\\|?*\u0000-\u001f]/gu, '-');
  return filename || 'browser-atlas';
}

function removeExtension(filename: string): string {
  return filename.replace(/\.[^.]+$/u, '');
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/gu, (character) => HTML_ENTITIES[character] ?? character);
}

const EXPLORER_SOURCE_IDS = ['explore', 'bookmarks', 'history'] as const satisfies readonly ExplorerSourceId[];

const EXPLORER_HTML_DOCUMENT_PREFIX =
  '<script type="application/json" id="browser-atlas-document">\n';
const EXPLORER_HTML_DOCUMENT_SUFFIX = '\n</script>';

const HTML_ENTITIES: Readonly<Record<string, string>> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;'
};
