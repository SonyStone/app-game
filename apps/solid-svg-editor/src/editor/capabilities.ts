import { createElementNode, type SvgElementNode } from '../svg-model';
import type { Rect } from './geometry';
import { getHandlesFromProviders } from './handles';
import type { AttributeType, NumberRange } from './svg-attribute-types';
import type {
  SvgAttributeControlContext,
  SvgCapabilityContribution,
  SvgDiagnostic,
  SvgElementContribution
} from './kernel';
import { coreSvgCapabilityContributions } from './svg-capabilities/coreSvgContribution';
import CdataNodeIcon from '../svg-db-icons/element/xmlnodeCDATA.svg';
import CommentNodeIcon from '../svg-db-icons/element/xmlnodeComment.svg';
import TextNodeIcon from '../svg-db-icons/element/xmlnodeText.svg';
import UnrecognizedElementIcon from '../svg-db-icons/element/unrecognized.svg';
import type { SvgIcon } from './svg-icon';
import type { HandleDescriptor } from './types';
import type { SvgDocument, SvgResourceKind } from './svg-document';

export interface SvgElementCapability {
  readonly name: string;
  readonly defaults: Readonly<Record<string, string>>;
  readonly attributes: readonly string[];
  readonly icon: SvgIcon;
  readonly addable: boolean;
  readonly addableOrder: number | undefined;
  readonly resourceKind: SvgResourceKind | undefined;
}

export interface SvgAttributeCapability {
  readonly name: string;
  readonly type: AttributeType;
  readonly defaultValue: string;
  readonly numberRange: NumberRange | undefined;
  readonly enumValues: readonly string[];
  readonly color: SvgColorAttributeCapability;
  readonly resourceReferenceKind: SvgResourceKind | undefined;
  readonly inherits: boolean;
  readonly control: SvgAttributeControlRenderer | undefined;
}

export interface SvgColorAttributeCapability {
  readonly allowNone: boolean;
  readonly allowUrl: boolean;
  readonly allowCurrentColor: boolean;
}

export interface SvgCapabilityRegistry {
  readonly elements: readonly SvgElementCapability[];
  readonly addableElements: readonly SvgElementCapability[];
  readonly getElement: (name: string) => SvgElementCapability | undefined;
  readonly createElement: (name: string) => SvgElementNode;
  readonly getAttribute: (name: string) => SvgAttributeCapability;
  readonly inheritedAttributeNames: readonly string[];
  readonly getAttributeDefault: (name: string) => string;
  readonly getAttributeNumberRange: (name: string) => NumberRange | undefined;
  readonly getAttributeType: (name: string) => AttributeType;
  readonly isAttributeInherited: (name: string) => boolean;
  readonly renderAttributeControl: (context: SvgAttributeControlContext) => ReturnType<SvgAttributeControlRenderer> | undefined;
  readonly iconForElement: (name: string) => SvgIcon;
  readonly iconForNode: (kind: 'text' | 'comment' | 'cdata') => SvgIcon;
  readonly isAttributeRecognized: (elementName: string, attributeName: string) => boolean;
  readonly isCompactAttribute: (elementName: string, attributeName: string) => boolean;
  readonly isValidChild: (parentName: string, childName: string) => boolean;
  readonly getElementDiagnostics: (node: SvgElementNode, document: SvgDocument) => readonly SvgDiagnostic[];
  readonly getHandles: (root: SvgElementNode, selectedIds: readonly string[]) => readonly HandleDescriptor[];
  readonly getElementBounds: (root: SvgElementNode, node: SvgElementNode) => Rect | undefined;
}

const globalSvgAttributes = new Set([
  'id',
  'class',
  'style',
  'role',
  'tabindex',
  'xml:space',
  'clip-path',
  'mask',
  'filter',
  'marker-start',
  'marker-mid',
  'marker-end',
  'xlink:href'
]);

type SvgAttributeContributionEntry = NonNullable<SvgCapabilityContribution['attributes']>[number];
type SvgAttributeControlRenderer = NonNullable<SvgAttributeContributionEntry['control']>;

export function createSvgCapabilityRegistry(
  contributions: readonly SvgCapabilityContribution[] = coreSvgCapabilityContributions
): SvgCapabilityRegistry {
  const elementContributions = mergeElementContributions(contributions.flatMap((contribution) => contribution.elements ?? []));
  const attributeContributions = contributions.flatMap((contribution) => contribution.attributes ?? []);
  const elementByName = new Map(elementContributions.map((element) => [element.name, element]));
  const attributeByName = mergeAttributeContributions(attributeContributions);
  const inheritedAttributeNames = [...attributeByName.values()]
    .filter((attribute) => attribute.inherits === true)
    .map((attribute) => attribute.name);
  const capabilities = elementContributions.map((element) => ({
    name: element.name,
    defaults: element.defaults,
    attributes: element.attributes,
    icon: element.icon ?? UnrecognizedElementIcon,
    addable: element.addable === true,
    addableOrder: element.addableOrder,
    resourceKind: element.resourceKind
  })) satisfies readonly SvgElementCapability[];
  const capabilitiesByName = new Map(capabilities.map((capability) => [capability.name, capability]));

  return {
    elements: capabilities,
    addableElements: [...capabilities.filter((capability) => capability.addable)].sort(
      (left, right) => (left.addableOrder ?? Number.POSITIVE_INFINITY) - (right.addableOrder ?? Number.POSITIVE_INFINITY)
    ),
    getElement: (name) => capabilitiesByName.get(name),
    createElement: (name) => createElementFromCapability(name, elementByName),
    getAttribute: (name) => createAttributeCapability(name, attributeByName),
    inheritedAttributeNames,
    getAttributeDefault: (name) => attributeByName.get(name)?.defaultValue ?? '',
    getAttributeNumberRange: (name) => attributeByName.get(name)?.numberRange,
    getAttributeType: (name) => attributeByName.get(name)?.type ?? 'unknown',
    isAttributeInherited: (name) => attributeByName.get(name)?.inherits === true,
    renderAttributeControl: (context) => createAttributeCapability(context.name, attributeByName).control?.(context),
    iconForElement: (name) => capabilitiesByName.get(name)?.icon ?? UnrecognizedElementIcon,
    iconForNode,
    isAttributeRecognized: (elementName, attributeName) =>
      isGlobalSvgAttribute(attributeName) ||
      elementByName.get(elementName)?.attributes.includes(attributeName) === true,
    isCompactAttribute: (elementName, attributeName) => {
      const element = elementByName.get(elementName);
      const recognized =
        isGlobalSvgAttribute(attributeName) ||
        element?.attributes.includes(attributeName) === true;

      if (!recognized) {
        return false;
      }

      const type = attributeByName.get(attributeName)?.type ?? 'unknown';
      return type !== 'pathdata' && !(type === 'list' && attributeName === 'points');
    },
    isValidChild: (parentName, childName) => isValidContributionChild(parentName, childName, elementByName),
    getElementDiagnostics: (node, document) => elementByName.get(node.name)?.validate?.(node, document) ?? [],
    getHandles: (root, selectedIds) =>
      getHandlesFromProviders(root, selectedIds, ({ root: currentRoot, node }) => {
        const createHandles = elementByName.get(node.name)?.createHandles;
        return createHandles ? createHandles({ root: currentRoot, node }) : [];
      }),
    getElementBounds: (root, node) => elementByName.get(node.name)?.getBounds?.({ root, node })
  };
}

export const svgCapabilities = createSvgCapabilityRegistry();

function createElementFromCapability(
  name: string,
  elementByName: ReadonlyMap<string, SvgElementContribution>
): SvgElementNode {
  const contribution = elementByName.get(name);

  if (contribution?.createNode) {
    return contribution.createNode();
  }

  const defaults = contribution?.defaults ?? {};
  return createElementNode(
    name,
    Object.entries(defaults).map(([attrName, value]) => ({ name: attrName, value }))
  );
}

function createAttributeCapability(
  name: string,
  attributeByName: ReadonlyMap<string, SvgAttributeContributionEntry>
): SvgAttributeCapability {
  const contribution = attributeByName.get(name);

  return {
    name,
    type: contribution?.type ?? 'unknown',
    defaultValue: contribution?.defaultValue ?? '',
    numberRange: contribution?.numberRange,
    enumValues: contribution?.enumValues ?? [],
    color: {
      allowNone: contribution?.color?.allowNone ?? false,
      allowUrl: contribution?.color?.allowUrl ?? false,
      allowCurrentColor: contribution?.color?.allowCurrentColor ?? false
    },
    resourceReferenceKind: contribution?.resourceReferenceKind,
    inherits: contribution?.inherits === true,
    control: contribution?.control
  };
}

function mergeElementContributions(
  contributions: readonly SvgElementContribution[]
): readonly SvgElementContribution[] {
  const merged = new Map<string, SvgElementContribution>();
  const order = new Map<string, number>();

  for (const contribution of contributions) {
    if (!order.has(contribution.name)) {
      order.set(contribution.name, order.size);
    }

    merged.set(contribution.name, contribution);
  }

  return [...merged.values()].sort((left, right) => (order.get(left.name) ?? 0) - (order.get(right.name) ?? 0));
}

function mergeAttributeContributions(
  contributions: readonly SvgAttributeContributionEntry[]
): ReadonlyMap<string, SvgAttributeContributionEntry> {
  const merged = new Map<string, SvgAttributeContributionEntry>();

  for (const contribution of contributions) {
    const previous = merged.get(contribution.name);
    const color = mergeAttributeColor(previous?.color, contribution.color);
    const next = {
      ...previous,
      ...contribution,
      ...(color ? { color } : {})
    } satisfies SvgAttributeContributionEntry;
    merged.set(contribution.name, next);
  }

  return merged;
}

function mergeAttributeColor(
  previous: SvgAttributeContributionEntry['color'] | undefined,
  next: SvgAttributeContributionEntry['color'] | undefined
): SvgAttributeContributionEntry['color'] | undefined {
  if (!previous) {
    return next;
  }

  if (!next) {
    return previous;
  }

  return { ...previous, ...next };
}

function isGlobalSvgAttribute(name: string): boolean {
  return (
    globalSvgAttributes.has(name) ||
    name.startsWith('data-') ||
    name.startsWith('aria-') ||
    name.startsWith('xmlns:')
  );
}

function isValidContributionChild(
  parentName: string,
  childName: string,
  elementByName: ReadonlyMap<string, SvgElementContribution>
): boolean {
  const parent = elementByName.get(parentName);

  if (!parent || !parent.allowedChildren) {
    return true;
  }

  if (parent.allowedChildren.includes(childName)) {
    return true;
  }

  return isOpenContainerElement(parentName);
}

function isOpenContainerElement(name: string): boolean {
  return name === 'svg' || name === 'g';
}

function iconForNode(kind: 'text' | 'comment' | 'cdata'): SvgIcon {
  switch (kind) {
    case 'text':
      return TextNodeIcon;
    case 'comment':
      return CommentNodeIcon;
    case 'cdata':
      return CdataNodeIcon;
    default: {
      const exhaustive: never = kind;
      throw new Error(`Unhandled SVG node icon kind: ${exhaustive}`);
    }
  }
}
