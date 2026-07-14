import {
  attributeNumberRange,
  attributeEnumValues,
  colorAttributesWithCurrentColorAllowed,
  colorAttributesWithNoneAllowed,
  colorAttributesWithUrlAllowed,
  defaultAttributeValues,
  defaultElements,
  getAttributeType,
  getRecognizedAttributes,
  iconForElement,
  propagatedAttributes,
  recognizedElements,
  validChildren
} from './coreSvgMetadata';
import TextElementIcon from '../../svg-db-icons/element/xmlnodeText.svg';
import { createElementNode, createTextNode } from '../../svg-model';
import type { SvgCapabilityContribution } from '../kernel';
import type { AttributeType, NumberRange } from '../svg-attribute-types';
import type { SvgResourceKind } from '../svg-document';
import { getCoreElementBoundsProvider } from './coreBoundsProviders';
import { getCoreElementHandleProvider } from './coreHandleProviders';

type CoreElementContribution = NonNullable<SvgCapabilityContribution['elements']>[number];
type CoreAttributeContribution = NonNullable<SvgCapabilityContribution['attributes']>[number];
type RecognizedElementName = (typeof recognizedElements)[number];

const coreAddableElements = [
  'path',
  'circle',
  'ellipse',
  'rect',
  'line',
  'polygon',
  'polyline',
  'g',
  'text',
  'linearGradient',
  'radialGradient',
  'stop'
] as const;

const coreAddableElementOrder: ReadonlyMap<string, number> = new Map(coreAddableElements.map((name, index) => [name, index]));

const coreStructureElementNames = ['svg', 'g'] as const satisfies readonly RecognizedElementName[];
const coreStructureOnlyElementNames = ['defs'] as const;
const coreShapeElementNames = [
  'circle',
  'ellipse',
  'rect',
  'path',
  'line',
  'polyline',
  'polygon'
] as const satisfies readonly RecognizedElementName[];
const coreGradientElementNames = ['linearGradient', 'radialGradient', 'stop'] as const satisfies readonly RecognizedElementName[];
const coreSymbolElementNames = ['symbol'] as const;
const coreSymbolUseElementNames = ['use'] as const satisfies readonly RecognizedElementName[];
const coreTextElementNames = ['text', 'tspan'] as const;
const coreImageElementNames = ['image'] as const;
const coreFilterElementNames = ['filter'] as const;
const coreMaskElementNames = ['clipPath', 'mask'] as const;
const coreMarkerElementNames = ['marker'] as const;
const corePatternElementNames = ['pattern'] as const;

const coreResourceElementKinds = {
  linearGradient: 'paint-server',
  radialGradient: 'paint-server',
  symbol: 'symbol',
  clipPath: 'clip-path',
  mask: 'mask',
  filter: 'filter',
  marker: 'marker',
  pattern: 'pattern'
} as const satisfies Record<string, SvgResourceKind>;

const coreResourceReferenceKinds = {
  fill: 'paint-server',
  stroke: 'paint-server',
  href: 'unknown',
  'xlink:href': 'unknown',
  'clip-path': 'clip-path',
  mask: 'mask',
  filter: 'filter',
  'marker-start': 'marker',
  'marker-mid': 'marker',
  'marker-end': 'marker'
} as const satisfies Record<string, SvgResourceKind>;

const coreResourceOnlyElements = [
  ...coreSymbolElementNames,
  ...coreMaskElementNames,
  ...coreFilterElementNames,
  ...coreMarkerElementNames,
  ...corePatternElementNames
] as const;
const coreTextAttributeTypes = {
  dx: 'numeric',
  dy: 'numeric',
  rotate: 'list',
  'font-family': 'unknown',
  'font-size': 'numeric',
  'font-weight': 'enum',
  'font-style': 'enum',
  'text-anchor': 'enum',
  'dominant-baseline': 'enum'
} as const satisfies Record<string, AttributeType>;
const coreTextAttributeDefaults = {
  dx: '0',
  dy: '0',
  rotate: '',
  'font-family': 'sans-serif',
  'font-size': '48',
  'font-weight': 'normal',
  'font-style': 'normal',
  'text-anchor': 'start',
  'dominant-baseline': 'auto'
} as const satisfies Record<keyof typeof coreTextAttributeTypes, string>;
const coreTextAttributeEnumValues = {
  'font-weight': ['normal', 'bold', 'lighter', 'bolder'],
  'font-style': ['normal', 'italic', 'oblique'],
  'text-anchor': ['start', 'middle', 'end'],
  'dominant-baseline': ['auto', 'middle', 'central', 'hanging', 'text-before-edge', 'text-after-edge']
} as const satisfies Partial<Record<keyof typeof coreTextAttributeTypes, readonly string[]>>;
const coreTextAttributeNumberRange = {
  'font-size': 'positive'
} as const satisfies Partial<Record<keyof typeof coreTextAttributeTypes, NumberRange>>;
const coreTextInheritedAttributeNames = [
  'font-family',
  'font-size',
  'font-weight',
  'font-style',
  'text-anchor',
  'dominant-baseline'
] as const satisfies readonly (keyof typeof coreTextAttributeTypes)[];
const coreInheritedAttributes = new Set<string>([...propagatedAttributes, ...coreTextInheritedAttributeNames]);

type CoreResourceElementName = keyof typeof coreResourceElementKinds;
type CoreStructuralElementName = (typeof coreStructureOnlyElementNames)[number];
type CoreTextElementName = (typeof coreTextElementNames)[number];
type CoreTextAttributeName = keyof typeof coreTextAttributeTypes;
type CoreAttributeName = keyof typeof defaultAttributeValues | keyof typeof coreResourceReferenceKinds | CoreTextAttributeName;

const coreStructureAttributeNames = ['xmlns', 'viewBox'] as const satisfies readonly CoreAttributeName[];
const coreGeometryAttributeNames = [
  'x',
  'y',
  'width',
  'height',
  'transform',
  'd',
  'points',
  'cx',
  'cy',
  'r',
  'rx',
  'ry',
  'x1',
  'y1',
  'x2',
  'y2',
  'fx',
  'fy'
] as const satisfies readonly CoreAttributeName[];
const corePresentationAttributeNames = [
  'opacity',
  'fill',
  'fill-opacity',
  'stroke',
  'stroke-opacity',
  'stroke-width',
  'stroke-linecap',
  'stroke-linejoin',
  'color'
] as const satisfies readonly CoreAttributeName[];
const coreGradientAttributeNames = [
  'gradientTransform',
  'gradientUnits',
  'spreadMethod',
  'offset',
  'stop-color',
  'stop-opacity'
] as const satisfies readonly CoreAttributeName[];
const coreSymbolAttributeNames = ['href', 'xlink:href'] as const satisfies readonly CoreAttributeName[];
const coreTextAttributeNames = [
  'dx',
  'dy',
  'rotate',
  'font-family',
  'font-size',
  'font-weight',
  'font-style',
  'text-anchor',
  'dominant-baseline'
] as const satisfies readonly CoreAttributeName[];
const coreTextElementAttributeNames = [
  'id',
  'x',
  'y',
  'dx',
  'dy',
  'rotate',
  'transform',
  'opacity',
  'fill',
  'fill-opacity',
  'stroke',
  'stroke-opacity',
  'stroke-width',
  'font-family',
  'font-size',
  'font-weight',
  'font-style',
  'text-anchor',
  'dominant-baseline'
] as const;
const coreImageElementAttributeNames = [
  'id',
  'x',
  'y',
  'width',
  'height',
  'href',
  'xlink:href',
  'transform',
  'opacity'
] as const;
const coreImageAttributeNames = [
  'x',
  'y',
  'width',
  'height',
  'href',
  'xlink:href',
  'transform',
  'opacity'
] as const satisfies readonly CoreAttributeName[];
const coreTspanElementAttributeNames = [
  'id',
  'x',
  'y',
  'dx',
  'dy',
  'rotate',
  'fill',
  'font-family',
  'font-size',
  'font-weight',
  'font-style',
  'text-anchor',
  'dominant-baseline'
] as const;
const coreTextElementDefaults = {
  x: '120',
  y: '160',
  fill: 'black',
  'font-size': '48'
} as const satisfies Record<string, string>;
const coreFilterAttributeNames = ['filter'] as const satisfies readonly CoreAttributeName[];
const coreMaskAttributeNames = ['clip-path', 'mask'] as const satisfies readonly CoreAttributeName[];
const coreMarkerAttributeNames = ['marker-start', 'marker-mid', 'marker-end'] as const satisfies readonly CoreAttributeName[];

export const coreSvgStructureContribution = {
  id: 'core.svg.structure',
  elements: [
    ...coreStructureElementNames.map(createRecognizedElementContribution),
    ...coreStructureOnlyElementNames.map(createStructuralElementContribution)
  ],
  attributes: coreStructureAttributeNames.map(createCoreAttributeContribution)
} satisfies SvgCapabilityContribution;

export const coreSvgShapeContribution = {
  id: 'core.svg.shapes',
  elements: coreShapeElementNames.map(createRecognizedElementContribution),
  attributes: coreGeometryAttributeNames.map(createCoreAttributeContribution)
} satisfies SvgCapabilityContribution;

export const coreSvgGradientContribution = {
  id: 'core.svg.gradients',
  elements: coreGradientElementNames.map(createRecognizedElementContribution),
  attributes: coreGradientAttributeNames.map(createCoreAttributeContribution)
} satisfies SvgCapabilityContribution;

export const coreSvgTextContribution = {
  id: 'core.svg.text',
  elements: coreTextElementNames.map(createTextElementContribution),
  attributes: coreTextAttributeNames.map(createCoreAttributeContribution)
} satisfies SvgCapabilityContribution;

export const coreSvgImageContribution = {
  id: 'core.svg.images',
  elements: coreImageElementNames.map(createImageElementContribution),
  attributes: coreImageAttributeNames.map(createCoreAttributeContribution)
} satisfies SvgCapabilityContribution;

export const coreSvgSymbolContribution = {
  id: 'core.svg.symbols',
  elements: [
    ...coreSymbolElementNames.map(createResourceOnlyElementContribution),
    ...coreSymbolUseElementNames.map(createRecognizedElementContribution)
  ],
  attributes: coreSymbolAttributeNames.map(createCoreAttributeContribution)
} satisfies SvgCapabilityContribution;

export const coreSvgFilterContribution = {
  id: 'core.svg.filters',
  elements: coreFilterElementNames.map(createResourceOnlyElementContribution),
  attributes: coreFilterAttributeNames.map(createCoreAttributeContribution)
} satisfies SvgCapabilityContribution;

export const coreSvgMaskContribution = {
  id: 'core.svg.masks',
  elements: coreMaskElementNames.map(createResourceOnlyElementContribution),
  attributes: coreMaskAttributeNames.map(createCoreAttributeContribution)
} satisfies SvgCapabilityContribution;

export const coreSvgMarkerContribution = {
  id: 'core.svg.markers',
  elements: coreMarkerElementNames.map(createResourceOnlyElementContribution),
  attributes: coreMarkerAttributeNames.map(createCoreAttributeContribution)
} satisfies SvgCapabilityContribution;

export const coreSvgPatternContribution = {
  id: 'core.svg.patterns',
  elements: corePatternElementNames.map(createResourceOnlyElementContribution)
} satisfies SvgCapabilityContribution;

export const coreSvgPresentationContribution = {
  id: 'core.svg.presentation',
  attributes: corePresentationAttributeNames.map(createCoreAttributeContribution)
} satisfies SvgCapabilityContribution;

export const coreSvgCapabilityContributions: readonly SvgCapabilityContribution[] = [
  coreSvgStructureContribution,
  coreSvgShapeContribution,
  coreSvgGradientContribution,
  coreSvgTextContribution,
  coreSvgImageContribution,
  coreSvgSymbolContribution,
  coreSvgFilterContribution,
  coreSvgMaskContribution,
  coreSvgMarkerContribution,
  coreSvgPatternContribution,
  coreSvgPresentationContribution
];

export const coreSvgCapabilityContribution = {
  id: 'core.svg',
  elements: coreSvgCapabilityContributions.flatMap((contribution) => contribution.elements ?? []),
  attributes: coreSvgCapabilityContributions.flatMap((contribution) => contribution.attributes ?? [])
} satisfies SvgCapabilityContribution;

function createRecognizedElementContribution(
  name: (typeof recognizedElements)[number]
): CoreElementContribution {
  const addableOrder = coreAddableElementOrder.get(name);
  const resourceKind = resourceKindForElement(name);
  const createHandles = getCoreElementHandleProvider(name);
  const getBounds = getCoreElementBoundsProvider(name);

  return {
    name,
    defaults: defaultElements[name],
    allowedChildren: allowedChildrenForRecognizedElement(name),
    attributes: getRecognizedAttributes(name),
    icon: iconForElement(name),
    addable: addableOrder !== undefined,
    ...(addableOrder !== undefined ? { addableOrder } : {}),
    ...(resourceKind ? { resourceKind } : {}),
    ...(createHandles ? { createHandles } : {}),
    ...(getBounds ? { getBounds } : {})
  };
}

function createStructuralElementContribution(
  name: CoreStructuralElementName
): CoreElementContribution {
  return {
    name,
    defaults: {},
    attributes: ['id']
  };
}

function createResourceOnlyElementContribution(
  name: CoreResourceElementName
): CoreElementContribution {
  return {
    name,
    defaults: {},
    attributes: ['id'],
    resourceKind: coreResourceElementKinds[name]
  };
}

function createTextElementContribution(name: CoreTextElementName): CoreElementContribution {
  const addableOrder = coreAddableElementOrder.get(name);

  return {
    name,
    defaults: textElementDefaults(name),
    allowedChildren: ['tspan'],
    attributes: textElementAttributes(name),
    icon: TextElementIcon,
    addable: addableOrder !== undefined,
    ...(addableOrder !== undefined ? { addableOrder } : {}),
    ...(name === 'text' ? { createNode: createDefaultTextElement } : {})
  };
}

function createImageElementContribution(name: (typeof coreImageElementNames)[number]): CoreElementContribution {
  const getBounds = getCoreElementBoundsProvider(name);

  return {
    name,
    defaults: {
      x: '0',
      y: '0',
      width: '0',
      height: '0'
    },
    allowedChildren: [],
    attributes: coreImageElementAttributeNames,
    ...(getBounds ? { getBounds } : {})
  };
}

function allowedChildrenForRecognizedElement(name: (typeof recognizedElements)[number]): readonly string[] {
  if (name !== 'svg' && name !== 'g') {
    return validChildren[name];
  }

  return [...new Set([...validChildren[name], ...coreStructureOnlyElementNames, ...coreResourceOnlyElements, 'text'])];
}

function textElementAttributes(name: CoreTextElementName): readonly string[] {
  return name === 'text' ? coreTextElementAttributeNames : coreTspanElementAttributeNames;
}

function textElementDefaults(name: CoreTextElementName): Readonly<Record<string, string>> {
  return name === 'text' ? coreTextElementDefaults : {};
}

function createDefaultTextElement() {
  return createElementNode(
    'text',
    Object.entries(coreTextElementDefaults).map(([name, value]) => ({ name, value })),
    [createTextNode('Text')]
  );
}

function createCoreAttributeContribution(name: CoreAttributeName): CoreAttributeContribution {
  const numberRange = numberRangeForAttribute(name);
  const resourceReferenceKind = resourceReferenceKindForAttribute(name);

  return {
    name,
    type: typeForAttribute(name),
    defaultValue: defaultValueForAttribute(name),
    ...(numberRange ? { numberRange } : {}),
    enumValues: enumValuesForAttribute(name),
    color: {
      allowNone: includesString(colorAttributesWithNoneAllowed, name),
      allowUrl: includesString(colorAttributesWithUrlAllowed, name),
      allowCurrentColor: includesString(colorAttributesWithCurrentColorAllowed, name)
    },
    ...(resourceReferenceKind ? { resourceReferenceKind } : {}),
    ...(coreInheritedAttributes.has(name) ? { inherits: true } : {})
  };
}

function defaultValueForAttribute(name: string): string {
  const textDefaults: Record<string, string> = coreTextAttributeDefaults;
  const defaults: Record<string, string> = defaultAttributeValues;
  return textDefaults[name] ?? defaults[name] ?? '';
}

function typeForAttribute(name: string): AttributeType {
  const textTypes: Record<string, AttributeType> = coreTextAttributeTypes;
  return textTypes[name] ?? getAttributeType(name);
}

function resourceKindForElement(name: string): SvgResourceKind | undefined {
  const kinds: Record<string, SvgResourceKind> = coreResourceElementKinds;
  return kinds[name];
}

function resourceReferenceKindForAttribute(name: string): SvgResourceKind | undefined {
  const kinds: Record<string, SvgResourceKind> = coreResourceReferenceKinds;
  return kinds[name];
}

function enumValuesForAttribute(name: string): readonly string[] {
  const textValues: Record<string, readonly string[]> = coreTextAttributeEnumValues;
  const values: Record<string, readonly string[]> = attributeEnumValues;
  return textValues[name] ?? values[name] ?? [];
}

function numberRangeForAttribute(name: string): NonNullable<SvgCapabilityContribution['attributes']>[number]['numberRange'] {
  const textRanges: Record<string, NumberRange> = coreTextAttributeNumberRange;
  const ranges: Record<string, (typeof attributeNumberRange)[keyof typeof attributeNumberRange]> = attributeNumberRange;
  return textRanges[name] ?? ranges[name];
}

function includesString(values: readonly string[], value: string): boolean {
  return values.some((item) => item === value);
}
