import { serializeRoot, type FormatterSettings } from '../formatter';
import {
  createDefaultRoot,
  findNode,
  flattenElements,
  parseSvgMarkup,
  type ParseResult,
  type SvgElementNode,
  type SvgNode
} from '../svg-model';

export type SvgResourceKind =
  | 'paint-server'
  | 'symbol'
  | 'clip-path'
  | 'mask'
  | 'filter'
  | 'marker'
  | 'pattern'
  | 'unknown';

export interface SvgDocument {
  readonly root: SvgElementNode;
  readonly resources: SvgResourceIndex;
}

export interface SvgResourceIndex {
  readonly byId: ReadonlyMap<string, SvgResource>;
  readonly references: readonly SvgResourceReference[];
}

export interface SvgResource {
  readonly id: string;
  readonly nodeId: string;
  readonly elementName: string;
  readonly kind: SvgResourceKind;
}

export interface SvgResourceReference {
  readonly nodeId: string;
  readonly attributeName: string;
  readonly targetId: string;
  readonly kind: SvgResourceKind;
}

export type SvgDocumentParseResult =
  | { readonly ok: true; readonly document: SvgDocument }
  | Extract<ParseResult, { readonly ok: false }>;

const resourceElementKinds = new Map<string, SvgResourceKind>([
  ['linearGradient', 'paint-server'],
  ['radialGradient', 'paint-server'],
  ['symbol', 'symbol'],
  ['clipPath', 'clip-path'],
  ['mask', 'mask'],
  ['filter', 'filter'],
  ['marker', 'marker'],
  ['pattern', 'pattern']
]);

const resourceReferenceKinds = new Map<string, SvgResourceKind>([
  ['fill', 'paint-server'],
  ['stroke', 'paint-server'],
  ['href', 'unknown'],
  ['xlink:href', 'unknown'],
  ['clip-path', 'clip-path'],
  ['mask', 'mask'],
  ['filter', 'filter'],
  ['marker-start', 'marker'],
  ['marker-mid', 'marker'],
  ['marker-end', 'marker']
]);

export function createSvgDocument(root: SvgElementNode): SvgDocument {
  return {
    root,
    resources: indexSvgResources(root)
  };
}

export function createEmptySvgDocument(): SvgDocument {
  return createSvgDocument(createDefaultRoot());
}

export function parseSvgDocument(markup: string): SvgDocumentParseResult {
  const parsed = parseSvgMarkup(markup);

  if (!parsed.ok) {
    return parsed;
  }

  return { ok: true, document: createSvgDocument(parsed.root) };
}

export function serializeSvgDocument(document: SvgDocument, formatter: FormatterSettings): string {
  return serializeRoot(document.root, formatter);
}

export function updateSvgDocumentRoot(document: SvgDocument, root: SvgElementNode): SvgDocument {
  return root === document.root ? document : createSvgDocument(root);
}

export function selectSvgDocumentNode(document: SvgDocument, id: string): SvgNode | undefined {
  return findNode(document.root, id);
}

export function selectSvgDocumentElements(document: SvgDocument): readonly SvgElementNode[] {
  return flattenElements(document.root);
}

export function indexSvgResources(root: SvgElementNode): SvgResourceIndex {
  const byId = new Map<string, SvgResource>();
  const references: SvgResourceReference[] = [];

  visitElements(root, (node) => {
    const id = node.attrs.find((attr) => attr.name === 'id')?.value.trim();

    if (id) {
      byId.set(id, {
        id,
        nodeId: node.id,
        elementName: node.name,
        kind: resourceElementKinds.get(node.name) ?? 'unknown'
      });
    }

    for (const attr of node.attrs) {
      const targetId = resourceTargetId(attr.value);

      if (!targetId) {
        continue;
      }

      references.push({
        nodeId: node.id,
        attributeName: attr.name,
        targetId,
        kind: resourceReferenceKinds.get(attr.name) ?? 'unknown'
      });
    }
  });

  return { byId, references };
}

function visitElements(root: SvgElementNode, visitor: (node: SvgElementNode) => void): void {
  visitor(root);

  for (const child of root.children) {
    if (child.kind === 'element') {
      visitElements(child, visitor);
    }
  }
}

function resourceTargetId(value: string): string | undefined {
  const trimmed = value.trim();

  if (trimmed.startsWith('#') && trimmed.length > 1) {
    return trimmed.slice(1);
  }

  const urlMatch = /^url\(\s*["']?#([^"')\s]+)["']?\s*\)$/.exec(trimmed);
  return urlMatch?.[1];
}
