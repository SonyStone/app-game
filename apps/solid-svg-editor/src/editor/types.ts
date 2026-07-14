import type { FormatterSettings } from "../formatter";
import type { Matrix2D, Rect } from "./geometry";
import type { SvgDocument } from "./svg-document";
import type { SvgElementNode, SvgNode } from "../svg-model";
import type { EditorCommand, EditorCommandDurability, EditorCommandId } from "./commands";
import type { EditorOperation } from "./operations";
import type { SelectionTarget } from "./selection-targets";

export type CorePanelId = "inspector" | "code" | "previews" | "debug";
export type PanelId = CorePanelId | (string & {});
export type CoreModalId = "settings" | "export" | "about" | "donate" | "shortcuts" | "command-palette";
export type ModalId = CoreModalId | (string & {}) | undefined;
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
  readonly beforeRoot: SvgElementNode;
  readonly afterRoot: SvgElementNode;
  /** @deprecated Use beforeRoot, afterRoot, operations, or inverseOperations for history replay. */
  readonly root: SvgElementNode;
  readonly commandId: EditorCommandId | undefined;
  readonly label: string | undefined;
  readonly durability?: EditorCommandDurability;
  readonly mergeKey?: string;
  readonly operations?: readonly EditorOperation[];
  readonly inverseOperations?: readonly EditorOperation[];
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
  readonly disabledExtensionPackageIds: readonly string[];
  readonly appliedExtensionPackageMigrationKeys: readonly string[];
  readonly appliedExtensionPackageUpdateKeys: readonly string[];
}

export interface ViewRect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

interface HandleDescriptorBase {
  readonly id: string;
  readonly nodeId: string;
  readonly x: number;
  readonly y: number;
  readonly label: string;
  readonly small: boolean;
  readonly active?: boolean;
  readonly selectionTargets?: readonly SelectionTarget[];
}

export interface CommandHandleDescriptor extends HandleDescriptorBase {
  readonly commandMode: "command";
  readonly createCommand: (x: number, y: number) => EditorCommand;
  readonly update?: never;
}

export interface LegacyHandleDescriptor extends HandleDescriptorBase {
  readonly commandMode?: "legacy";
  readonly update: (root: SvgElementNode, x: number, y: number) => SvgElementNode;
  readonly createCommand?: never;
}

export type HandleDescriptor = CommandHandleDescriptor | LegacyHandleDescriptor;

export interface ContextMenuState {
  readonly x: number;
  readonly y: number;
  readonly nodeId: string;
  readonly target: SelectionTarget;
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
  readonly initialSelectionTargets: readonly SelectionTarget[];
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
