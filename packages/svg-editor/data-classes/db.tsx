import { Formatter } from '../config-classes/formatter';
import CircleIcon from '../icons/element/circle.svg';
import EllipseIcon from '../icons/element/ellipse.svg';
import GIcon from '../icons/element/g.svg';
import LineIcon from '../icons/element/line.svg';
import LinearGradientIcon from '../icons/element/linearGradient.svg';
import PathIcon from '../icons/element/path.svg';
import PolygonIcon from '../icons/element/polygon.svg';
import PolylineIcon from '../icons/element/polyline.svg';
import RadialGradientIcon from '../icons/element/radialGradient.svg';
import RectIcon from '../icons/element/rect.svg';
import StopIcon from '../icons/element/stop.svg';
import SvgIcon from '../icons/element/svg.svg';

import UnrecognizedXNodeIcon from '../icons/element/unrecognized.svg';

export enum AttributeType {
  NUMERIC,
  COLOR,
  LIST,
  PATHDATA,
  ENUM,
  TRANSFORM_LIST,
  ID,
  UNKNOWN
}
export enum PercentageHandling {
  FRACTION,
  HORIZONTAL,
  VERTICAL,
  NORMALIZED
}
export enum NumberRange {
  ARBITRARY,
  POSITIVE,
  UNIT
}

export const RECOGNIZED_ELEMENTS = [
  'svg',
  'g',
  'circle',
  'ellipse',
  'rect',
  'path',
  'line',
  'polyline',
  'polygon',
  'stop',
  'linearGradient',
  'radialGradient'
] as const;

export const ELEMENT_ICONS = {
  circle: CircleIcon,
  ellipse: EllipseIcon,
  rect: RectIcon,
  path: PathIcon,
  line: LineIcon,
  polygon: PolygonIcon,
  polyline: PolylineIcon,
  svg: SvgIcon,
  g: GIcon,
  linearGradient: LinearGradientIcon,
  radialGradient: RadialGradientIcon,
  stop: StopIcon
} as const;

export const UNRECOGNIZED_XNODE_ICON = UnrecognizedXNodeIcon;

export const RECOGNIZED_ATTRIBUTES = {
  // Dictionary{String: Array[String]}
  // TODO this is just propagated_attributes, but it ruins the const because of Godot bug.
  svg: [
    'xmlns',
    'width',
    'height',
    'viewBox',
    'fill',
    'fill-opacity',
    'stroke',
    'stroke-opacity',
    'stroke-width',
    'stroke-linecap',
    'stroke-linejoin'
  ],
  g: [
    'transform',
    'opacity',
    'fill',
    'fill-opacity',
    'stroke',
    'stroke-opacity',
    'stroke-width',
    'stroke-linecap',
    'stroke-linejoin'
  ],
  linearGradient: ['id', 'gradientTransform', 'gradientUnits', 'spreadMethod', 'x1', 'y1', 'x2', 'y2'],
  radialGradient: ['id', 'gradientTransform', 'gradientUnits', 'spreadMethod', 'cx', 'cy', 'r'],
  circle: ['transform', 'opacity', 'fill', 'fill-opacity', 'stroke', 'stroke-opacity', 'stroke-width', 'cx', 'cy', 'r'],
  ellipse: [
    'transform',
    'opacity',
    'fill',
    'fill-opacity',
    'stroke',
    'stroke-opacity',
    'stroke-width',
    'cx',
    'cy',
    'rx',
    'ry'
  ],
  rect: [
    'transform',
    'opacity',
    'fill',
    'fill-opacity',
    'stroke',
    'stroke-opacity',
    'stroke-width',
    'stroke-linejoin',
    'x',
    'y',
    'width',
    'height',
    'rx',
    'ry'
  ],
  path: [
    'transform',
    'opacity',
    'fill',
    'fill-opacity',
    'stroke',
    'stroke-opacity',
    'stroke-width',
    'stroke-linecap',
    'stroke-linejoin',
    'd'
  ],
  line: ['transform', 'opacity', 'stroke', 'stroke-opacity', 'stroke-width', 'stroke-linecap', 'x1', 'y1', 'x2', 'y2'],
  polygon: [
    'transform',
    'opacity',
    'fill',
    'fill-opacity',
    'stroke',
    'stroke-opacity',
    'stroke-width',
    'stroke-linecap',
    'stroke-linejoin',
    'points'
  ],
  polyline: [
    'transform',
    'opacity',
    'fill',
    'fill-opacity',
    'stroke',
    'stroke-opacity',
    'stroke-width',
    'stroke-linecap',
    'stroke-linejoin',
    'points'
  ],
  stop: ['offset', 'stop-color', 'stop-opacity']
} as const;

export type RecognizedAttribute = keyof typeof RECOGNIZED_ATTRIBUTES;

export const VALID_CHILDREN = {
  // Dictionary{String: Array[String]}
  svg: [
    'svg',
    'path',
    'circle',
    'ellipse',
    'rect',
    'line',
    'polygon',
    'polyline',
    'g',
    'linearGradient',
    'radialGradient'
  ],
  g: [
    'svg',
    'path',
    'circle',
    'ellipse',
    'rect',
    'line',
    'polygon',
    'polyline',
    'g',
    'linearGradient',
    'radialGradient'
  ],
  linearGradient: ['stop'],
  radialGradient: ['stop'],
  circle: [],
  ellipse: [],
  rect: [],
  path: [],
  line: [],
  polygon: [],
  polyline: [],
  stop: []
} as const;

export const PROPAGATED_ATTRIBUTES = [
  'fill',
  'fill-opacity',
  'stroke',
  'stroke-opacity',
  'stroke-width',
  'stroke-linecap',
  'stroke-linejoin'
] as const;

export type PropagatedAttribute = (typeof PROPAGATED_ATTRIBUTES)[number];

export const ATTRIBUTE_TYPES = {
  viewBox: AttributeType.LIST,
  width: AttributeType.NUMERIC,
  height: AttributeType.NUMERIC,
  x: AttributeType.NUMERIC,
  y: AttributeType.NUMERIC,
  x1: AttributeType.NUMERIC,
  y1: AttributeType.NUMERIC,
  x2: AttributeType.NUMERIC,
  y2: AttributeType.NUMERIC,
  cx: AttributeType.NUMERIC,
  cy: AttributeType.NUMERIC,
  r: AttributeType.NUMERIC,
  rx: AttributeType.NUMERIC,
  ry: AttributeType.NUMERIC,
  opacity: AttributeType.NUMERIC,
  fill: AttributeType.COLOR,
  'fill-opacity': AttributeType.NUMERIC,
  stroke: AttributeType.COLOR,
  'stroke-opacity': AttributeType.NUMERIC,
  'stroke-width': AttributeType.NUMERIC,
  'stroke-linecap': AttributeType.ENUM,
  'stroke-linejoin': AttributeType.ENUM,
  d: AttributeType.PATHDATA,
  points: AttributeType.LIST,
  transform: AttributeType.TRANSFORM_LIST,
  offset: AttributeType.NUMERIC,
  'stop-color': AttributeType.COLOR,
  'stop-opacity': AttributeType.NUMERIC,
  id: AttributeType.ID,
  gradientTransform: AttributeType.TRANSFORM_LIST,
  gradientUnits: AttributeType.ENUM,
  spreadMethod: AttributeType.ENUM
} as const;

export const ATTRIBUTE_ENUM_VALUES = {
  'stroke-linecap': ['butt', 'round', 'square'],
  'stroke-linejoin': ['miter', 'round', 'bevel'],
  gradientUnits: ['userSpaceOnUse', 'objectBoundingBox'],
  spreadMethod: ['pad', 'reflect', 'repeat']
} as const;

export const ATTRIBUTE_NUMBER_RANGE = {
  width: NumberRange.POSITIVE,
  height: NumberRange.POSITIVE,
  x: NumberRange.ARBITRARY,
  y: NumberRange.ARBITRARY,
  x1: NumberRange.ARBITRARY,
  y1: NumberRange.ARBITRARY,
  x2: NumberRange.ARBITRARY,
  y2: NumberRange.ARBITRARY,
  cx: NumberRange.ARBITRARY,
  cy: NumberRange.ARBITRARY,
  r: NumberRange.POSITIVE,
  rx: NumberRange.POSITIVE,
  ry: NumberRange.POSITIVE,
  opacity: NumberRange.UNIT,
  'fill-opacity': NumberRange.UNIT,
  'stroke-opacity': NumberRange.UNIT,
  'stroke-width': NumberRange.POSITIVE,
  offset: NumberRange.UNIT,
  'stop-opacity': NumberRange.UNIT
} as const;

export const ATTRIBUTE_COLOR_URL_ALLOWED = ['fill', 'stroke'];

type RecognizedAttributes = keyof typeof RECOGNIZED_ATTRIBUTES;
type ValidChildren = keyof typeof VALID_CHILDREN;

export function isAttributeRecognized(element_name: string, attribute_name: string): boolean {
  return RECOGNIZED_ATTRIBUTES[element_name as ValidChildren]?.includes(attribute_name as never);
}

export function isChildElementValid(parent_name: string, child_name: string): boolean {
  if (
    !RECOGNIZED_ELEMENTS.includes(parent_name as RecognizedAttributes) ||
    !RECOGNIZED_ELEMENTS.includes(child_name as ValidChildren)
  ) {
    return true;
  }
  return VALID_CHILDREN[parent_name as RecognizedAttributes]?.includes(child_name as never);
}

export function getValidParents(childName: string): string[] {
  const validParents: string[] = [];
  for (const [parentName, child] of Object.entries<string[]>(VALID_CHILDREN as unknown as Record<string, string[]>)) {
    if (child.includes(childName)) {
      validParents.push(parentName);
    }
  }
  return validParents;
}

type ElementIcons = keyof typeof ELEMENT_ICONS;

export function getElementIcon(element_name: string): string {
  return ELEMENT_ICONS[element_name as ElementIcons] ?? UNRECOGNIZED_XNODE_ICON;
}

// export function get_xnode_icon(xnode_type: BasicXNode.NodeType): string {
// 	return xnode_icons[xnode_type] if xnode_icons.has(xnode_type) else\
//     UNRECOGNIZED_XNODE_ICON
// }

export function getAttributeType(attribute_name: string): AttributeType {
  return ATTRIBUTE_TYPES[attribute_name as keyof typeof ATTRIBUTE_TYPES] ?? AttributeType.UNKNOWN;
}

export function getAttributeDefaultPercentageHandling(attribute_name: string): PercentageHandling {
  switch (attribute_name) {
    case 'width':
      return PercentageHandling.HORIZONTAL;
    case 'height':
      return PercentageHandling.VERTICAL;
    case 'x':
      return PercentageHandling.HORIZONTAL;
    case 'y':
      return PercentageHandling.VERTICAL;
    case 'rx':
      return PercentageHandling.HORIZONTAL;
    case 'ry':
      return PercentageHandling.VERTICAL;
    case 'stroke-width':
      return PercentageHandling.NORMALIZED;
    case 'x1':
      return PercentageHandling.HORIZONTAL;
    case 'y1':
      return PercentageHandling.VERTICAL;
    case 'x2':
      return PercentageHandling.HORIZONTAL;
    case 'y2':
      return PercentageHandling.VERTICAL;
    case 'cx':
      return PercentageHandling.HORIZONTAL;
    case 'cy':
      return PercentageHandling.VERTICAL;
    case 'r':
      return PercentageHandling.NORMALIZED;
    default:
      return PercentageHandling.FRACTION;
  }
}

// export function elementWithSetup(name: string, user_setup_value?: string): Element {
//   const new_element = element(name);
//   if (user_setup_value != null) {
//     new_element.user_setup(user_setup_value);
//   } else {
//     new_element.user_setup();
//   }
//   return new_element;
// }

// export function element(name: string): Element {
//   switch (name) {
//     case 'svg':
//       return ElementSVG.new();
//     case 'g':
//       return ElementG.new();
//     case 'circle':
//       return ElementCircle.new();
//     case 'ellipse':
//       return ElementEllipse.new();
//     case 'rect':
//       return ElementRect.new();
//     case 'path':
//       return ElementPath.new();
//     case 'line':
//       return ElementLine.new();
//     case 'polygon':
//       return ElementPolygon.new();
//     case 'polyline':
//       return ElementPolyline.new();
//     case 'linearGradient':
//       return ElementLinearGradient.new();
//     case 'radialGradient':
//       return ElementRadialGradient.new();
//     case 'stop':
//       return ElementStop.new();
//     default:
//       return ElementUnrecognized.new(name);
//   }
// }

export function attribute(name: string, formatter: Formatter, value: string): Attribute {
  switch (getAttributeType(name)) {
    case AttributeType.NUMERIC:
      return AttributeNumeric.new(name, formatter, value);
    case AttributeType.COLOR:
      return AttributeColor.new(name, formatter, value);
    case AttributeType.LIST:
      return AttributeList.new(name, formatter, value);
    case AttributeType.PATHDATA:
      return AttributePathdata.new(name, formatter, value);
    case AttributeType.ENUM:
      return AttributeEnum.new(name, formatter, value);
    case AttributeType.TRANSFORM_LIST:
      return AttributeTransformList.new(name, formatter, value);
    case AttributeType.ID:
      return AttributeID.new(name, formatter, value);
    default:
      return Attribute.new(name, formatter, value);
  }
}
