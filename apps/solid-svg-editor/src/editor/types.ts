import type { ColorPalette } from './palettes';
import type { FormatterSettings } from "../formatter";
import type { Matrix2D, Point, Rect } from "./geometry";
import type { SvgDocument } from "./svg-document";
import type { SvgElementNode, SvgNode } from "../svg-model";
import type { EditorCommandId } from "./commands";

export type PanelId = "inspector" | "code" | "previews" | "debug";
export type ModalId = "settings" | "export" | "about" | "donate" | "shortcuts" | "close-tab" | undefined;
export type ThemePreset = "dark" | "light" | "black" | "gray";
export type ExportFormat = "svg" | "png" | "jpeg" | "webp";
export type DragSelectionMode = "intersect" | "contain";
export type TransformBoxHandleKind = "nw" | "n" | "ne" | "e" | "se" | "s" | "sw" | "w" | "rotate";

export interface EditorTab {
  readonly id: string;
  readonly name: string;
  readonly document: SvgDocument;
  readonly code: string;
  readonly dirty: boolean;
  readonly parseError: string | undefined;
}

export interface HistoryEntry {
  readonly root: SvgElementNode;
  readonly commandId: EditorCommandId | undefined;
  readonly label: string | undefined;
}

export interface HistoryState {
  readonly past: HistoryEntry[];
  readonly future: HistoryEntry[];
}

export interface ShortcutItem {
  readonly category: string;
  readonly action: string;
  readonly keys: string;
}

/** A key with modifiers; `ctrl` also matches Cmd on macOS. */
export interface ShortcutBinding {
  readonly key: string;
  readonly ctrl?: boolean;
  readonly shift?: boolean;
  readonly alt?: boolean;
}

export interface OptimizerSettings {
  readonly removeComments: boolean;
  readonly convertShapes: boolean;
  /** "Simplify paths": rewrite path commands as the shortest exact command types, like GodSVG. */
  readonly simplifyPathParameters: boolean;
}

export interface AppSettings {
  readonly themePreset: ThemePreset;
  readonly baseColor: string;
  readonly accentColor: string;
  readonly canvasColor: string;
  readonly gridColor: string;
  readonly showGrid: boolean;
  readonly showHandles: boolean;
  readonly viewRasterized: boolean;
  readonly snapEnabled: boolean;
  readonly snapSize: number;
  readonly formatter: FormatterSettings;
  readonly exportFormatter: FormatterSettings;
  readonly optimizer: OptimizerSettings;
  /** User-edited shortcut bindings by action id; actions not listed use their defaults. */
  readonly shortcutOverrides: Readonly<Record<string, readonly ShortcutBinding[]>>;
  /** Pixel sizes of the icon previews (GodSVG default: 16, 24, 32, 48, 64). */
  readonly previewSizes: readonly number[];
  /** Named color palettes listed in the color picker. */
  readonly palettes: readonly ColorPalette[];
  readonly tabMiddleClickClose: boolean;
  readonly useCtrlForZoom: boolean;
  readonly rasterPreviewDuringInteraction: boolean;
  readonly dragSelectionMode: DragSelectionMode;
}

export interface ViewRect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface HandleDescriptor {
  readonly id: string;
  readonly nodeId: string;
  readonly x: number;
  readonly y: number;
  readonly label: string;
  readonly small: boolean;
  /** The path command or polygon/polyline point this handle moves; absent for whole-shape handles. */
  readonly commandIndex?: number;
  readonly update: (root: SvgElementNode, x: number, y: number) => SvgElementNode;
}

/** The element menu opened on a node, or GodSVG's "New shape" menu opened on an empty canvas point. */
export type ContextMenuState = { readonly x: number; readonly y: number } & (
  | { readonly kind: "node"; readonly nodeId: string }
  | { readonly kind: "canvas"; readonly point: Point }
  | { readonly kind: "commands"; readonly nodeId: string }
);

export interface ActivePanDrag {
  readonly type: "pan";
  readonly pointerId: number;
  readonly startWorldX: number;
  readonly startWorldY: number;
}

export interface ActiveHandleDrag {
  readonly type: "handle";
  readonly pointerId: number;
  readonly handle: HandleDescriptor;
}

export interface ActiveCanvasRotateDrag {
  readonly type: "rotate-canvas";
  readonly pointerId: number;
  readonly startAngle: number;
  readonly startRotation: number;
}

export interface ActiveMarqueeDrag {
  readonly type: "marquee";
  readonly pointerId: number;
  readonly startClientX: number;
  readonly startClientY: number;
  readonly currentClientX: number;
  readonly currentClientY: number;
  readonly mode: DragSelectionMode;
  readonly additive: boolean;
  readonly initialSelection: readonly string[];
}

export interface ActiveTransformBoxDrag {
  readonly type: "transform-box";
  readonly pointerId: number;
  readonly handleKind: TransformBoxHandleKind;
  readonly selectedIds: readonly string[];
  readonly startBox: Rect;
  readonly startAngle: number;
}

export interface ActiveMoveSelectionDrag {
  readonly type: "move-selection";
  readonly pointerId: number;
  readonly selectedIds: readonly string[];
  readonly startClientX: number;
  readonly startClientY: number;
  readonly startWorldX: number;
  readonly startWorldY: number;
  readonly committed: boolean;
}

export type ActiveDrag = ActivePanDrag | ActiveHandleDrag | ActiveCanvasRotateDrag | ActiveMarqueeDrag | ActiveTransformBoxDrag | ActiveMoveSelectionDrag;

export interface TransformBoxHandleDescriptor {
  readonly kind: TransformBoxHandleKind;
  readonly x: number;
  readonly y: number;
  readonly label: string;
}

export interface ParentTransformEntry {
  readonly nodeId: string;
  readonly parentTransform: Matrix2D;
}

export interface InspectorRow {
  readonly node: SvgNode;
  readonly depth: number;
}

export interface VirtualInspectorRow extends InspectorRow {
  readonly index: number;
  readonly top: number;
}
