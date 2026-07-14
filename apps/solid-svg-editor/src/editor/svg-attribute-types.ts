export type SvgAttributeType =
  | "numeric"
  | "color"
  | "list"
  | "pathdata"
  | "enum"
  | "transform-list"
  | "id"
  | "href"
  | "unknown";

export type SvgNumberRange = "arbitrary" | "positive" | "unit";

export type AttributeType = SvgAttributeType;
export type NumberRange = SvgNumberRange;
