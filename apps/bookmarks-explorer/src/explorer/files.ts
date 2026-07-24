import type { ExplorerBackend } from './backend';
import type { ExplorerSourceId } from './model';
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
  if (file.name.toLowerCase().endsWith('.json') || serialized.trimStart().startsWith('{')) {
    return parseExplorerDocument(serialized);
  }
  return parseExplorerText(serialized, title);
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
  downloadText(`${safeFilename(document.title)}.bookmarks-explorer.json`, serializeExplorerDocument(document), 'application/json');
}

/** Downloads one portable collection as a newline-oriented URL list. */
export function downloadExplorerSourceText(
  title: string,
  source: ExplorerSourceId,
  nodes: readonly PortableExplorerNode[]
): void {
  downloadText(`${safeFilename(`${title}-${source}`)}.txt`, serializeExplorerText(nodes), 'text/plain');
}

function downloadText(filename: string, contents: string, type: string): void {
  const url = URL.createObjectURL(new Blob([contents], { type }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  queueMicrotask(() => URL.revokeObjectURL(url));
}

function safeFilename(value: string): string {
  const filename = value.trim().replace(/[<>:"/\\|?*\u0000-\u001f]/gu, '-');
  return filename || 'bookmarks-explorer';
}

function removeExtension(filename: string): string {
  return filename.replace(/\.[^.]+$/u, '');
}

const EXPLORER_SOURCE_IDS = ['explore', 'bookmarks', 'history'] as const satisfies readonly ExplorerSourceId[];
