import type { PointerStateWithActive } from '@solid-primitives/pointer';
import type { Accessor, JSX, Setter } from 'solid-js';

import type { FormatterSettings } from '../formatter';
import type { Point, Rect } from './geometry';
import type { SvgElementNode, SvgNode, SvgNodeId } from '../svg-model';
import type { SvgCapabilityRegistry } from './capabilities';
import type {
  CommandHistoryPolicy,
  CommandTransaction,
  EditorCommand,
  EditorCommandEvent,
  EditorCommandId
} from './commands';
import type { EditorOperation } from './operations';
import type { PathAnchorSelection, SelectionTarget } from './selection-targets';
import type { AttributeType, NumberRange } from './svg-attribute-types';
import type { SvgIcon } from './svg-icon';
import type { SvgDocument, SvgResourceIndex, SvgResourceKind } from './svg-document';
import type { SvgResourceGraph } from './svg-resource-graph';
import type { SvgSpatialIndex } from './svg-spatial-index';
import type {
  AppSettings,
  ContextMenuState,
  DragSelectionMode,
  EditorTab,
  HandleDescriptor,
  ModalId,
  PanelId,
  ShortcutItem,
  TransformBoxHandleDescriptor,
  ViewRect
} from './types';

export type EditorUnsubscribe = () => void;

export interface EditorEventSource<TEvent> {
  readonly listen: (listener: (event: TEvent) => void) => EditorUnsubscribe | void;
}

export interface DocumentService {
  readonly tabs: Accessor<readonly EditorTab[]>;
  readonly activeTabId: Accessor<string>;
  readonly setActiveTabId: (tabId: string) => void;
  readonly activeTab: Accessor<EditorTab | undefined>;
  readonly activeDocument: Accessor<SvgDocument>;
  readonly activeRoot: Accessor<SvgElementNode>;
  readonly activeSpatialIndex: Accessor<SvgSpatialIndex>;
  readonly activeCode: Accessor<string>;
  readonly exportText: Accessor<string>;
  readonly elementCount: Accessor<number>;
  readonly applyCode: (text: string) => void;
  readonly reformatActiveCode: (formatter?: FormatterSettings) => void;
  readonly createNewTab: () => void;
  readonly closeTab: (tabId: string) => void;
  readonly importSvgText: (text: string, name: string) => void;
  readonly markActiveTabClean: () => void;
}

export interface CommandService {
  readonly canUndo: Accessor<boolean>;
  readonly canRedo: Accessor<boolean>;
  readonly recentEvent: Accessor<EditorCommandEvent | undefined>;
  readonly events: EditorEventSource<EditorCommandEvent>;
  readonly dispatch: (command: EditorCommand, history?: CommandHistoryPolicy) => void;
  readonly beginTransaction: () => CommandTransaction | undefined;
  readonly updateTransaction: (command: EditorCommand) => void;
  readonly commitTransaction: () => void;
  readonly cancelTransaction: () => void;
  readonly undo: () => void;
  readonly redo: () => void;
}

export interface SelectionService {
  readonly selectedIds: Accessor<readonly string[]>;
  readonly selectedTargets: Accessor<readonly SelectionTarget[]>;
  readonly selectedPathAnchor: Accessor<PathAnchorSelection | undefined>;
  readonly selectedNodes: Accessor<readonly SvgNode[]>;
  readonly selectNode: (nodeId: string, event?: MouseEvent | PointerEvent) => void;
  readonly selectTarget: (target: SelectionTarget, event?: MouseEvent | PointerEvent) => void;
  readonly setSelectedIds: (ids: readonly string[]) => void;
  readonly setSelectedTargets: (targets: readonly SelectionTarget[]) => void;
  readonly clearSelection: () => void;
  readonly selectAll: () => void;
}

export interface SettingsStore {
  readonly settings: Accessor<AppSettings>;
  readonly setSettings: Setter<AppSettings>;
}

export interface SettingsService extends SettingsStore {
  readonly disabledExtensionPackageIds: Accessor<readonly string[]>;
  readonly appliedExtensionPackageMigrationKeys: Accessor<readonly string[]>;
  readonly appliedExtensionPackageUpdateKeys: Accessor<readonly string[]>;
  readonly setExtensionPackageEnabled: (packageId: string, enabled: boolean) => void;
  readonly setExtensionPackageMigrationsApplied: (
    packageId: string,
    migrationIds: readonly string[],
    applied: boolean
  ) => void;
  readonly setExtensionPackageUpdateApplied: (packageId: string, version: string, applied: boolean) => void;
}

export interface ViewportService {
  readonly zoom: Accessor<number>;
  readonly viewRect: Accessor<ViewRect>;
  readonly handles: Accessor<readonly HandleDescriptor[]>;
  readonly zoomBy: (factor: number, origin?: { readonly x: number; readonly y: number }) => void;
  readonly centerFrame: () => void;
  readonly host?: ViewportHostService;
  readonly layers?: ViewportLayerService;
  readonly overlays?: ViewportOverlayService;
}

export interface ViewportHostService {
  readonly setViewportShell: (element: HTMLDivElement) => void;
  readonly setCanvasSvg: (element: SVGSVGElement) => void;
  readonly viewportTransform: Accessor<string>;
  readonly onCanvasWheel: (event: WheelEvent) => void;
  readonly onCanvasPointerDown: (event: PointerEvent) => void;
}

export interface ViewportOverlayService {
  readonly zoom: Accessor<number>;
  readonly handles: Accessor<readonly HandleDescriptor[]>;
  readonly selectionBox: Accessor<Rect | undefined>;
  readonly marqueeRect: Accessor<Rect | undefined>;
  readonly startHandleDrag: (event: PointerEvent, handle: HandleDescriptor) => void;
  readonly startTransformBoxDrag: (event: PointerEvent, handle: TransformBoxHandleDescriptor) => void;
}

export interface ViewportDocumentSize {
  readonly width: number;
  readonly height: number;
  readonly viewBox: readonly [number, number, number, number];
}

export interface ViewportLayerService {
  readonly settings: Accessor<AppSettings>;
  readonly zoom: Accessor<number>;
  readonly viewRect: Accessor<ViewRect>;
  readonly gridViewRect: Accessor<ViewRect>;
  readonly rootSize: Accessor<ViewportDocumentSize>;
  readonly root: Accessor<SvgElementNode>;
  readonly selectedIds: Accessor<readonly string[]>;
  readonly selectedTargets: Accessor<readonly SelectionTarget[]>;
  readonly viewportIsMoving: Accessor<boolean>;
  readonly referenceImage: Accessor<string | undefined>;
  readonly showReference: Accessor<boolean>;
  readonly overlayReference: Accessor<boolean>;
  readonly useRasterPreview: Accessor<boolean>;
  readonly rasterPreviewUrl: Accessor<string | undefined>;
  readonly rasterPreviewRect: Accessor<ViewRect>;
  readonly nodeRenderer: Accessor<SvgNodeRendererAdapter | undefined>;
  readonly onNodePointerDown: (id: string, event: PointerEvent) => void;
  readonly onSelectionTargetPointerDown: (target: SelectionTarget, event: PointerEvent) => void;
  readonly openContextMenu: (event: MouseEvent, nodeId: string) => void;
  readonly openSelectionTargetContextMenu: (event: MouseEvent, target: SelectionTarget) => void;
}

export interface FullscreenService {
  readonly isFullscreen: Accessor<boolean>;
  readonly toggle: () => void;
}

export interface ReferenceImageService {
  readonly image: Accessor<string | undefined>;
  readonly show: Accessor<boolean>;
  readonly setShow: (show: boolean) => void;
  readonly overlay: Accessor<boolean>;
  readonly setOverlay: (overlay: boolean) => void;
  readonly setInputRef: (element: HTMLInputElement) => void;
  readonly openDialog: () => void;
  readonly onFile: (event: Event) => void;
  readonly clear: () => void;
}

export interface SvgImportService {
  readonly dropActive: Accessor<boolean>;
  readonly setInputRef: (element: HTMLInputElement) => void;
  readonly openDialog: () => void;
  readonly onFile: (event: Event) => void | Promise<void>;
  readonly onDragEnter: (event: DragEvent) => void;
  readonly onDragOver: (event: DragEvent) => void;
  readonly onDragLeave: (event: DragEvent) => void;
  readonly onDrop: (event: DragEvent) => void | Promise<void>;
}

export interface SidebarResizeService {
  readonly width: Accessor<number>;
  readonly onPointerDown: (event: PointerEvent) => void;
  readonly onPointerMove: (event: PointerEvent) => void;
  readonly onPointerUp: (event: PointerEvent) => void;
}

export interface WorkbenchService {
  readonly activePanel: Accessor<PanelId>;
  readonly setActivePanel: (panel: PanelId) => void;
  readonly sidebar: SidebarResizeService;
}

export interface ContextMenuService {
  readonly active: Accessor<ContextMenuState | undefined>;
  readonly open: (event: MouseEvent, target: string | SelectionTarget) => void;
  readonly close: () => void;
}

export interface ModalService {
  readonly active: Accessor<ModalId>;
  readonly open: (modal: Exclude<ModalId, undefined>) => void;
  readonly close: () => void;
}

export interface SelectionBoxMeasureRequest {
  readonly rootId: string;
  readonly selectedIds: readonly string[];
  readonly selectedTargets: readonly SelectionTarget[];
  readonly useRasterPreview: boolean;
  readonly clientToSvgPoint: (clientX: number, clientY: number, snapToGrid?: boolean) => Point;
}

export interface ViewportRendererAdapter {
  readonly measureSelectionBox: (request: SelectionBoxMeasureRequest) => Rect | undefined;
  readonly hitTestMarqueeTargets: (rect: Rect, mode: DragSelectionMode) => readonly SelectionTarget[];
  readonly selectionTargetFromEventTarget: (target: EventTarget | null) => SelectionTarget | undefined;
  readonly clientRectToViewportOverlay: (rect: Rect) => Rect;
  readonly viewportClientRect: () => DOMRectReadOnly | undefined;
}

export interface RenderingService {
  readonly svgNodeRenderer: SvgNodeRendererAdapter | undefined;
  readonly viewportRenderer: ViewportRendererAdapter | undefined;
}

export interface ResourceService {
  readonly activeResources: Accessor<SvgResourceIndex>;
  readonly activeResourceGraph: Accessor<SvgResourceGraph>;
  readonly resolveNode: (nodeId: string) => SvgNode | undefined;
}

export interface CapabilityService {
  readonly svg: SvgCapabilityRegistry;
}

export interface InputStateService {
  readonly heldKeys: Accessor<readonly string[]>;
  readonly viewportPointer: Accessor<PointerStateWithActive>;
}

export interface AppHostService {
  readonly setRootRef: (element: HTMLDivElement) => void;
  readonly className: Accessor<string>;
  readonly themeVars: Accessor<JSX.CSSProperties>;
}

export interface UiService {
  readonly appHost?: AppHostService;
  readonly contextMenu?: ContextMenuService;
  readonly svgImport?: SvgImportService;
  readonly downloadSvg?: () => void;
  readonly copySvgText?: () => void | Promise<void>;
  readonly modal?: ModalService;
  readonly workbench?: WorkbenchService;
  readonly fullscreen?: FullscreenService;
  readonly referenceImage?: ReferenceImageService;
}

export interface EditorContributionContext {
  readonly documents: DocumentService;
  readonly selection: SelectionService;
  readonly commands: CommandService;
  readonly settings: SettingsService;
  readonly viewport: ViewportService;
  readonly resources: ResourceService;
  readonly capabilities: CapabilityService;
  readonly rendering: RenderingService;
  readonly input: InputStateService;
  readonly ui: UiService;
  readonly registries: EditorRegistries<never>;
}

interface CommandContributionBase {
  readonly id: EditorCommandId;
  readonly label: string;
  readonly isEnabled?: (kernel: EditorContributionContext) => boolean;
}

export type CommandContributionDurability =
  | {
      readonly kind: 'operation';
    }
  | {
      readonly kind: 'legacy';
      readonly reason: string;
    };

export interface OperationCommandContribution extends CommandContributionBase {
  readonly durability: { readonly kind: 'operation' };
  readonly createOperations: (kernel: EditorContributionContext) => readonly EditorOperation[];
  readonly mergeKey?: string | ((kernel: EditorContributionContext) => string | undefined);
  readonly createCommand?: never;
}

export interface LegacyCommandContribution extends CommandContributionBase {
  readonly durability: { readonly kind: 'legacy'; readonly reason: string };
  readonly createCommand: (kernel: EditorContributionContext) => EditorCommand;
  readonly createOperations?: never;
  readonly mergeKey?: never;
}

export type CommandContribution = OperationCommandContribution | LegacyCommandContribution;

interface ActionContributionBase {
  readonly id: EditorCommandId;
  readonly label: string;
  readonly isEnabled?: (kernel: EditorContributionContext) => boolean;
}

export type ActionContribution =
  | (ActionContributionBase & {
      readonly kind?: 'callback';
      readonly run: (kernel: EditorContributionContext) => void;
    })
  | (ActionContributionBase & {
      readonly kind: 'modal';
      readonly modalId: Exclude<ModalId, undefined>;
    })
  | (ActionContributionBase & {
      readonly kind: 'command';
      readonly commandId: EditorCommandId;
    });

export interface ToolContribution {
  readonly id: string;
  readonly label: string;
  readonly priority: number;
}

export interface PanelContribution<TContext = EditorKernel> {
  readonly id: PanelId | (string & {});
  readonly label: string;
  readonly icon?: SvgIcon;
  readonly order?: number;
  readonly render: (context: TContext) => JSX.Element;
}

export type ModalRenderContext<TContext = EditorKernel> = TContext & {
  readonly close: () => void;
};

export interface ModalContribution<TContext = EditorKernel> {
  readonly id: Exclude<ModalId, undefined>;
  readonly render: (context: ModalRenderContext<TContext>) => JSX.Element;
}

export interface SettingsSectionContribution<TContext = EditorKernel> {
  readonly id: string;
  readonly label: string;
  readonly order?: number;
  readonly render: (context: TContext) => JSX.Element;
}

export type ViewportToolbarPlacement = 'left' | 'right' | (string & {});

export interface ViewportToolbarContribution<TContext = EditorKernel> {
  readonly id: string;
  readonly placement?: ViewportToolbarPlacement;
  readonly order?: number;
  readonly render: (context: TContext) => JSX.Element;
}

export type ViewportOverlayPlacement = 'svg-world' | 'html' | (string & {});

export interface ViewportOverlayRenderContext<TContext = EditorKernel> {
  readonly context: TContext;
  readonly overlays: ViewportOverlayService;
}

export interface ViewportOverlayContribution<TContext = EditorKernel> {
  readonly id: string;
  readonly placement: ViewportOverlayPlacement;
  readonly order?: number;
  readonly render: (context: ViewportOverlayRenderContext<TContext>) => JSX.Element;
}

export type ViewportLayerPlacement = 'svg-viewport' | 'svg-world' | (string & {});

export interface ViewportLayerRenderContext<TContext = EditorKernel> {
  readonly context: TContext;
  readonly layers: ViewportLayerService;
}

export interface ViewportLayerContribution<TContext = EditorKernel> {
  readonly id: string;
  readonly placement: ViewportLayerPlacement;
  readonly order?: number;
  readonly render: (context: ViewportLayerRenderContext<TContext>) => JSX.Element;
}

export type AppMenuSlot =
  | 'topbar.primary'
  | 'topbar.tabs'
  | 'topbar.file'
  | 'topbar.more'
  | (string & {});

export type AppMenuPresentation = 'menu-item' | 'icon-button' | 'text-button' | 'status-button';

interface AppMenuItemContributionBase {
  readonly id: string;
  readonly slot: AppMenuSlot;
  readonly label?: string;
  readonly icon?: SvgIcon;
  readonly order?: number;
  readonly presentation?: AppMenuPresentation;
  readonly testId?: string;
  readonly isVisible?: (context: EditorContributionContext) => boolean;
}

export type AppMenuItemContribution =
  | (AppMenuItemContributionBase & {
      readonly kind: 'action';
      readonly actionId: EditorCommandId;
      readonly labelFor?: (context: EditorContributionContext) => string;
      readonly isEnabled?: (context: EditorContributionContext) => boolean;
    })
  | (AppMenuItemContributionBase & {
      readonly kind: 'registered-command';
      readonly commandId: EditorCommandId;
      readonly labelFor?: (context: EditorContributionContext) => string;
      readonly isEnabled?: (context: EditorContributionContext) => boolean;
    })
  | (AppMenuItemContributionBase & {
      readonly kind: 'link';
      readonly label: string;
      readonly href: string;
      readonly target?: string;
      readonly rel?: string;
    });

export interface ContextMenuContributionContext extends EditorContributionContext {
  readonly nodeId: string;
  readonly target: SelectionTarget;
}

interface ContextMenuItemContributionBase {
  readonly id: string;
  readonly label: string;
  readonly icon?: SvgIcon;
  readonly order?: number;
  readonly isVisible?: (context: ContextMenuContributionContext) => boolean;
  readonly isEnabled?: (context: ContextMenuContributionContext) => boolean;
}

export type ContextMenuItemContribution =
  | (ContextMenuItemContributionBase & {
      readonly kind: 'action';
      readonly actionId: EditorCommandId;
    })
  | (ContextMenuItemContributionBase & {
      readonly kind: 'registered-command';
      readonly commandId: EditorCommandId;
    })
  | (ContextMenuItemContributionBase & {
      readonly kind: 'command';
      readonly commandId: EditorCommandId;
      readonly createOperations: (context: ContextMenuContributionContext) => readonly EditorOperation[];
      readonly mergeKey?: string | ((context: ContextMenuContributionContext) => string | undefined);
    })
  | (ContextMenuItemContributionBase & {
      readonly kind?: 'custom';
      readonly run: (context: ContextMenuContributionContext) => void;
    });

export interface ShortcutBinding {
  readonly key: string;
  readonly ctrl?: boolean;
  readonly shift?: boolean;
  readonly alt?: boolean;
}

export type ShortcutTarget =
  | {
      readonly kind: 'action';
      readonly id: EditorCommandId;
    }
  | {
      readonly kind: 'command';
      readonly id: EditorCommandId;
    }
  | {
      readonly kind: 'handler';
      readonly id: EditorCommandId;
    };

export interface ShortcutContribution extends ShortcutItem {
  readonly id: EditorCommandId;
  readonly target: ShortcutTarget;
  readonly bindings: readonly ShortcutBinding[];
  readonly allowInEditable?: boolean;
}

export interface SvgCapabilityContribution {
  readonly id: string;
  readonly elements?: readonly SvgElementContribution[];
  readonly attributes?: readonly SvgAttributeContribution[];
}

export interface SvgElementContribution {
  readonly name: string;
  readonly defaults: Readonly<Record<string, string>>;
  readonly allowedChildren?: readonly string[];
  readonly attributes: readonly string[];
  readonly icon?: SvgIcon;
  readonly addable?: boolean;
  readonly addableOrder?: number;
  readonly resourceKind?: SvgResourceKind;
  readonly createNode?: () => SvgElementNode;
  readonly createHandles?: (context: SvgHandleContext) => readonly HandleDescriptor[];
  readonly getBounds?: (context: SvgBoundsContext) => Rect | undefined;
  readonly validate?: (node: SvgElementNode, document: SvgDocument) => readonly SvgDiagnostic[];
}

export interface SvgAttributeContribution {
  readonly name: string;
  readonly type?: AttributeType;
  readonly defaultValue?: string;
  readonly numberRange?: NumberRange;
  readonly enumValues?: readonly string[];
  readonly color?: SvgColorAttributeContribution;
  readonly resourceReferenceKind?: SvgResourceKind;
  readonly inherits?: boolean;
  readonly control?: (context: SvgAttributeControlContext) => JSX.Element;
}

export interface SvgColorAttributeContribution {
  readonly allowNone?: boolean;
  readonly allowUrl?: boolean;
  readonly allowCurrentColor?: boolean;
}

export interface SvgHandleContext {
  readonly root: SvgElementNode;
  readonly node: SvgElementNode;
}

export interface SvgBoundsContext {
  readonly root: SvgElementNode;
  readonly node: SvgElementNode;
}

export interface SvgAttributeControlContext {
  readonly root: SvgElementNode;
  readonly node: SvgElementNode;
  readonly name: string;
  readonly value: string;
  readonly capabilities: SvgCapabilityRegistry;
  readonly dispatchCommand: (command: EditorCommand) => void;
  readonly selectTarget: (target: SelectionTarget, event?: MouseEvent | PointerEvent) => void;
  readonly update: (value: string) => void;
}

export interface SvgNodeRenderProps {
  readonly node: SvgNode;
  readonly selectedIds: readonly string[];
  readonly selectedTargets: readonly SelectionTarget[];
  readonly onNodePointerDown: (id: string, event: PointerEvent) => void;
  readonly onSelectionTargetPointerDown: (target: SelectionTarget, event: PointerEvent) => void;
  readonly openContextMenu: (event: MouseEvent, nodeId: string) => void;
  readonly openSelectionTargetContextMenu: (event: MouseEvent, target: SelectionTarget) => void;
  readonly renderer?: SvgNodeRendererAdapter;
}

export interface SvgNodeRendererAdapter {
  readonly renderNode: (props: SvgNodeRenderProps) => JSX.Element;
}

export type SvgDiagnosticSeverity = 'info' | 'warning' | 'error';

interface SvgDiagnosticBase {
  readonly severity: SvgDiagnosticSeverity;
  readonly nodeId: SvgNodeId;
  readonly message: string;
  readonly source?: string;
}

export type SvgDiagnostic =
  | (SvgDiagnosticBase & {
      readonly kind: 'unsupported-element';
      readonly elementName: string;
    })
  | (SvgDiagnosticBase & {
      readonly kind: 'unknown-attribute';
      readonly elementName: string;
      readonly attributeName: string;
    })
  | (SvgDiagnosticBase & {
      readonly kind: 'invalid-child';
      readonly parentNodeId: SvgNodeId;
      readonly parentName: string;
      readonly childName: string;
    })
  | (SvgDiagnosticBase & {
      readonly kind: 'duplicate-id';
      readonly duplicateId: string;
      readonly firstNodeId: SvgNodeId;
    })
  | (SvgDiagnosticBase & {
      readonly kind: 'broken-resource-reference';
      readonly attributeName: string;
      readonly targetId: string;
      readonly referenceKind: SvgResourceKind;
    })
  | (SvgDiagnosticBase & {
      readonly kind: `contribution.${string}`;
      readonly data?: Readonly<Record<string, unknown>>;
    });

export interface RendererContribution {
  readonly id: string;
  readonly label: string;
  readonly createSvgNodeRenderer?: () => SvgNodeRendererAdapter;
  readonly createViewportRenderer?: (base: ViewportRendererAdapter) => ViewportRendererAdapter;
}

export interface EditorExtensionPackageManifest {
  readonly id: string;
  readonly name: string;
  readonly version: string;
  readonly editorApiVersion: number;
  readonly dependencies?: readonly EditorExtensionPackageDependency[];
  readonly migrations?: readonly EditorExtensionPackageMigration[];
  readonly description?: string;
  readonly homepage?: string;
}

export interface EditorExtensionPackageDependency {
  readonly id: string;
  readonly version?: string;
}

export interface EditorExtensionPackageMigration {
  readonly id: string;
  readonly fromEditorApiVersion: number;
  readonly toEditorApiVersion: number;
  readonly description: string;
}

export interface EditorInstalledPackage {
  readonly manifest: EditorExtensionPackageManifest;
  readonly contributionIds: readonly string[];
}

export type EditorExtensionPackageDisabledReason =
  | {
      readonly kind: 'host-disabled';
    }
  | {
      readonly kind: 'disabled-package-dependency';
      readonly dependencyId: string;
    };

export type EditorExtensionPackageActivation =
  | {
      readonly status: 'active';
    }
  | {
      readonly status: 'disabled';
      readonly reason: EditorExtensionPackageDisabledReason;
    }
  | {
      readonly status: 'blocked';
      readonly issues: readonly EditorRegistryIssue[];
    };

export interface EditorInstalledPackageState {
  readonly installedPackage: EditorInstalledPackage;
  readonly activation: EditorExtensionPackageActivation;
}

export interface EditorInstalledPackageDependencyGraphEntry {
  readonly packageId: string;
  readonly dependencyIds: readonly string[];
  readonly dependentIds: readonly string[];
}

export type EditorExtensionPackageCompatibilityStatus = 'compatible' | 'migrated' | 'needs-migration' | 'incompatible';

export interface EditorInstalledPackageCompatibility {
  readonly packageId: string;
  readonly status: EditorExtensionPackageCompatibilityStatus;
  readonly editorApiVersion: number;
  readonly currentEditorApiVersion: number;
  readonly migrationIds: readonly string[];
  readonly message: string;
}

export interface EditorAvailablePackageUpdate {
  readonly packageId: string;
  readonly version: string;
  readonly editorApiVersion: number;
  readonly migrationIds?: readonly string[];
  readonly notes?: string;
  readonly url?: string;
}

export type EditorInstalledPackageUpdateStatus = 'ready' | 'needs-migration' | 'incompatible';

export interface EditorInstalledPackageUpdate {
  readonly packageId: string;
  readonly installedVersion: string;
  readonly availableVersion: string;
  readonly editorApiVersion: number;
  readonly currentEditorApiVersion: number;
  readonly status: EditorInstalledPackageUpdateStatus;
  readonly migrationIds: readonly string[];
  readonly message: string;
  readonly notes: string | undefined;
  readonly url: string | undefined;
}

export type EditorContributionSource =
  | {
      readonly kind: 'direct';
      readonly contributionId: string;
    }
  | {
      readonly kind: 'core';
      readonly contributionId: string;
    }
  | {
      readonly kind: 'raw';
      readonly contributionId: string;
    }
  | {
      readonly kind: 'package';
      readonly contributionId: string;
      readonly packageId: string;
    };

export type EditorRegistryHealthStatus = 'ready' | 'warning' | 'error';

export interface EditorRegistryHealth {
  readonly status: EditorRegistryHealthStatus;
  readonly packageCount: number;
  readonly activePackageCount: number;
  readonly disabledPackageCount: number;
  readonly blockedPackageCount: number;
  readonly contributionCount: number;
  readonly issueCount: number;
  readonly errorCount: number;
  readonly warningCount: number;
}

export type EditorRegistryName =
  | 'actions'
  | 'commands'
  | 'tools'
  | 'panels'
  | 'viewportToolbars'
  | 'viewportOverlays'
  | 'viewportLayers'
  | 'shortcuts'
  | 'appMenus'
  | 'modals'
  | 'settingsSections'
  | 'contextMenus'
  | 'svg'
  | 'renderers';

export type EditorRegistryIssue =
  | {
      readonly kind: 'duplicate-package-id';
      readonly id: string;
      readonly count: number;
    }
  | {
      readonly kind: 'invalid-package';
      readonly id: string;
      readonly message: string;
    }
  | {
      readonly kind: 'missing-package-dependency';
      readonly id: string;
      readonly dependencyId: string;
      readonly dependencyVersion?: string;
    }
  | {
      readonly kind: 'incompatible-package-dependency';
      readonly id: string;
      readonly dependencyId: string;
      readonly requiredVersion: string;
      readonly installedVersions: readonly string[];
    }
  | {
      readonly kind: 'blocked-package-dependency';
      readonly id: string;
      readonly dependencyId: string;
      readonly dependencyIssueCount: number;
    }
  | {
      readonly kind: 'cyclic-package-dependency';
      readonly id: string;
      readonly cycleIds: readonly string[];
    }
  | {
      readonly kind: 'package-api-migration-required';
      readonly id: string;
      readonly editorApiVersion: number;
      readonly currentEditorApiVersion: number;
      readonly migrationIds: readonly string[];
    }
  | {
      readonly kind: 'incompatible-package-api';
      readonly id: string;
      readonly editorApiVersion: number;
      readonly currentEditorApiVersion: number;
      readonly reason: 'older-api' | 'newer-api';
    }
  | {
      readonly kind: 'package-update-available';
      readonly id: string;
      readonly installedVersion: string;
      readonly availableVersion: string;
      readonly updateStatus: Exclude<EditorInstalledPackageUpdateStatus, 'incompatible'>;
      readonly migrationIds: readonly string[];
    }
  | {
      readonly kind: 'incompatible-package-update';
      readonly id: string;
      readonly installedVersion: string;
      readonly availableVersion: string;
      readonly editorApiVersion: number;
      readonly currentEditorApiVersion: number;
      readonly reason: 'older-api' | 'newer-api';
    }
  | {
      readonly kind: 'duplicate-contribution-id';
      readonly id: string;
      readonly count: number;
    }
  | {
      readonly kind: 'duplicate-registry-id';
      readonly registry: EditorRegistryName;
      readonly id: string;
      readonly contributionIds: readonly string[];
    }
  | {
      readonly kind: 'missing-registry-reference';
      readonly registry: EditorRegistryName;
      readonly id: string;
      readonly contributionId: string;
      readonly referencedRegistry: EditorRegistryName;
      readonly referencedId: string;
    }
  | {
      readonly kind: 'invalid-registry-item';
      readonly registry: EditorRegistryName;
      readonly id: string;
      readonly contributionId: string;
      readonly message: string;
    };

export interface EditorContribution<TPanelContext = EditorKernel> {
  readonly id: string;
  readonly actions?: readonly ActionContribution[];
  readonly commands?: readonly CommandContribution[];
  readonly tools?: readonly ToolContribution[];
  readonly panels?: readonly PanelContribution<TPanelContext>[];
  readonly viewportToolbars?: readonly ViewportToolbarContribution<TPanelContext>[];
  readonly viewportOverlays?: readonly ViewportOverlayContribution<TPanelContext>[];
  readonly viewportLayers?: readonly ViewportLayerContribution<TPanelContext>[];
  readonly shortcuts?: readonly ShortcutContribution[];
  readonly appMenus?: readonly AppMenuItemContribution[];
  readonly modals?: readonly ModalContribution<TPanelContext>[];
  readonly settingsSections?: readonly SettingsSectionContribution<TPanelContext>[];
  readonly contextMenus?: readonly ContextMenuItemContribution[];
  readonly svg?: readonly SvgCapabilityContribution[];
  readonly renderers?: readonly RendererContribution[];
}

export interface EditorRegistries<TPanelContext = EditorKernel> {
  readonly packages: readonly EditorInstalledPackage[];
  readonly packageStates: readonly EditorInstalledPackageState[];
  readonly packageLoadOrder: readonly string[];
  readonly packageDependencyGraph: readonly EditorInstalledPackageDependencyGraphEntry[];
  readonly packageCompatibility: readonly EditorInstalledPackageCompatibility[];
  readonly packageUpdates: readonly EditorInstalledPackageUpdate[];
  readonly contributions: readonly EditorContribution<TPanelContext>[];
  readonly contributionSources: readonly EditorContributionSource[];
  readonly issues: readonly EditorRegistryIssue[];
  readonly health: EditorRegistryHealth;
  readonly actions: readonly ActionContribution[];
  readonly commands: readonly CommandContribution[];
  readonly tools: readonly ToolContribution[];
  readonly panels: readonly PanelContribution<TPanelContext>[];
  readonly viewportToolbars: readonly ViewportToolbarContribution<TPanelContext>[];
  readonly viewportOverlays: readonly ViewportOverlayContribution<TPanelContext>[];
  readonly viewportLayers: readonly ViewportLayerContribution<TPanelContext>[];
  readonly shortcuts: readonly ShortcutContribution[];
  readonly appMenus: readonly AppMenuItemContribution[];
  readonly modals: readonly ModalContribution<TPanelContext>[];
  readonly settingsSections: readonly SettingsSectionContribution<TPanelContext>[];
  readonly contextMenus: readonly ContextMenuItemContribution[];
  readonly svg: readonly SvgCapabilityContribution[];
  readonly renderers: readonly RendererContribution[];
}

export interface EditorKernel<TPanelContext = unknown> {
  readonly documents: DocumentService;
  readonly selection: SelectionService;
  readonly commands: CommandService;
  readonly settings: SettingsService;
  readonly viewport: ViewportService;
  readonly resources: ResourceService;
  readonly capabilities: CapabilityService;
  readonly rendering: RenderingService;
  readonly input: InputStateService;
  readonly ui: UiService;
  readonly registries: EditorRegistries<TPanelContext>;
}
