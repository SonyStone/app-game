import { createPointerPosition, type PointerStateWithActive } from '@solid-primitives/pointer';
import { createElementSize } from '@solid-primitives/resize-observer';
import { createEffect, createMemo, createSignal, type Accessor, type Setter } from 'solid-js';

import type { SvgCapabilityRegistry } from '../../editor/capabilities';
import type { CommandTransaction } from '../../editor/commands';
import type { ContextMenuState, DragSelectionMode, AppSettings } from '../../editor/types';
import type {
  RendererContribution,
  SvgNodeRendererAdapter,
  ToolContribution,
  ViewportHostService,
  ViewportLayerService,
  ViewportOverlayService,
  ViewportRendererAdapter,
  ViewportService
} from '../../editor/kernel';
import type { SelectionTarget, PathAnchorSelection } from '../../editor/selection-targets';
import type { SvgSpatialIndex } from '../../editor/svg-spatial-index';
import { svgSize, type SvgElementNode } from '../../svg-model';
import { createTransientViewportPreview } from '../viewport/createTransientViewportPreview';
import { createViewportCamera } from '../viewport/createViewportCamera';
import { createViewportInteractions } from '../viewport/createViewportInteractions';
import { createDomRendererAdapter, createViewportRendererFromContributions } from '../viewport/rendererAdapter';
import { emptySvgSize, sameSvgSize } from '../viewport/viewport-math';
import { createEditorDerivedState } from './createEditorDerivedState';

const inactivePointerState = {
  pressure: 0,
  pointerId: -1,
  tiltX: 0,
  tiltY: 0,
  width: 0,
  height: 0,
  twist: 0,
  pointerType: null,
  x: 0,
  y: 0,
  isActive: false
} as const satisfies PointerStateWithActive;

export interface CreateEditorViewportServicesOptions {
  readonly settings: Accessor<AppSettings>;
  readonly activeRoot: Accessor<SvgElementNode>;
  readonly activeSpatialIndex: Accessor<SvgSpatialIndex>;
  readonly selectedIds: Accessor<readonly string[]>;
  readonly selectedTargets: Accessor<readonly SelectionTarget[]>;
  readonly selectedPathAnchor: Accessor<PathAnchorSelection | undefined>;
  readonly setSelectedTargets: (targets: readonly SelectionTarget[]) => void;
  readonly selectTarget: (target: SelectionTarget, event?: PointerEvent) => void;
  readonly selectNode: (nodeId: string, event?: MouseEvent | PointerEvent) => void;
  readonly clearSelection: () => void;
  readonly setContextMenu: Setter<ContextMenuState | undefined>;
  readonly openContextMenu: (event: MouseEvent, target: string | SelectionTarget) => void;
  readonly beginCommandTransaction: () => CommandTransaction | undefined;
  readonly cancelCommandTransaction: () => void;
  readonly dragSelectionMode: Accessor<DragSelectionMode>;
  readonly useCtrlForZoom: Accessor<boolean>;
  readonly referenceImage: Accessor<string | undefined>;
  readonly showReference: Accessor<boolean>;
  readonly overlayReference: Accessor<boolean>;
  readonly capabilities: SvgCapabilityRegistry;
  readonly renderers: readonly RendererContribution[];
  readonly toolContributions: readonly ToolContribution[];
  readonly nodeRenderer: SvgNodeRendererAdapter | undefined;
}

export interface EditorViewportServices {
  readonly viewport: ViewportService;
  readonly viewportRenderer: ViewportRendererAdapter;
  readonly viewportPointer: Accessor<PointerStateWithActive>;
  readonly exportText: Accessor<string>;
  readonly elementCount: Accessor<number>;
}

export function createEditorViewportServices(options: CreateEditorViewportServicesOptions): EditorViewportServices {
  const [canvasSvg, setCanvasSvg] = createSignal<SVGSVGElement>();
  const [viewportShell, setViewportShell] = createSignal<HTMLDivElement>();
  const viewportPointer = createPointerPosition({
    target: () => viewportShell() ?? document.body,
    value: inactivePointerState
  });
  const rootSize = createMemo(() => svgSize(options.activeRoot()), emptySvgSize, { equals: sameSvgSize });
  const domViewportRenderer = createDomRendererAdapter({
    queryRoot: canvasSvg,
    viewportElement: () => canvasSvg()?.parentElement ?? canvasSvg()
  });
  const viewportRenderer = createViewportRendererFromContributions(options.renderers, domViewportRenderer);
  const viewportCamera = createViewportCamera({ rootSize, settings: options.settings, renderer: viewportRenderer });
  const viewportShellSize = createElementSize(viewportShell);

  createEffect(() => {
    if (viewportShellSize.width === null || viewportShellSize.height === null) {
      return;
    }

    viewportCamera.setViewportSize({ width: viewportShellSize.width, height: viewportShellSize.height });
  });

  const { transientViewportPreview, keepViewportPreviewAlive } = createTransientViewportPreview();
  let rasterPreviewActive: () => boolean = () => false;
  const viewportInteractions = createViewportInteractions({
    activeRoot: options.activeRoot,
    selectedIds: options.selectedIds,
    selectedTargets: options.selectedTargets,
    setSelectedTargets: options.setSelectedTargets,
    selectTarget: options.selectTarget,
    selectNode: options.selectNode,
    clearSelection: options.clearSelection,
    setContextMenu: options.setContextMenu,
    beginCommandTransaction: options.beginCommandTransaction,
    cancelCommandTransaction: options.cancelCommandTransaction,
    renderer: viewportRenderer,
    spatialIndex: options.activeSpatialIndex,
    zoom: viewportCamera.zoom,
    setZoom: viewportCamera.setZoom,
    viewportSize: viewportCamera.viewportSize,
    viewportRotation: viewportCamera.viewportRotation,
    setViewportRotation: viewportCamera.setViewportRotation,
    setCameraCenter: viewportCamera.setCameraCenter,
    clientToSvgPoint: viewportCamera.clientToSvgPoint,
    centerForClientPoint: viewportCamera.centerForClientPoint,
    angleFromViewportCenter: viewportCamera.angleFromViewportCenter,
    zoomBy: viewportCamera.zoomBy,
    rotateViewportBy: viewportCamera.rotateViewportBy,
    dragSelectionMode: options.dragSelectionMode,
    useCtrlForZoom: options.useCtrlForZoom,
    useRasterPreview: () => rasterPreviewActive(),
    keepViewportPreviewAlive,
    toolContributions: options.toolContributions
  });
  const derived = createEditorDerivedState({
    settings: options.settings,
    activeRoot: options.activeRoot,
    selectedIds: options.selectedIds,
    selectedPathAnchor: options.selectedPathAnchor,
    activeDrag: viewportInteractions.activeDrag,
    activeTouchGesture: viewportInteractions.activeTouchGesture,
    transientViewportPreview,
    rootSize,
    capabilities: options.capabilities
  });
  rasterPreviewActive = derived.useRasterPreview;

  const viewportLayerService = {
    settings: options.settings,
    zoom: viewportCamera.zoom,
    viewRect: viewportCamera.viewRect,
    gridViewRect: viewportCamera.gridViewRect,
    rootSize,
    root: options.activeRoot,
    selectedIds: options.selectedIds,
    selectedTargets: options.selectedTargets,
    viewportIsMoving: derived.viewportIsMoving,
    referenceImage: options.referenceImage,
    showReference: options.showReference,
    overlayReference: options.overlayReference,
    useRasterPreview: derived.useRasterPreview,
    rasterPreviewUrl: derived.rasterPreviewUrl,
    rasterPreviewRect: derived.rasterPreviewRect,
    nodeRenderer: () => options.nodeRenderer,
    onNodePointerDown: viewportInteractions.onNodePointerDown,
    onSelectionTargetPointerDown: viewportInteractions.onSelectionTargetPointerDown,
    openContextMenu: options.openContextMenu,
    openSelectionTargetContextMenu: options.openContextMenu
  } satisfies ViewportLayerService;
  const viewportOverlayService = {
    zoom: viewportCamera.zoom,
    handles: derived.handles,
    selectionBox: viewportInteractions.selectionBox,
    marqueeRect: viewportInteractions.marqueeRect,
    startHandleDrag: viewportInteractions.startHandleDrag,
    startTransformBoxDrag: viewportInteractions.startTransformBoxDrag
  } satisfies ViewportOverlayService;
  const viewportHostService = {
    setViewportShell,
    setCanvasSvg,
    viewportTransform: viewportCamera.viewportTransform,
    onCanvasWheel: viewportInteractions.onCanvasWheel,
    onCanvasPointerDown: viewportInteractions.onCanvasPointerDown
  } satisfies ViewportHostService;

  return {
    viewport: {
      zoom: viewportCamera.zoom,
      viewRect: viewportCamera.viewRect,
      handles: derived.handles,
      zoomBy: viewportCamera.zoomBy,
      centerFrame: viewportCamera.centerFrame,
      host: viewportHostService,
      layers: viewportLayerService,
      overlays: viewportOverlayService
    },
    viewportRenderer,
    viewportPointer,
    exportText: derived.exportText,
    elementCount: derived.elementCount
  } satisfies EditorViewportServices;
}
