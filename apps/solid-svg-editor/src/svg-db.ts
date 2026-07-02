import CircleElementIcon from "./svg-db-icons/element/circle.svg";
import EllipseElementIcon from "./svg-db-icons/element/ellipse.svg";
import GElementIcon from "./svg-db-icons/element/g.svg";
import LineElementIcon from "./svg-db-icons/element/line.svg";
import LinearGradientElementIcon from "./svg-db-icons/element/linearGradient.svg";
import PathElementIcon from "./svg-db-icons/element/path.svg";
import PolygonElementIcon from "./svg-db-icons/element/polygon.svg";
import PolylineElementIcon from "./svg-db-icons/element/polyline.svg";
import RadialGradientElementIcon from "./svg-db-icons/element/radialGradient.svg";
import RectElementIcon from "./svg-db-icons/element/rect.svg";
import StopElementIcon from "./svg-db-icons/element/stop.svg";
import SvgElementIcon from "./svg-db-icons/element/svg.svg";
import UnrecognizedElementIcon from "./svg-db-icons/element/unrecognized.svg";
import UseElementIcon from "./svg-db-icons/element/use.svg";
import CdataNodeIcon from "./svg-db-icons/element/xmlnodeCDATA.svg";
import CommentNodeIcon from "./svg-db-icons/element/xmlnodeComment.svg";
import TextNodeIcon from "./svg-db-icons/element/xmlnodeText.svg";
import type { SvgIcon } from "./editor/svg-icon";

export const recognizedElements = [
  "svg",
  "g",
  "circle",
  "ellipse",
  "rect",
  "path",
  "line",
  "polyline",
  "polygon",
  "stop",
  "linearGradient",
  "radialGradient",
  "use"
] as const;

export type RecognizedElement = (typeof recognizedElements)[number];

const elementIcons = {
  svg: SvgElementIcon,
  g: GElementIcon,
  circle: CircleElementIcon,
  ellipse: EllipseElementIcon,
  rect: RectElementIcon,
  path: PathElementIcon,
  line: LineElementIcon,
  polyline: PolylineElementIcon,
  polygon: PolygonElementIcon,
  stop: StopElementIcon,
  linearGradient: LinearGradientElementIcon,
  radialGradient: RadialGradientElementIcon,
  use: UseElementIcon
} as const satisfies Record<RecognizedElement, SvgIcon>;

export type AttributeType =
  | "numeric"
  | "color"
  | "list"
  | "pathdata"
  | "enum"
  | "transform-list"
  | "id"
  | "href"
  | "unknown";

export type NumberRange = "arbitrary" | "positive" | "unit";

export const recognizedAttributes = {
  svg: [
    "xmlns",
    "x",
    "y",
    "width",
    "height",
    "viewBox",
    "fill",
    "fill-opacity",
    "stroke",
    "stroke-opacity",
    "stroke-width",
    "stroke-linecap",
    "stroke-linejoin",
    "color"
  ],
  g: [
    "transform",
    "opacity",
    "fill",
    "fill-opacity",
    "stroke",
    "stroke-opacity",
    "stroke-width",
    "stroke-linecap",
    "stroke-linejoin"
  ],
  linearGradient: ["id", "gradientTransform", "gradientUnits", "spreadMethod", "x1", "y1", "x2", "y2"],
  radialGradient: ["id", "gradientTransform", "gradientUnits", "spreadMethod", "cx", "cy", "r", "fx", "fy"],
  circle: ["transform", "opacity", "fill", "fill-opacity", "stroke", "stroke-opacity", "stroke-width", "cx", "cy", "r"],
  ellipse: [
    "transform",
    "opacity",
    "fill",
    "fill-opacity",
    "stroke",
    "stroke-opacity",
    "stroke-width",
    "cx",
    "cy",
    "rx",
    "ry"
  ],
  rect: [
    "transform",
    "opacity",
    "fill",
    "fill-opacity",
    "stroke",
    "stroke-opacity",
    "stroke-width",
    "stroke-linejoin",
    "x",
    "y",
    "width",
    "height",
    "rx",
    "ry"
  ],
  path: [
    "transform",
    "opacity",
    "fill",
    "fill-opacity",
    "stroke",
    "stroke-opacity",
    "stroke-width",
    "stroke-linecap",
    "stroke-linejoin",
    "d"
  ],
  line: ["transform", "opacity", "stroke", "stroke-opacity", "stroke-width", "stroke-linecap", "x1", "y1", "x2", "y2"],
  polygon: [
    "transform",
    "opacity",
    "fill",
    "fill-opacity",
    "stroke",
    "stroke-opacity",
    "stroke-width",
    "stroke-linejoin",
    "points"
  ],
  polyline: [
    "transform",
    "opacity",
    "fill",
    "fill-opacity",
    "stroke",
    "stroke-opacity",
    "stroke-width",
    "stroke-linecap",
    "stroke-linejoin",
    "points"
  ],
  stop: ["offset", "stop-color", "stop-opacity"],
  use: ["href", "transform", "x", "y"]
} as const satisfies Record<RecognizedElement, readonly string[]>;

export const validChildren = {
  svg: ["svg", "path", "circle", "ellipse", "rect", "line", "polygon", "polyline", "g", "linearGradient", "radialGradient", "use"],
  g: ["svg", "path", "circle", "ellipse", "rect", "line", "polygon", "polyline", "g", "linearGradient", "radialGradient", "use"],
  linearGradient: ["stop"],
  radialGradient: ["stop"],
  circle: [],
  ellipse: [],
  rect: [],
  path: [],
  line: [],
  polygon: [],
  polyline: [],
  stop: [],
  use: []
} as const satisfies Record<RecognizedElement, readonly RecognizedElement[]>;

export const propagatedAttributes = [
  "fill",
  "fill-opacity",
  "stroke",
  "stroke-opacity",
  "stroke-width",
  "stroke-linecap",
  "stroke-linejoin",
  "color"
] as const;

const attributeTypes = {
  viewBox: "list",
  width: "numeric",
  height: "numeric",
  x: "numeric",
  y: "numeric",
  x1: "numeric",
  y1: "numeric",
  x2: "numeric",
  y2: "numeric",
  cx: "numeric",
  cy: "numeric",
  r: "numeric",
  rx: "numeric",
  ry: "numeric",
  fx: "numeric",
  fy: "numeric",
  opacity: "numeric",
  fill: "color",
  "fill-opacity": "numeric",
  stroke: "color",
  "stroke-opacity": "numeric",
  "stroke-width": "numeric",
  "stroke-linecap": "enum",
  "stroke-linejoin": "enum",
  color: "color",
  d: "pathdata",
  points: "list",
  transform: "transform-list",
  offset: "numeric",
  "stop-color": "color",
  "stop-opacity": "numeric",
  id: "id",
  gradientTransform: "transform-list",
  gradientUnits: "enum",
  spreadMethod: "enum",
  href: "href"
} as const satisfies Record<string, AttributeType>;

export const attributeEnumValues = {
  "stroke-linecap": ["butt", "round", "square"],
  "stroke-linejoin": ["miter", "round", "bevel"],
  gradientUnits: ["userSpaceOnUse", "objectBoundingBox"],
  spreadMethod: ["pad", "reflect", "repeat"]
} as const satisfies Record<string, readonly string[]>;

export const attributeNumberRange = {
  width: "positive",
  height: "positive",
  x: "arbitrary",
  y: "arbitrary",
  x1: "arbitrary",
  y1: "arbitrary",
  x2: "arbitrary",
  y2: "arbitrary",
  cx: "arbitrary",
  cy: "arbitrary",
  r: "positive",
  rx: "positive",
  ry: "positive",
  fx: "arbitrary",
  fy: "arbitrary",
  opacity: "unit",
  "fill-opacity": "unit",
  "stroke-opacity": "unit",
  "stroke-width": "positive",
  offset: "unit",
  "stop-opacity": "unit"
} as const satisfies Record<string, NumberRange>;

export const colorAttributesWithNoneAllowed = ["fill", "stroke"] as const;
export const colorAttributesWithUrlAllowed = ["fill", "stroke"] as const;
export const colorAttributesWithCurrentColorAllowed = ["fill", "stroke", "stop-color"] as const;

export const defaultAttributeValues = {
  xmlns: "http://www.w3.org/2000/svg",
  x: "0",
  y: "0",
  width: "900",
  height: "900",
  viewBox: "0 0 900 900",
  opacity: "1",
  fill: "black",
  "fill-opacity": "1",
  stroke: "none",
  "stroke-opacity": "1",
  "stroke-width": "1",
  "stroke-linecap": "butt",
  "stroke-linejoin": "miter",
  color: "black",
  transform: "",
  gradientTransform: "",
  d: "",
  points: "",
  cx: "450",
  cy: "450",
  r: "120",
  rx: "160",
  ry: "100",
  x1: "250",
  y1: "250",
  x2: "650",
  y2: "650",
  fx: "450",
  fy: "450",
  offset: "0",
  "stop-color": "black",
  "stop-opacity": "1",
  gradientUnits: "objectBoundingBox",
  spreadMethod: "pad",
  href: ""
} as const satisfies Record<string, string>;

export const defaultElements = {
  svg: {
    xmlns: "http://www.w3.org/2000/svg",
    width: "900",
    height: "900",
    viewBox: "0 0 900 900"
  },
  g: {},
  circle: { cx: "450", cy: "450", r: "96", fill: "white", stroke: "black", "stroke-width": "8" },
  ellipse: { cx: "450", cy: "450", rx: "150", ry: "90", fill: "white", stroke: "black", "stroke-width": "8" },
  rect: { x: "300", y: "300", width: "300", height: "220", rx: "24", fill: "white", stroke: "black", "stroke-width": "8" },
  path: { d: "M 260 520 C 340 300 560 300 640 520", fill: "none", stroke: "black", "stroke-width": "12", "stroke-linecap": "round" },
  line: { x1: "260", y1: "450", x2: "640", y2: "450", stroke: "black", "stroke-width": "10", "stroke-linecap": "round" },
  polyline: { points: "260 540 360 360 480 520 610 340", fill: "none", stroke: "black", "stroke-width": "10" },
  polygon: { points: "450 250 610 550 290 550", fill: "white", stroke: "black", "stroke-width": "8" },
  linearGradient: { id: "linearGradient1", x1: "0%", y1: "0%", x2: "100%", y2: "0%" },
  radialGradient: { id: "radialGradient1", cx: "50%", cy: "50%", r: "50%" },
  stop: { offset: "0", "stop-color": "white", "stop-opacity": "1" },
  use: { href: "", x: "0", y: "0" }
} as const satisfies Record<RecognizedElement, Record<string, string>>;

export function isRecognizedElement(name: string): name is RecognizedElement {
  return (recognizedElements as readonly string[]).includes(name);
}

export function getAttributeType(name: string): AttributeType {
  const types: Record<string, AttributeType> = attributeTypes;
  return types[name] ?? "unknown";
}

export function getRecognizedAttributes(name: string): readonly string[] {
  return isRecognizedElement(name) ? recognizedAttributes[name] : [];
}

export function isAttributeRecognized(elementName: string, attributeName: string): boolean {
  return getRecognizedAttributes(elementName).includes(attributeName);
}

export function isValidChild(parentName: string, childName: string): boolean {
  if (!isRecognizedElement(parentName) || !isRecognizedElement(childName)) {
    return true;
  }

  return (validChildren[parentName] as readonly string[]).includes(childName);
}

export function getAttributeDefault(attributeName: string): string {
  const defaults: Record<string, string> = defaultAttributeValues;
  return defaults[attributeName] ?? "";
}

export function iconForElement(name: string): SvgIcon {
  if (isRecognizedElement(name)) {
    return elementIcons[name];
  }

  return UnrecognizedElementIcon;
}

export function iconForNode(kind: "text" | "comment" | "cdata"): SvgIcon {
  switch (kind) {
    case "text":
      return TextNodeIcon;
    case "comment":
      return CommentNodeIcon;
    case "cdata":
      return CdataNodeIcon;
  }
}
