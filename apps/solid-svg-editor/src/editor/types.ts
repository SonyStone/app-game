import type { FormatterSettings } from "../formatter";
import type { Matrix2D, Rect } from "./geometry";
import type { SvgElementNode, SvgNode } from "../svg-model";

export type PanelId = "inspector" | "code" | "previews" | "debug";
export type ModalId = "settings" | "export" | "about" | "donate" | "shortcuts" | undefined;
export type ThemePreset = "dark" | "light" | "black" | "gray";
export type ExportFormat = "svg" | "png" | "jpeg" | "webp";
export type DragSelectionMode = "intersect" | "contain";
export type TransformBoxHandleKind = "nw" | "n" | "ne" | "e" | "se" | "s" | "sw" | "w" | "rotate";

export interface EditorTab {
  readonly id: string;
  readonly name: string;
  readonly root: SvgElementNode;
  readonly code: string;
  readonly dirty: boolean;
  readonly parseError: string | undefined;
}

export interface HistoryState {
  readonly past: SvgElementNode[];
  readonly future: SvgElementNode[];
}

export interface ShortcutItem {
  readonly category: string;
  readonly action: string;
  readonly keys: string;
}

export interface OptimizerSettings {
  readonly removeComments: boolean;
  readonly convertShapes: boolean;
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
  readonly palettes: readonly string[];
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
  readonly update: (root: SvgElementNode, x: number, y: number) => SvgElementNode;
}

export interface ContextMenuState {
  readonly x: number;
  readonly y: number;
  readonly nodeId: string;
}

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
  readonly startRoot: SvgElementNode;
  readonly startBox: Rect;
  readonly startAngle: number;
}

export interface ActiveMoveSelectionDrag {
  readonly type: "move-selection";
  readonly pointerId: number;
  readonly selectedIds: readonly string[];
  readonly startRoot: SvgElementNode;
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
