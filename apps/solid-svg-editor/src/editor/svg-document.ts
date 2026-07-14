import { serializeRoot, type FormatterSettings } from '../formatter';
import { svgCapabilities, type SvgCapabilityRegistry } from './capabilities';
import { collectSvgDiagnostics } from './svg-diagnostics';
import { createSvgResourceGraph, type SvgResourceGraph } from './svg-resource-graph';
import { createSvgSpatialIndex, type SvgSpatialIndex } from './svg-spatial-index';
import type { SvgDiagnostic } from './kernel';
import {
  findNode,
  flattenElements,
  parseSvgMarkup,
  type ParseResult,
  type SvgElementNode,
  type SvgNode,
  type SvgNodeId
} from '../svg-model';

export type CoreSvgResourceKind =
  | 'paint-server'
  | 'symbol'
  | 'clip-path'
  | 'mask'
  | 'filter'
  | 'marker'
  | 'pattern'
  | 'unknown';

export type SvgResourceKind = CoreSvgResourceKind | (string & {});

export interface SvgDocument {
  readonly root: SvgElementNode;
  readonly resources: SvgResourceIndex;
  readonly resourceGraph: SvgResourceGraph;
  readonly spatialIndex: SvgSpatialIndex;
  readonly diagnostics: readonly SvgDiagnostic[];
}

export interface SvgResourceIndex {
  readonly byId: ReadonlyMap<string, SvgResource>;
  readonly references: readonly SvgResourceReference[];
}

export interface SvgResource {
  readonly id: string;
  readonly nodeId: SvgNodeId;
  readonly elementName: string;
  readonly kind: SvgResourceKind;
}

export interface SvgResourceReference {
  readonly nodeId: SvgNodeId;
  readonly attributeName: string;
  readonly targetId: string;
  readonly kind: SvgResourceKind;
}

export type SvgDocumentParseResult =
  | { readonly ok: true; readonly document: SvgDocument }
  | Extract<ParseResult, { readonly ok: false }>;

export type SvgResourceCapabilityIndex = Pick<SvgCapabilityRegistry, 'getAttribute' | 'getElement'>;
export type SvgDocumentCapabilityIndex = SvgResourceCapabilityIndex &
  Pick<
    SvgCapabilityRegistry,
    | 'getElementBounds'
    | 'getElementDiagnostics'
    | 'inheritedAttributeNames'
    | 'isAttributeInherited'
    | 'isAttributeRecognized'
    | 'isValidChild'
  >;
export type SvgDocumentFactoryCapabilityIndex = SvgDocumentCapabilityIndex & Pick<SvgCapabilityRegistry, 'createElement'>;

export function createSvgDocument(
  root: SvgElementNode,
  capabilities: SvgDocumentCapabilityIndex = svgCapabilities
): SvgDocument {
  const resources = indexSvgResources(root, capabilities);
  const resourceGraph = createSvgResourceGraph({ root, resources }, capabilities);
  const spatialIndex = createSvgSpatialIndex(root, capabilities);
  const document = {
    root,
    resources,
    resourceGraph,
    spatialIndex,
    diagnostics: []
  } satisfies SvgDocument;

  return {
    ...document,
    diagnostics: collectSvgDiagnostics(document, capabilities)
  };
}

export function createEmptySvgDocument(
  capabilities: SvgDocumentFactoryCapabilityIndex = svgCapabilities
): SvgDocument {
  return createSvgDocument(capabilities.createElement('svg'), capabilities);
}

export function parseSvgDocument(
  markup: string,
  capabilities: SvgDocumentCapabilityIndex = svgCapabilities
): SvgDocumentParseResult {
  const parsed = parseSvgMarkup(markup);

  if (!parsed.ok) {
    return parsed;
  }

  return { ok: true, document: createSvgDocument(parsed.root, capabilities) };
}

export function serializeSvgDocument(document: SvgDocument, formatter: FormatterSettings): string {
  return serializeRoot(document.root, formatter);
}

export function updateSvgDocumentRoot(
  document: SvgDocument,
  root: SvgElementNode,
  capabilities: SvgDocumentCapabilityIndex = svgCapabilities
): SvgDocument {
  return root === document.root ? document : createSvgDocument(root, capabilities);
}

export function selectSvgDocumentNode(document: SvgDocument, id: string): SvgNode | undefined {
  return findNode(document.root, id);
}

export function selectSvgDocumentElements(document: SvgDocument): readonly SvgElementNode[] {
  return flattenElements(document.root);
}

export function indexSvgResources(
  root: SvgElementNode,
  capabilities: SvgResourceCapabilityIndex = svgCapabilities
): SvgResourceIndex {
  const byId = new Map<string, SvgResource>();
  const references: SvgResourceReference[] = [];

  visitElements(root, (node) => {
    const id = node.attrs.find((attr) => attr.name === 'id')?.value.trim();
    const resourceKind = capabilities.getElement(node.name)?.resourceKind;

    if (id) {
      byId.set(id, {
        id,
        nodeId: node.id,
        elementName: node.name,
        kind: resourceKind ?? 'unknown'
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
        kind: capabilities.getAttribute(attr.name).resourceReferenceKind ?? 'unknown'
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
