import { svgCapabilities, type SvgCapabilityRegistry } from './capabilities';
import type { SvgDocument, SvgResource, SvgResourceReference } from './svg-document';
import type { SvgElementNode, SvgNodeId } from '../svg-model';

type SvgResourceGraphCapabilityIndex = Pick<SvgCapabilityRegistry, 'inheritedAttributeNames' | 'isAttributeInherited'>;

export interface SvgResolvedResourceReference {
  readonly reference: SvgResourceReference;
  readonly resource: SvgResource | undefined;
  readonly node: SvgElementNode | undefined;
}

export interface SvgInheritedAttribute {
  readonly name: string;
  readonly value: string;
  readonly sourceNodeId: SvgNodeId;
  readonly inherited: boolean;
}

export interface SvgResourceGraph {
  readonly referencesFromNode: (nodeId: SvgNodeId) => readonly SvgResourceReference[];
  readonly referencesToResource: (resourceId: string) => readonly SvgResourceReference[];
  readonly resolveReference: (reference: SvgResourceReference) => SvgResolvedResourceReference;
  readonly resolveResourceNode: (resourceId: string) => SvgElementNode | undefined;
  readonly inheritedAttribute: (nodeId: SvgNodeId, name: string) => SvgInheritedAttribute | undefined;
  readonly inheritedAttributes: (nodeId: SvgNodeId, names?: readonly string[]) => readonly SvgInheritedAttribute[];
}

export function createSvgResourceGraph(
  document: Pick<SvgDocument, 'resources' | 'root'>,
  capabilities: SvgResourceGraphCapabilityIndex = svgCapabilities
): SvgResourceGraph {
  const nodeById = new Map<SvgNodeId, SvgElementNode>();
  const parentById = new Map<SvgNodeId, SvgElementNode>();
  const referencesByNodeId = new Map<SvgNodeId, SvgResourceReference[]>();
  const referencesByResourceId = new Map<string, SvgResourceReference[]>();

  visitElements(document.root, undefined, (node, parent) => {
    nodeById.set(node.id, node);

    if (parent) {
      parentById.set(node.id, parent);
    }
  });

  for (const reference of document.resources.references) {
    addMapArrayItem(referencesByNodeId, reference.nodeId, reference);
    addMapArrayItem(referencesByResourceId, reference.targetId, reference);
  }

  function referencesFromNode(nodeId: SvgNodeId): readonly SvgResourceReference[] {
    return referencesByNodeId.get(nodeId) ?? [];
  }

  function referencesToResource(resourceId: string): readonly SvgResourceReference[] {
    return referencesByResourceId.get(resourceId) ?? [];
  }

  function resolveReference(reference: SvgResourceReference): SvgResolvedResourceReference {
    const resource = document.resources.byId.get(reference.targetId);
    const node = resource ? resolveResourceNode(resource.id) : undefined;

    return {
      reference,
      resource,
      node
    };
  }

  function resolveResourceNode(resourceId: string): SvgElementNode | undefined {
    const resource = document.resources.byId.get(resourceId);
    return resource ? nodeById.get(resource.nodeId) : undefined;
  }

  function inheritedAttribute(nodeId: SvgNodeId, name: string): SvgInheritedAttribute | undefined {
    if (!capabilities.isAttributeInherited(name)) {
      return undefined;
    }

    const node = nodeById.get(nodeId);

    if (!node) {
      return undefined;
    }

    return inheritedAttributeFromNode(node, name, false);
  }

  function inheritedAttributeFromNode(
    node: SvgElementNode,
    name: string,
    inherited: boolean
  ): SvgInheritedAttribute | undefined {
    const attr = node.attrs.find((item) => item.name === name);

    if (attr) {
      return {
        name,
        value: attr.value,
        sourceNodeId: node.id,
        inherited
      };
    }

    const parent = parentById.get(node.id);
    return parent ? inheritedAttributeFromNode(parent, name, true) : undefined;
  }

  function inheritedAttributes(nodeId: SvgNodeId, names: readonly string[] = capabilities.inheritedAttributeNames) {
    return names
      .map((name) => inheritedAttribute(nodeId, name))
      .filter((attribute): attribute is SvgInheritedAttribute => attribute !== undefined);
  }

  return {
    referencesFromNode,
    referencesToResource,
    resolveReference,
    resolveResourceNode,
    inheritedAttribute,
    inheritedAttributes
  } satisfies SvgResourceGraph;
}

function addMapArrayItem<TKey, TValue>(map: Map<TKey, TValue[]>, key: TKey, value: TValue): void {
  const values = map.get(key);

  if (values) {
    values.push(value);
    return;
  }

  map.set(key, [value]);
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
