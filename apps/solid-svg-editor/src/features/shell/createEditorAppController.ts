import { createActiveElement } from '@solid-primitives/active-element';
import { writeClipboard } from '@solid-primitives/clipboard';
import { createEventListener } from '@solid-primitives/event-listener';
import { useKeyDownList } from '@solid-primitives/keyboard';
import { createPointerPosition, type PointerStateWithActive } from '@solid-primitives/pointer';
import { createElementSize } from '@solid-primitives/resize-observer';
import { makePersisted } from '@solid-primitives/storage';
import { createEffect, createMemo, createSignal } from 'solid-js';

import { createEditorCommand, type EditorCommandEvent } from '../../editor/commands';
import { defaultSettings } from '../../editor/defaults';
import { downloadBlob } from '../../editor/export-utils';
import type { ContextMenuState, DragSelectionMode, ModalId, PanelId } from '../../editor/types';
import { createDefaultElement, insertSibling, svgSize } from '../../svg-model';
import { createEditorDocuments } from '../documents/createEditorDocuments';
import { createSvgNodeActions } from '../documents/createSvgNodeActions';
import { createFullscreen } from '../fullscreen/createFullscreen';
import { createSvgImport } from '../import/createSvgImport';
import { createReferenceImage } from '../reference/createReferenceImage';
import type { EditorContextMenuAction } from '../selection/EditorContextMenu';
import { createEditorSelection } from '../selection/createEditorSelection';
import { createEditorShortcuts } from '../shortcuts/createEditorShortcuts';
import { createTransientViewportPreview } from '../viewport/createTransientViewportPreview';
import { createViewportCamera } from '../viewport/createViewportCamera';
import { createViewportInteractions } from '../viewport/createViewportInteractions';
import { emptySvgSize, sameSvgSize } from '../viewport/viewport-math';
import { appRootBaseClass, appRootThemeClass, createAppThemeVars } from './app-theme';
import { createEditorDerivedState } from './createEditorDerivedState';
import { createResizableSidebar } from './createResizableSidebar';

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

export function createEditorAppController() {
  const [settings, setSettings] = makePersisted(createSignal(defaultSettings()), {
    name: 'solid-svg-editor-settings-v1'
  });
  const [activePanel, setActivePanel] = createSignal<PanelId>('inspector');
  const [modal, setModal] = createSignal<ModalId>();
  const [contextMenu, setContextMenu] = createSignal<ContextMenuState | undefined>();
  const [canvasSvg, setCanvasSvg] = createSignal<SVGSVGElement>();
  const [viewportShell, setViewportShell] = createSignal<HTMLDivElement>();
  const [recentCommandEvent, setRecentCommandEvent] = createSignal<EditorCommandEvent>();
  const activeElement = createActiveElement();
  const heldKeys = useKeyDownList();
  const viewportPointer = createPointerPosition({
    target: () => viewportShell() ?? document.body,
    value: inactivePointerState
  });

  let appRootRef: HTMLDivElement | undefined;
  const setAppRootRef = (element: HTMLDivElement) => {
    appRootRef = element;
  };

  let resetDocumentSelection: () => void = () => undefined;
  let centerOpenedDocument: () => void = () => undefined;
  const documents = createEditorDocuments({
    formatter: () => settings().formatter,
    onSelectionReset: () => resetDocumentSelection(),
    onDocumentOpened: () => centerOpenedDocument(),
    onParseError: () => setActivePanel('code')
  });
  const {
    tabs,
    activeTabId,
    setActiveTabId,
    activeTab,
    activeRoot,
    activeCode,
    canUndo,
    canRedo,
    commandEvents,
    dispatchCommand,
    beginCommandTransaction,
    updateCommandTransaction,
    commitCommandTransaction,
    undo,
    redo,
    applyCode,
    reformatActiveCode,
    createNewTab,
    closeTab,
    importSvgText,
    markActiveTabClean
  } = documents;
  commandEvents.listen((event) => setRecentCommandEvent(event));

  const svgImport = createSvgImport({ importSvgText });
  const { isSvgDropActive, setImportInputRef, openImportDialog, onImportFile } = svgImport;

  const reference = createReferenceImage();
  const {
    referenceImage,
    showReference,
    setShowReference,
    overlayReference,
    setOverlayReference,
    setReferenceInputRef,
    openReferenceDialog,
    onReferenceFile,
    clearReference
  } = reference;

  const selection = createEditorSelection({ root: activeRoot });
  const {
    selectedIds,
    setSelectedIds,
    setSelectionPivot,
    selectedPathCommand,
    setSelectedPathCommand,
    selectedNodes,
    selectNode,
    clearSelection,
    selectAll
  } = selection;
  resetDocumentSelection = clearSelection;

  const nodeActions = createSvgNodeActions({
    settings,
    activeRoot,
    selectedIds,
    selectedNodes,
    selectedPathCommand,
    setSelectedIds,
    setSelectionPivot,
    setSelectedPathCommand,
    clearSelection,
    dispatchCommand
  });
  const {
    deleteSelected,
    duplicateSelected,
    moveSelected,
    reorderInspectorNodes,
    addElement,
    addTextNode,
    updateElementAttribute,
    removeElementAttribute,
    updateBasicNodeText,
    optimizeActive,
    insertPathCommandFromKey
  } = nodeActions;

  const rootSize = createMemo(() => svgSize(activeRoot()), emptySvgSize, { equals: sameSvgSize });
  const viewport = createViewportCamera({ rootSize, settings, canvasSvg });
  const {
    setCameraCenter,
    zoom,
    setZoom,
    viewportSize,
    setViewportSize,
    viewportRotation,
    setViewportRotation,
    viewRect,
    gridViewRect,
    viewportTransform,
    centerFrame,
    zoomBy,
    rotateViewportBy,
    clientToSvgPoint,
    centerForClientPoint,
    angleFromViewportCenter
  } = viewport;
  centerOpenedDocument = centerFrame;

  const { isFullscreen, toggleFullscreen } = createFullscreen(() => appRootRef);
  const viewportShellSize = createElementSize(viewportShell);
  createEffect(() => {
    if (viewportShellSize.width === null || viewportShellSize.height === null) {
      return;
    }

    setViewportSize({ width: viewportShellSize.width, height: viewportShellSize.height });
  });

  const { transientViewportPreview, keepViewportPreviewAlive } = createTransientViewportPreview();
  let rasterPreviewActive: () => boolean = () => false;
  const viewportInteractions = createViewportInteractions({
    activeRoot,
    selectedIds,
    setSelectedIds,
    setSelectionPivot,
    setSelectedPathCommand,
    selectNode,
    clearSelection,
    setContextMenu,
    beginCommandTransaction,
    updateCommandTransaction,
    commitCommandTransaction,
    canvasSvg,
    zoom,
    setZoom,
    viewportSize,
    viewportRotation,
    setViewportRotation,
    setCameraCenter,
    clientToSvgPoint,
    centerForClientPoint,
    angleFromViewportCenter,
    zoomBy,
    rotateViewportBy,
    dragSelectionMode: () => settings().dragSelectionMode,
    useCtrlForZoom: () => settings().useCtrlForZoom,
    useRasterPreview: () => rasterPreviewActive(),
    keepViewportPreviewAlive
  });
  const {
    activeDrag,
    activeTouchGesture,
    selectionBox,
    marqueeRect,
    onCanvasWheel,
    onCanvasPointerDown,
    onNodePointerDown,
    startHandleDrag,
    startTransformBoxDrag
  } = viewportInteractions;

  function downloadSvg(): void {
    downloadBlob(exportText(), activeTab()?.name ?? 'image.svg', 'image/svg+xml');
    markActiveTabClean();
  }

  async function copySvgText(): Promise<void> {
    await writeClipboard(exportText());
  }

  const { onKeyDown } = createEditorShortcuts({
    activeElement,
    redo,
    undo,
    downloadSvg,
    copySvgText: () => void copySvgText(),
    openImportDialog,
    openExport: () => setModal('export'),
    createNewTab,
    openSettings: () => setModal('settings'),
    optimizeActive,
    zoomIn: () => zoomBy(Math.SQRT2),
    zoomOut: () => zoomBy(1 / Math.SQRT2),
    centerFrame,
    toggleGrid: () => setSettings((current) => ({ ...current, showGrid: !current.showGrid })),
    toggleHandles: () => setSettings((current) => ({ ...current, showHandles: !current.showHandles })),
    selectAll,
    duplicateSelected,
    deleteSelected,
    moveSelected,
    insertPathCommandFromKey
  });
  createEventListener(window, 'keydown', onKeyDown);

  const derived = createEditorDerivedState({
    settings,
    activeRoot,
    selectedIds,
    activeDrag,
    activeTouchGesture,
    transientViewportPreview,
    rootSize
  });
  const { exportText, fileSize, elementCount, handles, viewportIsMoving, useRasterPreview, rasterPreviewRect, rasterPreviewUrl } =
    derived;
  rasterPreviewActive = useRasterPreview;

  const sidebar = createResizableSidebar({ initialWidth: 408, minWidth: 320, maxWidth: 720 });
  const themeVars = createMemo(() => createAppThemeVars(settings()));
  const appRootClass = createMemo(() =>
    [appRootBaseClass, appRootThemeClass[settings().themePreset], isSvgDropActive() ? 'svg-drop-active' : '']
      .filter(Boolean)
      .join(' ')
  );

  function openContextMenu(event: MouseEvent, nodeId: string): void {
    event.preventDefault();
    selectNode(nodeId, event);
    setContextMenu({ x: event.clientX, y: event.clientY, nodeId });
  }

  function closeModal(): void {
    setModal(undefined);
  }

  function runContextAction(action: EditorContextMenuAction): void {
    const menu = contextMenu();

    if (!menu) {
      return;
    }

    setContextMenu(undefined);

    if (action === 'duplicate') {
      duplicateSelected();
    } else if (action === 'delete') {
      deleteSelected();
    } else if (action === 'move-up') {
      moveSelected(-1);
    } else if (action === 'move-down') {
      moveSelected(1);
    } else {
      const child = createDefaultElement('g');
      dispatchCommand(
        createEditorCommand({
          id: 'svg.insert-group-after',
          label: 'Insert group',
          apply: (root) => insertSibling(root, menu.nodeId, child, true)
        })
      );
    }
  }

  return {
    root: {
      setAppRootRef,
      className: appRootClass,
      themeVars,
      onDragEnter: svgImport.onDragEnter,
      onDragOver: svgImport.onDragOver,
      onDragLeave: svgImport.onDragLeave,
      onDrop: svgImport.onDrop
    },
    fileInputs: {
      setImportInputRef,
      onImportFile,
      setReferenceInputRef,
      onReferenceFile
    },
    topBar: {
      activeTab,
      tabs,
      fileSize,
      canUndo,
      canRedo,
      setActiveTabId,
      activeTabId,
      closeTab,
      createNewTab,
      openImportDialog,
      downloadSvg,
      copySvgText,
      undo,
      redo,
      optimizeActive,
      openExport: () => setModal('export'),
      openSettings: () => setModal('settings'),
      openAbout: () => setModal('about'),
      openDonate: () => setModal('donate'),
      openShortcuts: () => setModal('shortcuts')
    },
    workspace: {
      sidebar,
      activePanel,
      setActivePanel,
      activeRoot,
      selectedIds,
      selectedPathCommand,
      setSelectedPathCommand,
      selectNode,
      clearSelection,
      addElement,
      addTextNode,
      updateElementAttribute,
      removeElementAttribute,
      updateBasicNodeText,
      openContextMenu,
      reorderInspectorNodes,
      activeCode,
      parseError: () => activeTab()?.parseError,
      applyCode,
      reformatPretty: () => reformatActiveCode(settings().formatter),
      reformatCompact: () => reformatActiveCode(settings().exportFormatter),
      selectedNodes,
      elementCount,
      exportText,
      heldKeys,
      viewportPointer,
      recentCommandEvent
    },
    viewport: {
      settings,
      setSettings,
      zoom,
      zoomBy,
      centerFrame,
      isFullscreen,
      toggleFullscreen,
      openReferenceDialog,
      referenceImage,
      showReference,
      setShowReference,
      overlayReference,
      setOverlayReference,
      clearReference,
      setDragSelectionMode: (mode: DragSelectionMode) => setSettings((current) => ({ ...current, dragSelectionMode: mode })),
      setViewportShell,
      setCanvasSvg,
      viewRect,
      viewportTransform,
      gridViewRect,
      rootSize,
      activeRoot,
      selectedIds,
      viewportIsMoving,
      useRasterPreview,
      rasterPreviewUrl,
      rasterPreviewRect,
      handles,
      selectionBox,
      marqueeRect,
      onCanvasWheel,
      onCanvasPointerDown,
      onNodePointerDown,
      startHandleDrag,
      startTransformBoxDrag,
      heldKeys
    },
    contextMenu: {
      state: contextMenu,
      runAction: runContextAction
    },
    modals: {
      modal,
      settings,
      setSettings,
      activeRoot,
      exportText,
      close: closeModal,
      reformatActiveCode
    },
    dropOverlay: {
      active: isSvgDropActive
    }
  };
}

export type EditorAppController = ReturnType<typeof createEditorAppController>;
