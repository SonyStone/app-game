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
}

export const prettyFormatter = {
  preset: "pretty",
  removeComments: false,
  trailingNewline: false,
  shorthandTags: "all-except-containers",
  shorthandSlashSpace: true,
  formattingStyle: "pretty",
  indentWithSpaces: false,
  indentationSpaces: 2
} as const satisfies FormatterSettings;

export const compactFormatter = {
  preset: "compact",
  removeComments: true,
  trailingNewline: false,
  shorthandTags: "always",
  shorthandSlashSpace: false,
  formattingStyle: "compact",
  indentWithSpaces: false,
  indentationSpaces: 2
} as const satisfies FormatterSettings;

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

      return `${indent(formatter, depth)}<!--${node.text}-->${lineBreak(formatter)}`;
    case "cdata":
      return `${indent(formatter, depth)}<![CDATA[${node.text}]]>${lineBreak(formatter)}`;
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
    return `${attrs.map((attr) => `${attributeIndent}${serializeAttribute(attr)}`).join("")}${closingIndent}`;
  }

  return attrs.map((attr) => ` ${serializeAttribute(attr)}`).join("");
}

function serializeAttribute(attr: SvgAttribute): string {
  const value = escapeAttribute(attr.value);
  const quote = value.includes('"') ? "'" : '"';
  return `${attr.name}=${quote}${value}${quote}`;
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
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;");
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
