import { formatColor, type ColorFormat } from "./editor/colors";
import { formatTransformFunctions, parseTransformFunctions } from "./editor/transform-list";
import { formatPathData, formatPathNumber, tryParsePathData, type PathDataFormat } from "./path-data";
import { getAttributeType } from "./svg-db";
import { type SvgAttribute, type SvgElementNode, type SvgNode } from "./svg-model";

export type FormatterPreset = "compact" | "pretty";
export type FormattingStyle = "compact" | "pretty" | "spacious";
export type ShorthandTags = "always" | "all-except-containers" | "never";

export interface FormatterSettings {
  readonly preset: FormatterPreset;
  readonly removeComments: boolean;
  readonly trailingNewline: boolean;
  readonly shorthandTags: ShorthandTags;
  readonly shorthandSlashSpace: boolean;
  readonly formattingStyle: FormattingStyle;
  readonly indentWithSpaces: boolean;
  readonly indentationSpaces: number;
  /** Numeric attributes: `0.5` → `.5`. */
  readonly numberRemoveLeadingZero: boolean;
  /** Numeric attributes: `5000` → `5e3` and `0.0001` → `1e-4` when shorter. */
  readonly numberUseExponentIfShorter: boolean;
  /** Path data: `0.5` → `.5`. */
  readonly pathdataCompressNumbers: boolean;
  /** Path data: no spaces after command letters or before numbers that start with `-` or `.`. */
  readonly pathdataMinimizeSpacing: boolean;
  /** Path data: arc flags written without separators. */
  readonly pathdataRemoveSpacingAfterFlags: boolean;
  /** Path data: a command letter that repeats the previous one is omitted. */
  readonly pathdataRemoveConsecutiveCommands: boolean;
  /** Colors: when to write a keyword such as `red` instead of hex. */
  readonly colorUseNamedColors: ColorFormat["useNamedColors"];
  /** Colors: 3-digit hex when possible, always 6 digits, or `rgb()`. */
  readonly colorPrimarySyntax: ColorFormat["primarySyntax"];
  /** Colors: upper-case hex digits. */
  readonly colorCapitalHex: boolean;
  /** Transform lists: `0.5` → `.5`. */
  readonly transformListCompressNumbers: boolean;
  /** Transform lists: no spaces before numbers that start with `-` or `.`. */
  readonly transformListMinimizeSpacing: boolean;
  /** Transform lists: omit default parameters, such as `translate(5)` for `translate(5 0)`. */
  readonly transformListRemoveUnnecessaryParams: boolean;
}

/**
 * Formatter settings for a preset, with GodSVG's defaults: `pretty` for reading in the editor, `compact` for small
 * files. Comments are kept by both; removing them is the optimizer's job, as in GodSVG.
 */
export function formatterPreset(preset: FormatterPreset): FormatterSettings {
  const compact = preset === "compact";
  return {
    preset,
    removeComments: false,
    trailingNewline: false,
    shorthandTags: compact ? "always" : "all-except-containers",
    shorthandSlashSpace: !compact,
    formattingStyle: compact ? "compact" : "pretty",
    indentWithSpaces: false,
    indentationSpaces: 2,
    numberRemoveLeadingZero: compact,
    numberUseExponentIfShorter: compact,
    pathdataCompressNumbers: true,
    pathdataMinimizeSpacing: true,
    pathdataRemoveSpacingAfterFlags: compact,
    pathdataRemoveConsecutiveCommands: true,
    colorUseNamedColors: compact ? "when-shorter" : "always",
    colorPrimarySyntax: "three-or-six-digit-hex",
    colorCapitalHex: false,
    transformListCompressNumbers: compact,
    transformListMinimizeSpacing: compact,
    transformListRemoveUnnecessaryParams: compact
  };
}

/** Default editor formatter. */
export const prettyFormatter = formatterPreset("pretty");

/** Default export formatter, used when saving. */
export const compactFormatter = formatterPreset("compact");

const containerElements = new Set(["svg", "g", "linearGradient", "radialGradient"]);

export function serializeRoot(root: SvgElementNode, formatter: FormatterSettings): string {
  const markup = serializeNode(root, formatter, 0).trimEnd();
  return formatter.trailingNewline ? `${markup}\n` : markup;
}

function serializeNode(node: SvgNode, formatter: FormatterSettings, depth: number): string {
  switch (node.kind) {
    case "element":
      return serializeElement(node, formatter, depth);
    case "comment":
      if (formatter.removeComments) {
        return "";
      }

      return `${indent(formatter, depth)}<!--${escapeComment(node.text)}-->${lineBreak(formatter)}`;
    case "cdata":
      return `${indent(formatter, depth)}<![CDATA[${escapeCData(node.text)}]]>${lineBreak(formatter)}`;
    case "text":
      return `${indent(formatter, depth)}${escapeText(node.text)}${lineBreak(formatter)}`;
  }
}

function serializeElement(node: SvgElementNode, formatter: FormatterSettings, depth: number): string {
  const pretty = formatter.formattingStyle !== "compact";
  const startIndent = indent(formatter, depth);
  const attrs = serializeAttributes(node.attrs, formatter, depth);
  const canUseShorthand =
    node.children.length === 0 &&
    (formatter.shorthandTags === "always" ||
      (formatter.shorthandTags === "all-except-containers" && !containerElements.has(node.name)));
  const slash = formatter.shorthandSlashSpace ? " />" : "/>";

  if (canUseShorthand) {
    return `${startIndent}<${node.name}${attrs}${slash}${lineBreak(formatter)}`;
  }

  if (node.children.length === 0) {
    return `${startIndent}<${node.name}${attrs}></${node.name}>${lineBreak(formatter)}`;
  }

  const children = node.children.map((child) => serializeNode(child, formatter, depth + 1)).join("");

  if (!pretty) {
    return `${startIndent}<${node.name}${attrs}>${children}</${node.name}>${lineBreak(formatter)}`;
  }

  return `${startIndent}<${node.name}${attrs}>${lineBreak(formatter)}${children}${startIndent}</${node.name}>${lineBreak(formatter)}`;
}

function serializeAttributes(attrs: readonly SvgAttribute[], formatter: FormatterSettings, depth: number): string {
  if (attrs.length === 0) {
    return "";
  }

  if (formatter.formattingStyle === "spacious") {
    const attributeIndent = `\n${indent(formatter, depth + 1)}`;
    const closingIndent = `\n${indent(formatter, depth)}`;
    return `${attrs.map((attr) => `${attributeIndent}${serializeAttribute(attr, formatter)}`).join("")}${closingIndent}`;
  }

  return attrs.map((attr) => ` ${serializeAttribute(attr, formatter)}`).join("");
}

function serializeAttribute(attr: SvgAttribute, formatter: FormatterSettings): string {
  const value = escapeAttribute(formatAttributeValue(attr, formatter));

  // Single quotes keep values like `font-family='"Noto Sans"'` readable; a value with both quote kinds needs `&quot;`.
  if (value.includes('"') && !value.includes("'")) {
    return `${attr.name}='${value}'`;
  }

  return `${attr.name}="${value.replace(/"/g, "&quot;")}"`;
}

function indent(formatter: FormatterSettings, depth: number): string {
  if (formatter.formattingStyle === "compact") {
    return "";
  }

  const unit = formatter.indentWithSpaces ? " ".repeat(formatter.indentationSpaces) : "\t";
  return unit.repeat(depth);
}

function lineBreak(formatter: FormatterSettings): string {
  return formatter.formattingStyle === "compact" ? "" : "\n";
}

function escapeAttribute(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function escapeText(value: string): string {
  // `>` only needs escaping inside `]]>`, but escaping it everywhere is simpler and still valid.
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** XML forbids `--` inside comments and a `-` right before the closing `-->`, so those hyphens get spaces. */
function escapeComment(value: string): string {
  return value.replace(/-(?=-)/g, "- ").replace(/-$/, "- ");
}

/** Splits `]]>` across two CDATA sections, the only way to write it inside CDATA. */
function escapeCData(value: string): string {
  return value.replace(/]]>/g, "]]]]><![CDATA[>");
}

export function humanFileSize(byteCount: number): string {
  if (byteCount < 1024) {
    return `${byteCount} B`;
  }

  const units = ["KiB", "MiB", "GiB"] as const;
  let size = byteCount / 1024;
  let unitIndex = 0;

  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex += 1;
  }

  return `${size.toFixed(size >= 10 ? 1 : 2)} ${units[unitIndex]}`;
}

/**
 * Rewrites path data, plain numbers, colors, and transform lists with the formatter's options, as GodSVG re-emits
 * attributes. Values that do not parse completely (units, percentages, malformed data) are written unchanged.
 */
export function formatAttributeValue(attr: SvgAttribute, formatter: FormatterSettings): string {
  if (attr.name === "d") {
    const commands = tryParsePathData(attr.value);
    return commands ? formatPathData(commands, pathDataFormat(formatter)) : attr.value;
  }

  switch (getAttributeType(attr.name)) {
    case "numeric":
      return plainNumberPattern.test(attr.value) ? formatNumber(Number(attr.value), formatter) : attr.value;
    case "color":
      return formatColor(attr.value, {
        useNamedColors: formatter.colorUseNamedColors,
        primarySyntax: formatter.colorPrimarySyntax,
        capitalHex: formatter.colorCapitalHex
      });
    case "transform-list": {
      const functions = parseTransformFunctions(attr.value);
      return functions
        ? formatTransformFunctions(functions, {
            compressNumbers: formatter.transformListCompressNumbers,
            minimizeSpacing: formatter.transformListMinimizeSpacing,
            removeUnnecessaryParams: formatter.transformListRemoveUnnecessaryParams
          })
        : attr.value;
    }
    default:
      return attr.value;
  }
}

const plainNumberPattern = /^\s*[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?\s*$/;

function pathDataFormat(formatter: FormatterSettings): PathDataFormat {
  return {
    compressNumbers: formatter.pathdataCompressNumbers,
    minimizeSpacing: formatter.pathdataMinimizeSpacing,
    removeSpacingAfterFlags: formatter.pathdataRemoveSpacingAfterFlags,
    removeConsecutiveCommands: formatter.pathdataRemoveConsecutiveCommands
  };
}

/**
 * Formats a numeric attribute value with up to 6 decimals, then applies the formatter's leading-zero and exponent
 * options; the exponent form is used only when it is shorter.
 */
export function formatNumber(
  value: number,
  options: Pick<FormatterSettings, "numberRemoveLeadingZero" | "numberUseExponentIfShorter">
): string {
  const plain = formatPathNumber(value);
  const short = options.numberRemoveLeadingZero ? plain.replace(/^(-?)0\./, "$1.") : plain;

  if (!options.numberUseExponentIfShorter) {
    return short;
  }

  const exponent = exponentForm(plain);
  return exponent && exponent.length < short.length ? exponent : short;
}

/** `5000` → `5e3`, `-0.0012` → `-12e-4`; `undefined` when there are no zeros to fold. */
function exponentForm(text: string): string | undefined {
  const sign = text.startsWith("-") ? "-" : "";
  const digits = text.replace(/^-/, "");
  const trailingZeros = /^(\d*[1-9])(0+)$/.exec(digits);

  if (trailingZeros?.[1] && trailingZeros[2]) {
    return `${sign}${trailingZeros[1]}e${trailingZeros[2].length}`;
  }

  const fraction = /^0\.(0*)(\d+)$/.exec(digits);

  if (fraction?.[1] && fraction[2]) {
    return `${sign}${fraction[2]}e-${fraction[1].length + fraction[2].length}`;
  }

  return undefined;
}

