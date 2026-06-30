import type { FormatterSettings } from "../formatter";
import type { SvgElementNode, SvgNode } from "../svg-model";

export type PanelId = "inspector" | "code" | "previews" | "debug";
export type ModalId = "settings" | "export" | "about" | "donate" | "shortcuts" | undefined;
export type ThemePreset = "dark" | "light" | "black" | "gray";
export type ExportFormat = "svg" | "png" | "jpeg" | "webp";

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

export interface ActiveDrag {
  readonly type: "pan" | "handle";
  readonly pointerId: number;
  readonly startClientX: number;
  readonly startClientY: number;
  readonly startCenterX: number;
  readonly startCenterY: number;
  readonly handle?: HandleDescriptor;
}

export interface InspectorRow {
  readonly node: SvgNode;
  readonly depth: number;
}

export interface VirtualInspectorRow extends InspectorRow {
  readonly index: number;
  readonly top: number;
}
