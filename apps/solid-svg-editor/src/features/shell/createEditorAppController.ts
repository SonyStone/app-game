import { createActiveElement } from '@solid-primitives/active-element';
import { writeClipboard } from '@solid-primitives/clipboard';
import { createEventListener } from '@solid-primitives/event-listener';
import { useKeyDownList } from '@solid-primitives/keyboard';
import { createPointerPosition, type PointerStateWithActive } from '@solid-primitives/pointer';
import { createElementSize } from '@solid-primitives/resize-observer';
import { makePersisted } from '@solid-primitives/storage';
import { createMemo, createSignal, createTrackedEffect, untrack } from 'solid-js';

import { createEditorCommand, type EditorCommandEvent } from '../../editor/commands';
import type { newShapeNames } from '../../editor/new-shape';
import { defaultSettings, restoreSettings } from '../../editor/defaults';
import { downloadBlob } from '../../editor/export-utils';
import { serializeSvgDocument } from '../../editor/svg-document';
import type { ContextMenuState, DragSelectionMode, ModalId, PanelId, ShortcutBinding } from '../../editor/types';
import { createDefaultElement, findNode, getAttribute, insertSibling, svgSize } from '../../svg-model';
import { commandSelectionActions, subpathSelection } from '../../editor/path-selection';
import type { HandleDescriptor } from '../../editor/types';
import { parsePathData } from '../../path-data';
import { createEditorDocuments } from '../documents/createEditorDocuments';
import { createTabPersistence, restorePersistedTabs } from '../documents/tab-persistence';
import { createSvgNodeActions } from '../documents/createSvgNodeActions';
import { createFullscreen } from '../fullscreen/createFullscreen';
import { createImportReview } from '../import/createImportReview';
import { createSvgImport } from '../import/createSvgImport';
import { createReferenceImage } from '../reference/createReferenceImage';
import type { EditorContextMenuAction } from '../selection/EditorContextMenu';
import { createEditorSelection } from '../selection/createEditorSelection';
import { createEditorShortcuts } from '../shortcuts/createEditorShortcuts';
import { createTransientViewportPreview } from '../viewport/createTransientViewportPreview';
import { createViewportCamera } from '../viewport/createViewportCamera';
import { createViewportInteractions } from '../viewport/createViewportInteractions';
import { sameSvgSize } from '../viewport/viewport-math';
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
  const [settings, setSettings] = untrack(() =>
    makePersisted(createSignal(defaultSettings(), { ownedWrite: true }), {
      name: 'solid-svg-editor-settings-v1',
      deserialize: restoreSettings
    })
  );
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
    onParseError: () => setActivePanel('code'),
    initialTabs: restorePersistedTabs()
  });
  const {
    tabs,
    activeTabId,
    selectTab,
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
    cancelCommandTransaction,
    undo,
    redo,
    applyCode,
    reformatActiveCode,
    createNewTab,
    closeTabs,
    moveTab,
    markTabClean,
    importSvgText,
    markActiveTabClean
  } = documents;
  commandEvents.listen((event) => setRecentCommandEvent(event));

  const importReview = createImportReview({
    importSvgText,
    openDialog: () => setModal('import-problems'),
    closeDialog: () => setModal(undefined)
  });
  const svgImport = createSvgImport({ importSvgText: importReview.requestImport });
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
    commandSelection,
    setCommandSelection,
    hovered,
    setHovered,
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
    commandSelection,
    setSelectedIds,
    setSelectionPivot,
    setCommandSelection,
    clearSelection,
    dispatchCommand
  });
  const {
    deleteSelected,
    duplicateSelected,
    moveSelected,
    reverseSelectedSubpaths,
    setSelectedAsOrigin,
    reorderInspectorNodes,
    addElement,
    addTextNode,
    updateElementAttribute,
    removeElementAttribute,
    updateBasicNodeText,
    convertNode,
    addShapeAt,
    optimizeActive,
    insertPathCommandFromKey
  } = nodeActions;

  const rootSize = createMemo(() => svgSize(activeRoot()), { equals: sameSvgSize });
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
  createTrackedEffect(() => {
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
    commandSelection,
    setCommandSelection,
    selectNode,
    clearSelection,
    setContextMenu,
    beginCommandTransaction,
    updateCommandTransaction,
    commitCommandTransaction,
    cancelCommandTransaction,
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

  createTabPersistence({ tabs, activeTabId });
  /** Unsaved tabs waiting for the "Save the changes?" dialog, asked about one at a time. */
  const [closeQueue, setCloseQueue] = createSignal<readonly string[]>([]);
  const pendingCloseTab = createMemo(() => tabs().find((tab) => tab.id === closeQueue()[0]));

  /** Closes a tab, first asking to save when it has unsaved changes. */
  function requestCloseTab(tabId: string): void {
    requestCloseTabs([tabId]);
  }

  /**
   * Closes tabs: saved ones right away, then asks about each unsaved one in turn, like GodSVG. Cancel stops the
   * remaining questions and keeps those tabs open.
   */
  function requestCloseTabs(tabIds: readonly string[]): void {
    const closing = tabs().filter((tab) => tabIds.includes(tab.id));
    const unsaved = closing.filter((tab) => tab.dirty).map((tab) => tab.id);
    closeTabs(closing.filter((tab) => !tab.dirty).map((tab) => tab.id));

    if (unsaved.length > 0) {
      setCloseQueue(unsaved);
      setModal('close-tab');
    }
  }

  function resolveCloseTab(choice: 'save' | 'discard' | 'cancel'): void {
    const tab = pendingCloseTab();
    const rest = choice === 'cancel' ? [] : closeQueue().slice(1);
    setCloseQueue(rest);

    if (rest.length === 0) {
      setModal(undefined);
    }

    if (!tab || choice === 'cancel') {
      return;
    }

    if (choice === 'save') {
      saveTab(tab.id);
    }

    closeTabs([tab.id]);
  }

  /** Downloads a tab's SVG with the export formatter and marks it saved. */
  function saveTab(tabId: string): void {
    const tab = tabs().find((item) => item.id === tabId);

    if (tab) {
      downloadBlob(serializeSvgDocument(tab.document, settings().exportFormatter), tab.name, 'image/svg+xml');
      markTabClean(tab.id);
    }
  }

  async function copySvgText(): Promise<void> {
    await writeClipboard(exportText());
  }

  const { onKeyDown, descriptors: shortcutDescriptors } = createEditorShortcuts({
    activeElement,
    overrides: () => settings().shortcutOverrides,
    enabled: () => modal() === undefined && activeDrag() === undefined && activeTouchGesture() === undefined,
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
    clearSelection: () => (commandSelection() ? setCommandSelection(undefined) : clearSelection()),
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
    hovered,
    commandSelection,
    activeDrag,
    activeTouchGesture,
    transientViewportPreview,
    rootSize
  });
  const {
    exportText,
    fileSize,
    elementCount,
    handles,
    contours,
    viewportIsMoving,
    useRasterPreview,
    rasterPreviewRect,
    rasterPreviewUrl
  } = derived;
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
    setContextMenu({ kind: 'node', x: event.clientX, y: event.clientY, nodeId });
  }

  /** Double-clicking a path handle selects its whole subpath, as in GodSVG. */
  function selectHandleSubpath(handle: HandleDescriptor): void {
    const node = findNode(activeRoot(), handle.nodeId);

    if (handle.commandIndex === undefined || !handle.id.startsWith('cmd-') || node?.kind !== 'element') {
      return;
    }

    setCommandSelection(subpathSelection(parsePathData(getAttribute(node, 'd', true)), handle.nodeId, handle.commandIndex));
  }

  /** Right-clicking a path handle selects its command (unless already selected) and opens the command menu. */
  function openCommandMenu(event: MouseEvent, handle: HandleDescriptor): void {
    event.preventDefault();

    if (handle.commandIndex === undefined || !handle.id.startsWith('cmd-')) {
      return;
    }

    const current = commandSelection();

    if (current?.nodeId !== handle.nodeId || !current.indices.includes(handle.commandIndex)) {
      setCommandSelection({ nodeId: handle.nodeId, indices: [handle.commandIndex], pivot: handle.commandIndex });
    }

    setContextMenu({ kind: 'commands', x: event.clientX, y: event.clientY, nodeId: handle.nodeId });
  }

  /** Opens the "New shape" menu on an empty canvas spot; node menus have already handled their own events. */
  function openCanvasContextMenu(event: MouseEvent): void {
    if (event.defaultPrevented) {
      return;
    }

    event.preventDefault();
    setContextMenu({ kind: 'canvas', x: event.clientX, y: event.clientY, point: clientToSvgPoint(event.clientX, event.clientY) });
  }

  function closeModal(): void {
    if (modal() === 'import-problems') {
      importReview.resolve(false);
      return;
    }

    setModal(undefined);
  }

  function runContextAction(action: EditorContextMenuAction): void {
    const menu = contextMenu();

    if (menu?.kind !== 'node') {
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
      selectTab,
      activeTabId,
      closeTab: requestCloseTab,
      closeTabs: requestCloseTabs,
      moveTab,
      saveTab,
      middleClickCloses: () => settings().tabMiddleClickClose,
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
      commandSelection,
      setCommandSelection,
      hovered,
      setHovered,
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
      previewSizes: () => settings().previewSizes,
      setPreviewSizes: (sizes: readonly number[]) => setSettings((current) => ({ ...current, previewSizes: sizes })),
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
      setDragSelectionMode: (mode: DragSelectionMode) =>
        setSettings((current) => ({ ...current, dragSelectionMode: mode })),
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
      contours,
      hovered,
      setHovered,
      commandSelection,
      selectionBox,
      marqueeRect,
      onCanvasWheel,
      onCanvasPointerDown,
      onNodePointerDown,
      startHandleDrag,
      startTransformBoxDrag,
      openCanvasContextMenu,
      selectHandleSubpath,
      openCommandMenu,
      heldKeys
    },
    contextMenu: {
      state: contextMenu,
      node: createMemo(() => {
        const menu = contextMenu();
        return menu?.kind === 'node' ? findNode(activeRoot(), menu.nodeId) : undefined;
      }),
      runAction: runContextAction,
      convert: (target: string) => {
        const menu = contextMenu();
        setContextMenu(undefined);

        if (menu?.kind === 'node') {
          convertNode(menu.nodeId, target);
        }
      },
      addShape: (name: (typeof newShapeNames)[number]) => {
        const menu = contextMenu();
        setContextMenu(undefined);

        if (menu?.kind === 'canvas') {
          addShapeAt(name, menu.point);
        }
      },
      commandActions: createMemo(() => {
        const menu = contextMenu();
        const selection = commandSelection();
        const node = menu?.kind === 'commands' ? findNode(activeRoot(), menu.nodeId) : undefined;

        if (!selection || node?.kind !== 'element') {
          return undefined;
        }

        return commandSelectionActions(parsePathData(getAttribute(node, 'd', true)), selection.indices);
      }),
      runCommandAction: (action: 'move-up' | 'move-down' | 'reverse' | 'set-origin' | 'delete') => {
        setContextMenu(undefined);

        if (action === 'move-up' || action === 'move-down') {
          moveSelected(action === 'move-up' ? -1 : 1);
        } else if (action === 'reverse') {
          reverseSelectedSubpaths();
        } else if (action === 'set-origin') {
          setSelectedAsOrigin();
        } else {
          deleteSelected();
        }
      },
      close: () => setContextMenu(undefined)
    },
    modals: {
      modal,
      settings,
      setSettings,
      activeRoot,
      exportText,
      tabName: () => activeTab()?.name ?? 'image.svg',
      close: closeModal,
      reformatActiveCode,
      pendingCloseTabName: () => pendingCloseTab()?.name,
      pendingImport: importReview.pending,
      resolveImport: importReview.resolve,
      resolveCloseTab,
      shortcuts: shortcutDescriptors,
      setShortcutBindings: (id: string, bindings: readonly ShortcutBinding[] | undefined) =>
        setSettings((current) => {
          const shortcutOverrides = { ...current.shortcutOverrides, [id]: bindings ?? [] };

          if (!bindings) {
            delete shortcutOverrides[id];
          }

          return { ...current, shortcutOverrides };
        })
    },
    dropOverlay: {
      active: isSvgDropActive
    }
  };
}

export type EditorAppController = ReturnType<typeof createEditorAppController>;
