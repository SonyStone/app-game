import { svgCapabilities, type SvgCapabilityRegistry } from './capabilities';
import type { SvgDiagnostic } from './kernel';
import type { SvgDocument } from './svg-document';
import type { SvgElementNode } from '../svg-model';

type SvgDiagnosticCapabilityIndex = Pick<
  SvgCapabilityRegistry,
  'getElement' | 'getElementDiagnostics' | 'isAttributeRecognized' | 'isValidChild'
>;

export function collectSvgDiagnostics(
  document: SvgDocument,
  capabilities: SvgDiagnosticCapabilityIndex = svgCapabilities
): readonly SvgDiagnostic[] {
  const diagnostics: SvgDiagnostic[] = [];
  const nodesBySvgId = new Map<string, SvgElementNode>();

  visitElements(document.root, undefined, (node, parent) => {
    const capability = capabilities.getElement(node.name);
    const id = node.attrs.find((attr) => attr.name === 'id')?.value.trim();

    if (parent && !capabilities.isValidChild(parent.name, node.name)) {
      diagnostics.push({
        kind: 'invalid-child',
        severity: 'error',
        nodeId: node.id,
        parentNodeId: parent.id,
        parentName: parent.name,
        childName: node.name,
        message: `<${node.name}> cannot be placed inside <${parent.name}>.`
      });
    }

    if (!capability) {
      diagnostics.push({
        kind: 'unsupported-element',
        severity: 'warning',
        nodeId: node.id,
        elementName: node.name,
        message: `<${node.name}> is not yet supported by the editor capability registry.`
      });
    } else {
      for (const attr of node.attrs) {
        if (!capabilities.isAttributeRecognized(node.name, attr.name)) {
          diagnostics.push({
            kind: 'unknown-attribute',
            severity: 'warning',
            nodeId: node.id,
            elementName: node.name,
            attributeName: attr.name,
            message: `<${node.name}> has unknown attribute "${attr.name}".`
          });
        }
      }

      diagnostics.push(...capabilities.getElementDiagnostics(node, document));
    }

    if (!id) {
      return;
    }

    const firstNode = nodesBySvgId.get(id);

    if (!firstNode) {
      nodesBySvgId.set(id, node);
      return;
    }

    diagnostics.push({
      kind: 'duplicate-id',
      severity: 'error',
      nodeId: node.id,
      duplicateId: id,
      firstNodeId: firstNode.id,
      message: `Duplicate id "${id}" is already used by <${firstNode.name}>.`
    });
  });

  for (const reference of document.resources.references) {
    if (document.resources.byId.has(reference.targetId)) {
      continue;
    }

    diagnostics.push({
      kind: 'broken-resource-reference',
      severity: 'error',
      nodeId: reference.nodeId,
      attributeName: reference.attributeName,
      targetId: reference.targetId,
      referenceKind: reference.kind,
      message: `${reference.attributeName} references missing resource "#${reference.targetId}".`
    });
  }

  return diagnostics;
}

function visitElements(
  node: SvgElementNode,
  parent: SvgElementNode | undefined,
  visitor: (node: SvgElementNode, parent: SvgElementNode | undefined) => void
): void {
  visitor(node, parent);

  for (const child of node.children) {
    if (child.kind === 'element') {
      visitElements(child, node, visitor);
    }
  }
}
