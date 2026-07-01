import { createEffect, createMemo, createSignal, For, onCleanup, onMount, Show } from "solid-js";

import "./styles.css";
import { humanFileSize, serializeRoot } from "./formatter";
import { formatPathData, parsePathData, pathCommandLetters } from "./path-data";
import { isValidChild, type RecognizedElement } from "./svg-db";
import {
  appendChild,
  cloneRoot,
  cloneWithFreshIds,
  createDefaultElement,
  createDefaultRoot,
  createId,
  findNode,
  flattenElements,
  getAttribute,
  insertSibling,
  moveNode,
  parseSvgMarkup,
  removeAttribute,
  removeNode,
  setAttribute,
  svgSize,
  updateNode,
  type SvgElementNode,
  type SvgNode
} from "./svg-model";
import { createInitialTab, defaultSettings } from "./editor/defaults";
import { downloadBlob } from "./editor/export-utils";
import {
  formatMatrixTransform,
  identityMatrix,
  invertMatrix,
  matrixAround,
  multiplyMatrices,
  parseTransformList,
  radiansToDegrees,
  rectCenter,
  rectFromPoints,
  rotateMatrix,
  scaleMatrix,
  translateMatrix,
  unionRects,
  type Matrix2D,
  type Point,
  type Rect
} from "./editor/geometry";
import { getHandles } from "./editor/handles";
import { clamp, flattenAllNodes, hasSvgDrag, insertPathCommand, optimizeNode } from "./editor/tree-utils";
import type { ActiveDrag, ActiveMarqueeDrag, ActiveMoveSelectionDrag, ActivePanDrag, ActiveTransformBoxDrag, ContextMenuState, DragSelectionMode, EditorTab, HandleDescriptor, HistoryState, ModalId, PanelId, TransformBoxHandleDescriptor, TransformBoxHandleKind, ViewRect } from "./editor/types";
import { PanelTabs, TopBar } from "./features/chrome/TopBar";
import { InspectorPanel } from "./features/inspector/InspectorPanel";
import { CodePanel, DebugPanel, PreviewsPanel } from "./features/panels/SidePanels";
import { AboutModal, DonateModal, ExportModal, SettingsModal, ShortcutsModal } from "./features/modals/EditorModals";
import { GridLayer, HandlesLayer, SvgNodeView, TransformBoxLayer, ViewportToolbar } from "./features/viewport/ViewportParts";

type SvgSize = ReturnType<typeof svgSize>;
type TouchPoint = { readonly pointerId: number; readonly clientX: number; readonly clientY: number };
type TouchGesture = {
  readonly pointerIds: readonly number[];
  readonly startWorldX: number;
  readonly startWorldY: number;
  readonly startDistance: number;
  readonly startAngle: number;
  readonly startZoom: number;
  readonly startRotation: number;
};

const emptySvgSize = {
  width: 0,
  height: 0,
  viewBox: [0, 0, 0, 0]
} satisfies SvgSize;

export function App() {
  const [settings, setSettings] = createSignal(defaultSettings());
  const [tabs, setTabs] = createSignal<readonly EditorTab[]>([createInitialTab()]);
  const [activeTabId, setActiveTabId] = createSignal(tabs()[0]?.id ?? "");
  const [activePanel, setActivePanel] = createSignal<PanelId>("inspector");
  const [selectedIds, setSelectedIds] = createSignal<readonly string[]>([]);
  const [selectionPivot, setSelectionPivot] = createSignal<string | undefined>();
  const [selectedPathCommand, setSelectedPathCommand] = createSignal<{ readonly nodeId: string; readonly index: number } | undefined>();
  const [modal, setModal] = createSignal<ModalId>();
  const [contextMenu, setContextMenu] = createSignal<ContextMenuState | undefined>();
  const [leftWidth, setLeftWidth] = createSignal(408);
  const [cameraCenter, setCameraCenter] = createSignal({ x: 450, y: 450 });
  const [zoom, setZoom] = createSignal(1);
  const [viewportSize, setViewportSize] = createSignal({ width: 900, height: 700 });
  const [referenceImage, setReferenceImage] = createSignal<string | undefined>();
  const [showReference, setShowReference] = createSignal(true);
  const [overlayReference, setOverlayReference] = createSignal(false);
  const [isSvgDropActive, setIsSvgDropActive] = createSignal(false);
  const [historyVersion, setHistoryVersion] = createSignal(0);
  const [activeDrag, setActiveDrag] = createSignal<ActiveDrag | undefined>();
  const [activeTouchGesture, setActiveTouchGesture] = createSignal<TouchGesture | undefined>();
  const [canvasSvg, setCanvasSvg] = createSignal<SVGSVGElement>();
  const [transientViewportPreview, setTransientViewportPreview] = createSignal(false);
  const [rasterPreviewUrl, setRasterPreviewUrl] = createSignal<string | undefined>();
  const [viewportRotation, setViewportRotation] = createSignal(0);
  const [selectionBox, setSelectionBox] = createSignal<Rect | undefined>();
  const [marqueeRect, setMarqueeRect] = createSignal<Rect | undefined>();

  const histories = new Map<string, HistoryState>();
  const touchPointers = new Map<number, TouchPoint>();
  let leftResizeStart: { readonly x: number; readonly width: number } | undefined;
  let importInputRef: HTMLInputElement | undefined;
  let referenceInputRef: HTMLInputElement | undefined;
  let viewportPreviewTimeout: number | undefined;
  let rasterPreviewObjectUrl: string | undefined;
  let pendingPanFrame: number | undefined;
  let pendingPanMove: { readonly drag: ActivePanDrag; readonly clientX: number; readonly clientY: number } | undefined;
  let pendingHandleFrame: number | undefined;
  let pendingHandleMove: { readonly pointerId: number; readonly handle: HandleDescriptor; readonly clientX: number; readonly clientY: number } | undefined;
  let selectionBoxFrame: number | undefined;

  const activeTab = createMemo(() => {
    const id = activeTabId();
    return tabs().find((tab) => tab.id === id) ?? tabs()[0];
  });

  const activeRoot = createMemo(() => activeTab()?.root ?? createDefaultRoot());
  const activeCode = createMemo(() => activeTab()?.code ?? "");
  const handleDragActive = createMemo(() => activeDrag()?.type === "handle" || activeDrag()?.type === "transform-box" || activeDrag()?.type === "move-selection");
  const exportText = createMemo<string>((previous) => {
    if (handleDragActive() && previous) {
      return previous;
    }

    return serializeRoot(activeRoot(), settings().exportFormatter);
  }, "");
  const fileSize = createMemo(() => humanFileSize(new Blob([exportText()]).size));
  const canUndo = createMemo(() => getHistory(activeTabId()).past.length > 0 && historyVersion() >= 0);
  const canRedo = createMemo(() => getHistory(activeTabId()).future.length > 0 && historyVersion() >= 0);
  const selectedNodes = createMemo(() => selectedIds().map((id) => findNode(activeRoot(), id)).filter((node): node is SvgNode => Boolean(node)));
  const elementCount = createMemo(() => flattenElements(activeRoot()).length);
  const rootSize = createMemo(() => svgSize(activeRoot()), emptySvgSize, { equals: sameSvgSize });
  const viewRect = createMemo((): ViewRect => {
    const size = viewportSize();
    const z = zoom();
    const center = cameraCenter();
    return {
      x: center.x - size.width / z / 2,
      y: center.y - size.height / z / 2,
      width: size.width / z,
      height: size.height / z
    };
  });
  const handles = createMemo(() => (selectedIds().length <= 1 ? getHandles(activeRoot(), selectedIds()) : []));
  const viewportIsMoving = createMemo(() => activeDrag()?.type === "pan" || activeDrag()?.type === "rotate-canvas" || activeDrag()?.type === "move-selection" || Boolean(activeTouchGesture()) || transientViewportPreview());
  const useRasterPreview = createMemo(() => settings().viewRasterized || (settings().rasterPreviewDuringInteraction && viewportIsMoving()));
  const gridViewRect = createMemo(() => createRotatedGridRect(viewRect(), viewportRotation()));
  const rasterPreviewRect = createMemo(() => createRasterPreviewRect(rootSize()));
  const rasterPreviewText = createMemo(() => serializeRoot(createRasterPreviewRoot(activeRoot(), rasterPreviewRect()), settings().exportFormatter));
  const viewportTransform = createMemo(() => {
    const center = cameraCenter();
    return `rotate(${radiansToDegrees(viewportRotation())} ${center.x} ${center.y})`;
  });
  const themeVars = createMemo(() => {
    const current = settings();
    return {
      "--base": current.baseColor,
      "--accent": current.accentColor,
      "--canvas": current.canvasColor,
      "--grid": current.gridColor
    };
  });

  onMount(() => {
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("pointermove", onWindowPointerMove);
    window.addEventListener("pointerup", onWindowPointerUp);
    window.addEventListener("pointercancel", onWindowPointerCancel);

    const resizeObserver = new ResizeObserver((entries) => {
      const entry = entries[0];

      if (!entry) {
        return;
      }

      setViewportSize({ width: entry.contentRect.width, height: entry.contentRect.height });
    });
    const viewport = document.querySelector(".viewport-shell");

    if (viewport) {
      resizeObserver.observe(viewport);
    }

    onCleanup(() => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("pointermove", onWindowPointerMove);
      window.removeEventListener("pointerup", onWindowPointerUp);
      window.removeEventListener("pointercancel", onWindowPointerCancel);
      resizeObserver.disconnect();
    });
  });

  createEffect(() => {
    if (!useRasterPreview()) {
      if (rasterPreviewObjectUrl) {
        URL.revokeObjectURL(rasterPreviewObjectUrl);
        rasterPreviewObjectUrl = undefined;
      }

      setRasterPreviewUrl(undefined);
      return;
    }

    const nextUrl = URL.createObjectURL(new Blob([rasterPreviewText()], { type: "image/svg+xml" }));
    const previousUrl = rasterPreviewObjectUrl;
    rasterPreviewObjectUrl = nextUrl;
    setRasterPreviewUrl(nextUrl);

    if (previousUrl) {
      URL.revokeObjectURL(previousUrl);
    }
  });

  onCleanup(() => {
    if (viewportPreviewTimeout !== undefined) {
      window.clearTimeout(viewportPreviewTimeout);
    }

    if (pendingPanFrame !== undefined) {
      window.cancelAnimationFrame(pendingPanFrame);
    }

    if (pendingHandleFrame !== undefined) {
      window.cancelAnimationFrame(pendingHandleFrame);
    }

    if (selectionBoxFrame !== undefined) {
      window.cancelAnimationFrame(selectionBoxFrame);
    }

    if (rasterPreviewObjectUrl) {
      URL.revokeObjectURL(rasterPreviewObjectUrl);
    }
  });

  createEffect(() => {
    const size = rootSize();
    const currentViewport = viewportSize();

    if (currentViewport.width <= 0 || currentViewport.height <= 0) {
      return;
    }

    const fitZoom = Math.min(currentViewport.width / size.viewBox[2], currentViewport.height / size.viewBox[3]) * 0.82;

    if (Number.isFinite(fitZoom) && fitZoom > 0) {
      setZoom(fitZoom);
      setCameraCenter({ x: size.viewBox[0] + size.viewBox[2] / 2, y: size.viewBox[1] + size.viewBox[3] / 2 });
      setViewportRotation(0);
    }
  });

  createEffect(() => {
    activeRoot();
    selectedIds();
    viewportRotation();
    zoom();
    viewportSize();
    useRasterPreview();
    scheduleSelectionBoxUpdate();
  });

  function getHistory(tabId: string): HistoryState {
    const existing = histories.get(tabId);

    if (existing) {
      return existing;
    }

    const created = { past: [], future: [] };
    histories.set(tabId, created);
    return created;
  }

  function bumpHistoryVersion(): void {
    setHistoryVersion((value) => value + 1);
  }

  function updateActiveTab(updater: (tab: EditorTab) => EditorTab): void {
    const id = activeTabId();
    setTabs((items) => items.map((tab) => (tab.id === id ? updater(tab) : tab)));
  }

  function pushHistory(): void {
    const tab = activeTab();

    if (!tab) {
      return;
    }

    const history = getHistory(tab.id);
    history.past.push(cloneRoot(tab.root));
    history.future.length = 0;
    bumpHistoryVersion();
  }

  function commitRoot(nextRoot: SvgElementNode, push = true): void {
    if (push) {
      pushHistory();
    }

    updateActiveTab((tab) => ({
      ...tab,
      root: nextRoot,
      code: serializeRoot(nextRoot, settings().formatter),
      dirty: true,
      parseError: undefined
    }));
  }

  function mutateRoot(updater: (root: SvgElementNode) => SvgElementNode, push = true): void {
    commitRoot(updater(activeRoot()), push);
  }

  function replaceRootWithoutHistory(nextRoot: SvgElementNode, syncCode = true): void {
    updateActiveTab((tab) => ({
      ...tab,
      root: nextRoot,
      code: syncCode ? serializeRoot(nextRoot, settings().formatter) : tab.code,
      dirty: true,
      parseError: undefined
    }));
  }

  function syncActiveRootCode(): void {
    updateActiveTab((tab) => ({
      ...tab,
      code: serializeRoot(tab.root, settings().formatter),
      parseError: undefined
    }));
  }

  function scheduleSelectionBoxUpdate(): void {
    if (selectionBoxFrame !== undefined) {
      window.cancelAnimationFrame(selectionBoxFrame);
    }

    selectionBoxFrame = window.requestAnimationFrame(() => {
      selectionBoxFrame = undefined;
      setSelectionBox(measureSelectionBox(selectedIds()));
    });
  }

  function measureSelectionBox(ids: readonly string[]): Rect | undefined {
    const selected = new Set(ids.filter((id) => id !== activeRoot().id));

    if (selected.size === 0 || useRasterPreview()) {
      return undefined;
    }

    const rects: Rect[] = [];

    for (const element of document.querySelectorAll<SVGGraphicsElement>("[data-node-id]")) {
      const id = element.getAttribute("data-node-id");

      if (!id || !selected.has(id)) {
        continue;
      }

      const clientRect = element.getBoundingClientRect();

      if (clientRect.width <= 0 || clientRect.height <= 0) {
        continue;
      }

      const worldRect = clientRectToWorldRect(clientRect);

      if (worldRect) {
        rects.push(worldRect);
      }
    }

    return unionRects(rects);
  }

  function clientRectToWorldRect(clientRect: DOMRectReadOnly): Rect | undefined {
    return rectFromPoints([
      clientToSvgPoint(clientRect.left, clientRect.top, false),
      clientToSvgPoint(clientRect.right, clientRect.top, false),
      clientToSvgPoint(clientRect.right, clientRect.bottom, false),
      clientToSvgPoint(clientRect.left, clientRect.bottom, false)
    ]);
  }

  function clientRectToOverlayRect(clientRect: Rect): Rect {
    const viewport = canvasSvg()?.parentElement?.getBoundingClientRect();

    if (!viewport) {
      return clientRect;
    }

    return {
      x: clientRect.x - viewport.left,
      y: clientRect.y - viewport.top,
      width: clientRect.width,
      height: clientRect.height
    };
  }

  function keepViewportPreviewAlive(delay = 140): void {
    setTransientViewportPreview(true);

    if (viewportPreviewTimeout !== undefined) {
      window.clearTimeout(viewportPreviewTimeout);
    }

    viewportPreviewTimeout = window.setTimeout(() => {
      viewportPreviewTimeout = undefined;
      setTransientViewportPreview(false);
    }, delay);
  }

  function schedulePanMove(drag: ActivePanDrag, clientX: number, clientY: number): void {
    pendingPanMove = { drag, clientX, clientY };

    if (pendingPanFrame !== undefined) {
      return;
    }

    pendingPanFrame = window.requestAnimationFrame(() => {
      pendingPanFrame = undefined;
      flushPendingPanMove();
    });
  }

  function flushPendingPanMove(): void {
    const pending = pendingPanMove;

    if (!pending) {
      return;
    }

    pendingPanMove = undefined;
    setCameraCenter(centerForClientPoint({ x: pending.drag.startWorldX, y: pending.drag.startWorldY }, pending.clientX, pending.clientY, zoom(), viewportRotation()));
  }

  function scheduleHandleMove(pointerId: number, handle: HandleDescriptor, clientX: number, clientY: number): void {
    pendingHandleMove = { pointerId, handle, clientX, clientY };

    if (pendingHandleFrame !== undefined) {
      return;
    }

    pendingHandleFrame = window.requestAnimationFrame(() => {
      pendingHandleFrame = undefined;
      flushPendingHandleMove();
    });
  }

  function flushPendingHandleMove(): void {
    const pending = pendingHandleMove;

    if (!pending) {
      return;
    }

    pendingHandleMove = undefined;
    const drag = activeDrag();

    if (drag?.type !== "handle" || drag.pointerId !== pending.pointerId) {
      return;
    }

    const point = clientToSvgPoint(pending.clientX, pending.clientY);
    replaceRootWithoutHistory(pending.handle.update(activeRoot(), point.x, point.y), false);
  }

  function centerFrame(): void {
    const size = rootSize();
    const currentViewport = viewportSize();
    const fitZoom = Math.min(currentViewport.width / size.viewBox[2], currentViewport.height / size.viewBox[3]) * 0.86;
    setZoom(Number.isFinite(fitZoom) && fitZoom > 0 ? fitZoom : 1);
    setCameraCenter({ x: size.viewBox[0] + size.viewBox[2] / 2, y: size.viewBox[1] + size.viewBox[3] / 2 });
    setViewportRotation(0);
  }

  function zoomBy(factor: number, origin?: { readonly x: number; readonly y: number }): void {
    const currentZoom = zoom();
    const nextZoom = clamp(currentZoom * factor, 0.125, 512);

    if (!origin) {
      setZoom(nextZoom);
      return;
    }

    const anchor = clientToSvgPoint(origin.x, origin.y, false);
    setZoom(nextZoom);
    setCameraCenter(centerForClientPoint(anchor, origin.x, origin.y, nextZoom, viewportRotation()));
  }

  function rotateViewportBy(delta: number, origin?: { readonly x: number; readonly y: number }): void {
    const nextRotation = viewportRotation() + delta;

    if (!origin) {
      setViewportRotation(nextRotation);
      return;
    }

    const anchor = clientToSvgPoint(origin.x, origin.y, false);
    setViewportRotation(nextRotation);
    setCameraCenter(centerForClientPoint(anchor, origin.x, origin.y, zoom(), nextRotation));
  }

  function clientToSvgPoint(clientX: number, clientY: number, snapToGrid = true): Point {
    const transformed = clientToSvgPointWithCamera(clientX, clientY, cameraCenter(), zoom(), viewportRotation());
    const snap = snapToGrid && settings().snapEnabled ? settings().snapSize : 0;

    if (snap > 0) {
      return {
        x: Math.round(transformed.x / snap) * snap,
        y: Math.round(transformed.y / snap) * snap
      };
    }

    return { x: transformed.x, y: transformed.y };
  }

  function clientToSvgPointWithCamera(clientX: number, clientY: number, center: Point, z: number, rotation: number): Point {
    const offset = clientOffsetFromViewportCenter(clientX, clientY, z);
    const worldOffset = rotatePoint(offset, -rotation);
    return { x: center.x + worldOffset.x, y: center.y + worldOffset.y };
  }

  function centerForClientPoint(worldPoint: Point, clientX: number, clientY: number, z: number, rotation: number): Point {
    const offset = clientOffsetFromViewportCenter(clientX, clientY, z);
    const worldOffset = rotatePoint(offset, -rotation);
    return { x: worldPoint.x - worldOffset.x, y: worldPoint.y - worldOffset.y };
  }

  function clientOffsetFromViewportCenter(clientX: number, clientY: number, z: number): Point {
    const svg = canvasSvg();

    if (!svg) {
      return { x: 0, y: 0 };
    }

    const rect = svg.getBoundingClientRect();

    if (rect.width <= 0 || rect.height <= 0) {
      return { x: 0, y: 0 };
    }

    return {
      x: (clientX - rect.left - rect.width / 2) / z,
      y: (clientY - rect.top - rect.height / 2) / z
    };
  }

  function angleFromViewportCenter(clientX: number, clientY: number): number {
    const svg = canvasSvg();

    if (!svg) {
      return 0;
    }

    const rect = svg.getBoundingClientRect();
    return Math.atan2(clientY - rect.top - rect.height / 2, clientX - rect.left - rect.width / 2);
  }

  function onCanvasWheel(event: WheelEvent): void {
    if (event.shiftKey) {
      event.preventDefault();
      keepViewportPreviewAlive();
      rotateViewportBy(-event.deltaY * 0.005, { x: event.clientX, y: event.clientY });
      return;
    }

    if (settings().useCtrlForZoom && !event.ctrlKey && !event.metaKey) {
      return;
    }

    event.preventDefault();
    keepViewportPreviewAlive();
    zoomBy(event.deltaY < 0 ? Math.SQRT2 : 1 / Math.SQRT2, { x: event.clientX, y: event.clientY });
  }

  function onCanvasPointerDown(event: PointerEvent): void {
    if (event.pointerType === "touch") {
      event.preventDefault();
      setContextMenu(undefined);
      beginTouchPoint(event);
      setPointerCaptureSafely(event.currentTarget as Element, event.pointerId);
      return;
    }

    if (event.altKey) {
      event.preventDefault();
      setContextMenu(undefined);

      if (event.button === 0) {
        startCanvasRotateDrag(event);
        setPointerCaptureSafely(event.currentTarget as Element, event.pointerId);
      }

      return;
    }

    if (event.button === 1) {
      event.preventDefault();
      setContextMenu(undefined);
      startPanDrag(event);
      setPointerCaptureSafely(event.currentTarget as Element, event.pointerId);
      return;
    }

    const target = event.target as Element | null;
    const nodeElement = target?.closest("[data-node-id]");

    if (nodeElement) {
      const nodeId = nodeElement.getAttribute("data-node-id");

      if (nodeId) {
        selectNode(nodeId, event);
      }
      return;
    }

    if (event.button === 0) {
      setContextMenu(undefined);
      startMarqueeDrag(event);
      setPointerCaptureSafely(event.currentTarget as Element, event.pointerId);
      return;
    }
  }

  function onWindowPointerMove(event: PointerEvent): void {
    if (event.pointerType === "touch" && touchPointers.has(event.pointerId)) {
      event.preventDefault();
      touchPointers.set(event.pointerId, pointerEventToTouchPoint(event));
      applyTouchGesture();
      return;
    }

    const drag = activeDrag();

    if (!drag || drag.pointerId !== event.pointerId) {
      return;
    }

    if (drag.type === "pan") {
      schedulePanMove(drag, event.clientX, event.clientY);
      return;
    }

    if (drag.type === "rotate-canvas") {
      setViewportRotation(drag.startRotation + angleFromViewportCenter(event.clientX, event.clientY) - drag.startAngle);
      keepViewportPreviewAlive();
      return;
    }

    if (drag.type === "marquee") {
      updateMarqueeDrag(drag, event.clientX, event.clientY);
      return;
    }

    if (drag.type === "transform-box") {
      updateTransformBoxDrag(drag, event.clientX, event.clientY);
      return;
    }

    if (drag.type === "move-selection") {
      updateMoveSelectionDrag(drag, event.clientX, event.clientY);
      return;
    }

    scheduleHandleMove(event.pointerId, drag.handle, event.clientX, event.clientY);
  }

  function onWindowPointerUp(event: PointerEvent): void {
    if (event.pointerType === "touch" && touchPointers.has(event.pointerId)) {
      finishTouchPoint(event.pointerId);
      return;
    }

    const drag = activeDrag();

    if (drag?.pointerId === event.pointerId) {
      if (drag.type === "pan") {
        if (pendingPanFrame !== undefined) {
          window.cancelAnimationFrame(pendingPanFrame);
          pendingPanFrame = undefined;
        }

        flushPendingPanMove();
        keepViewportPreviewAlive(100);
      } else if (drag.type === "handle") {
        if (pendingHandleFrame !== undefined) {
          window.cancelAnimationFrame(pendingHandleFrame);
          pendingHandleFrame = undefined;
        }

        flushPendingHandleMove();
        syncActiveRootCode();
      } else if (drag.type === "marquee") {
        finishMarqueeDrag(drag, event.clientX, event.clientY);
      } else if (drag.type === "transform-box") {
        syncActiveRootCode();
      } else if (drag.type === "move-selection") {
        if (drag.committed) {
          syncActiveRootCode();
        }
      } else if (drag.type === "rotate-canvas") {
        keepViewportPreviewAlive(100);
      }

      setActiveDrag(undefined);
    }
  }

  function onWindowPointerCancel(event: PointerEvent): void {
    if (event.pointerType === "touch" && touchPointers.has(event.pointerId)) {
      finishTouchPoint(event.pointerId);
      return;
    }

    const drag = activeDrag();

    if (drag?.pointerId === event.pointerId) {
      pendingPanMove = undefined;
      pendingHandleMove = undefined;
      setMarqueeRect(undefined);
      setActiveDrag(undefined);
    }
  }

  function startPanDrag(event: PointerEvent): void {
    const point = clientToSvgPoint(event.clientX, event.clientY);
    setActiveDrag({
      type: "pan",
      pointerId: event.pointerId,
      startWorldX: point.x,
      startWorldY: point.y
    });
  }

  function startCanvasRotateDrag(event: PointerEvent): void {
    setActiveDrag({
      type: "rotate-canvas",
      pointerId: event.pointerId,
      startAngle: angleFromViewportCenter(event.clientX, event.clientY),
      startRotation: viewportRotation()
    });
  }

  function onNodePointerDown(nodeId: string, event: PointerEvent): void {
    if (event.button !== 0) {
      return;
    }

    if (event.shiftKey || event.ctrlKey || event.metaKey) {
      selectNode(nodeId, event);
      return;
    }

    const existing = selectedIds();

    if (existing.includes(nodeId)) {
      startMoveSelectionDrag(event, existing);
      return;
    }

    setSelectedIds([nodeId]);
    setSelectionPivot(nodeId);
    setSelectedPathCommand(undefined);
    startMoveSelectionDrag(event, [nodeId]);
  }

  function startMoveSelectionDrag(event: PointerEvent, ids: readonly string[]): void {
    const selectedElementIds = topLevelSelectedElementIds(activeRoot(), ids);

    if (selectedElementIds.length === 0) {
      return;
    }

    const point = clientToSvgPoint(event.clientX, event.clientY, false);
    setActiveDrag({
      type: "move-selection",
      pointerId: event.pointerId,
      selectedIds: selectedElementIds,
      startRoot: activeRoot(),
      startClientX: event.clientX,
      startClientY: event.clientY,
      startWorldX: point.x,
      startWorldY: point.y,
      committed: false
    });
    setPointerCaptureSafely(event.currentTarget as Element, event.pointerId);
  }

  function updateMoveSelectionDrag(drag: ActiveMoveSelectionDrag, clientX: number, clientY: number): void {
    if (!drag.committed && Math.hypot(clientX - drag.startClientX, clientY - drag.startClientY) < 3) {
      return;
    }

    const nextDrag = drag.committed ? drag : { ...drag, committed: true } satisfies ActiveMoveSelectionDrag;

    if (!drag.committed) {
      pushHistory();
      setActiveDrag(nextDrag);
    }

    const point = clientToSvgPoint(clientX, clientY, false);
    const transform = translateMatrix(point.x - drag.startWorldX, point.y - drag.startWorldY);
    replaceRootWithoutHistory(applyGlobalTransformToSelected(drag.startRoot, drag.selectedIds, transform), false);
  }

  function startMarqueeDrag(event: PointerEvent): void {
    const rect = normalizeClientRect(event.clientX, event.clientY, event.clientX, event.clientY);
    setMarqueeRect(clientRectToOverlayRect(rect));
    setActiveDrag({
      type: "marquee",
      pointerId: event.pointerId,
      startClientX: event.clientX,
      startClientY: event.clientY,
      currentClientX: event.clientX,
      currentClientY: event.clientY,
      mode: settings().dragSelectionMode,
      additive: event.ctrlKey || event.metaKey,
      initialSelection: selectedIds()
    });
  }

  function updateMarqueeDrag(drag: ActiveMarqueeDrag, clientX: number, clientY: number): void {
    const next = { ...drag, currentClientX: clientX, currentClientY: clientY } satisfies ActiveMarqueeDrag;
    setActiveDrag(next);
    setMarqueeRect(clientRectToOverlayRect(normalizeClientRect(drag.startClientX, drag.startClientY, clientX, clientY)));
  }

  function finishMarqueeDrag(drag: ActiveMarqueeDrag, clientX: number, clientY: number): void {
    setMarqueeRect(undefined);

    if (Math.hypot(clientX - drag.startClientX, clientY - drag.startClientY) < 4) {
      clearSelection();
      return;
    }

    const ids = idsInMarquee(normalizeClientRect(drag.startClientX, drag.startClientY, clientX, clientY), drag.mode);
    const nextIds = drag.additive ? mergeSelection(drag.initialSelection, ids) : ids;
    setSelectedIds(nextIds);
    setSelectionPivot(nextIds.at(-1));
    setSelectedPathCommand(undefined);
  }

  function idsInMarquee(rect: Rect, mode: DragSelectionMode): readonly string[] {
    const ids: string[] = [];

    for (const element of document.querySelectorAll<SVGGraphicsElement>("[data-node-id]")) {
      if (!isMarqueeSelectableElement(element)) {
        continue;
      }

      const id = element.getAttribute("data-node-id");

      if (!id) {
        continue;
      }

      const elementRect = element.getBoundingClientRect();

      if (elementRect.width <= 0 || elementRect.height <= 0) {
        continue;
      }

      const selected = mode === "contain" ? clientRectContains(rect, elementRect) : clientRectsIntersect(rect, elementRect);

      if (selected) {
        ids.push(id);
      }
    }

    return ids;
  }

  function isMarqueeSelectableElement(element: Element): boolean {
    return ["path", "circle", "ellipse", "rect", "line", "polygon", "polyline", "text", "image", "use"].includes(element.tagName.toLowerCase());
  }

  function mergeSelection(initial: readonly string[], added: readonly string[]): readonly string[] {
    const ids = new Set(initial);

    for (const id of added) {
      ids.add(id);
    }

    return [...ids];
  }

  function updateTransformBoxDrag(drag: ActiveTransformBoxDrag, clientX: number, clientY: number): void {
    const transform = transformMatrixForBoxDrag(drag, clientX, clientY);
    replaceRootWithoutHistory(applyGlobalTransformToSelected(drag.startRoot, drag.selectedIds, transform), false);
  }

  function transformMatrixForBoxDrag(drag: ActiveTransformBoxDrag, clientX: number, clientY: number): Matrix2D {
    const point = clientToSvgPoint(clientX, clientY, false);
    const center = rectCenter(drag.startBox);

    if (drag.handleKind === "rotate") {
      const angle = Math.atan2(point.y - center.y, point.x - center.x);
      return matrixAround(center, rotateMatrix(angle - drag.startAngle));
    }

    const anchor = anchorForTransformHandle(drag.startBox, drag.handleKind);
    const startPoint = pointForTransformHandle(drag.startBox, drag.handleKind);
    const scaleX = transformHandleChangesX(drag.handleKind) ? clampedScaleRatio(point.x, startPoint.x, anchor.x) : 1;
    const scaleY = transformHandleChangesY(drag.handleKind) ? clampedScaleRatio(point.y, startPoint.y, anchor.y) : 1;

    return matrixAround(anchor, scaleMatrix(scaleX, scaleY));
  }

  function applyGlobalTransformToSelected(root: SvgElementNode, ids: readonly string[], transform: Matrix2D): SvgElementNode {
    const parentTransforms = createParentTransformMap(root);
    let next = root;

    for (const id of ids) {
      const parentTransform = parentTransforms.get(id) ?? identityMatrix;
      const parentInverse = invertMatrix(parentTransform);

      if (!parentInverse) {
        continue;
      }

      next = updateNode(next, id, (node) => {
        if (node.kind !== "element") {
          return node;
        }

        const currentLocal = parseTransformList(getAttribute(node, "transform", true));
        const nextLocal = multiplyMatrices(multiplyMatrices(multiplyMatrices(parentInverse, transform), parentTransform), currentLocal);
        return setAttribute(node, "transform", formatMatrixTransform(nextLocal));
      });
    }

    return next;
  }

  function createParentTransformMap(root: SvgElementNode): ReadonlyMap<string, Matrix2D> {
    const transforms = new Map<string, Matrix2D>([[root.id, identityMatrix]]);

    function visit(node: SvgElementNode, inherited: Matrix2D): void {
      const nodeTransform = multiplyMatrices(inherited, parseTransformList(getAttribute(node, "transform", true)));

      for (const child of node.children) {
        if (child.kind === "element") {
          transforms.set(child.id, nodeTransform);
          visit(child, nodeTransform);
        }
      }
    }

    visit(root, identityMatrix);
    return transforms;
  }

  function topLevelSelectedElementIds(root: SvgElementNode, ids: readonly string[]): readonly string[] {
    const selected = new Set(ids);
    const result: string[] = [];

    function visit(node: SvgNode, hasSelectedAncestor: boolean): void {
      const isSelected = selected.has(node.id);

      if (node.kind === "element" && node.id !== root.id && isSelected && !hasSelectedAncestor) {
        result.push(node.id);
      }

      if (node.kind !== "element") {
        return;
      }

      for (const child of node.children) {
        visit(child, hasSelectedAncestor || isSelected);
      }
    }

    visit(root, false);
    return result;
  }

  function beginTouchPoint(event: PointerEvent): void {
    touchPointers.set(event.pointerId, pointerEventToTouchPoint(event));
    beginTouchGesture();
  }

  function finishTouchPoint(pointerId: number): void {
    touchPointers.delete(pointerId);

    if (touchPointers.size === 0) {
      setActiveTouchGesture(undefined);
      keepViewportPreviewAlive(100);
      return;
    }

    beginTouchGesture();
  }

  function beginTouchGesture(): void {
    const points = Array.from(touchPointers.values()).slice(0, 2);

    if (points.length === 0) {
      setActiveTouchGesture(undefined);
      return;
    }

    const centroid = centroidOfPoints(points);
    const anchor = clientToSvgPoint(centroid.x, centroid.y);
    const pair = firstTwoTouchPoints(points);
    setActiveTouchGesture({
      pointerIds: points.map((point) => point.pointerId),
      startWorldX: anchor.x,
      startWorldY: anchor.y,
      startDistance: pair ? distanceBetween(pair[0], pair[1]) : 0,
      startAngle: pair ? angleBetween(pair[0], pair[1]) : 0,
      startZoom: zoom(),
      startRotation: viewportRotation()
    });
    keepViewportPreviewAlive();
  }

  function applyTouchGesture(): void {
    const gesture = activeTouchGesture();

    if (!gesture) {
      return;
    }

    const points = gesture.pointerIds.map((pointerId) => touchPointers.get(pointerId)).filter((point): point is TouchPoint => Boolean(point));

    if (points.length === 0) {
      setActiveTouchGesture(undefined);
      return;
    }

    const centroid = centroidOfPoints(points);
    let nextZoom = gesture.startZoom;
    let nextRotation = gesture.startRotation;
    const pair = firstTwoTouchPoints(points);

    if (pair && gesture.startDistance > 0) {
      nextZoom = clamp(gesture.startZoom * (distanceBetween(pair[0], pair[1]) / gesture.startDistance), 0.125, 512);
      nextRotation = gesture.startRotation + angleBetween(pair[0], pair[1]) - gesture.startAngle;
    }

    setZoom(nextZoom);
    setViewportRotation(nextRotation);
    setCameraCenter(centerForClientPoint({ x: gesture.startWorldX, y: gesture.startWorldY }, centroid.x, centroid.y, nextZoom, nextRotation));
    keepViewportPreviewAlive();
  }

  function selectNode(nodeId: string, event?: MouseEvent | PointerEvent): void {
    const flattened = flattenAllNodes(activeRoot()).map((node) => node.id);
    const existing = selectedIds();

    if (event?.shiftKey && selectionPivot()) {
      const pivotIndex = flattened.indexOf(selectionPivot() ?? "");
      const currentIndex = flattened.indexOf(nodeId);

      if (pivotIndex !== -1 && currentIndex !== -1) {
        const start = Math.min(pivotIndex, currentIndex);
        const end = Math.max(pivotIndex, currentIndex);
        setSelectedIds(flattened.slice(start, end + 1));
        return;
      }
    }

    if (event?.ctrlKey || event?.metaKey) {
      if (existing.includes(nodeId)) {
        setSelectedIds(existing.filter((id) => id !== nodeId));
      } else {
        setSelectedIds([...existing, nodeId]);
        setSelectionPivot(nodeId);
      }
      return;
    }

    setSelectedIds([nodeId]);
    setSelectionPivot(nodeId);
    setSelectedPathCommand(undefined);
  }

  function clearSelection(): void {
    setSelectedIds([]);
    setSelectionPivot(undefined);
    setSelectedPathCommand(undefined);
  }

  function deleteSelected(): void {
    const ids = selectedIds().filter((id) => id !== activeRoot().id);

    if (ids.length === 0) {
      return;
    }

    mutateRoot((root) => ids.reduce((next, id) => removeNode(next, id), root));
    clearSelection();
  }

  function duplicateSelected(): void {
    const ids = selectedIds().filter((id) => id !== activeRoot().id);

    if (ids.length === 0) {
      return;
    }

    mutateRoot((root) => {
      let next = root;

      for (const id of ids) {
        const node = findNode(next, id);

        if (node) {
          next = insertSibling(next, id, cloneWithFreshIds(node), true);
        }
      }

      return next;
    });
  }

  function moveSelected(direction: -1 | 1): void {
    const ids = selectedIds().filter((id) => id !== activeRoot().id);

    if (ids.length === 0) {
      return;
    }

    mutateRoot((root) => ids.reduce((next, id) => moveNode(next, id, direction), root));
  }

  function selectAll(): void {
    setSelectedIds(flattenAllNodes(activeRoot()).map((node) => node.id));
  }

  function undo(): void {
    const tab = activeTab();

    if (!tab) {
      return;
    }

    const history = getHistory(tab.id);
    const previous = history.past.pop();

    if (!previous) {
      return;
    }

    history.future.push(cloneRoot(tab.root));
    updateActiveTab((item) => ({
      ...item,
      root: previous,
      code: serializeRoot(previous, settings().formatter),
      dirty: true,
      parseError: undefined
    }));
    bumpHistoryVersion();
  }

  function redo(): void {
    const tab = activeTab();

    if (!tab) {
      return;
    }

    const history = getHistory(tab.id);
    const next = history.future.pop();

    if (!next) {
      return;
    }

    history.past.push(cloneRoot(tab.root));
    updateActiveTab((item) => ({
      ...item,
      root: next,
      code: serializeRoot(next, settings().formatter),
      dirty: true,
      parseError: undefined
    }));
    bumpHistoryVersion();
  }

  function addElement(name: RecognizedElement | string): void {
    const selectedElement = selectedNodes().find((node): node is SvgElementNode => node.kind === "element");
    const root = activeRoot();
    const parent = selectedElement && isValidChild(selectedElement.name, name) ? selectedElement : root;
    const child = createDefaultElement(name);
    mutateRoot((item) => appendChild(item, parent.id, child));
    setSelectedIds([child.id]);
  }

  function addTextNode(kind: "text" | "comment" | "cdata"): void {
    const selectedElement = selectedNodes().find((node): node is SvgElementNode => node.kind === "element") ?? activeRoot();
    const text = kind === "comment" ? " Comment " : "";
    const child = { id: createId(), kind, text } satisfies SvgNode;
    mutateRoot((item) => appendChild(item, selectedElement.id, child));
    setSelectedIds([child.id]);
  }

  function updateElementAttribute(nodeId: string, name: string, value: string): void {
    mutateRoot((root) =>
      updateNode(root, nodeId, (node) => {
        if (node.kind !== "element") {
          return node;
        }

        return setAttribute(node, name, value);
      })
    );
  }

  function removeElementAttribute(nodeId: string, name: string): void {
    mutateRoot((root) =>
      updateNode(root, nodeId, (node) => {
        if (node.kind !== "element") {
          return node;
        }

        return removeAttribute(node, name);
      })
    );
  }

  function updateBasicNodeText(nodeId: string, text: string): void {
    mutateRoot((root) =>
      updateNode(root, nodeId, (node) => {
        if (node.kind === "text" || node.kind === "comment" || node.kind === "cdata") {
          return { ...node, text };
        }

        return node;
      })
    );
  }

  function applyCode(text: string): void {
    const parsed = parseSvgMarkup(text);

    updateActiveTab((tab) => {
      if (!parsed.ok) {
        return { ...tab, code: text, parseError: parsed.message, dirty: true };
      }

      clearSelection();
      return {
        ...tab,
        root: parsed.root,
        code: text,
        parseError: undefined,
        dirty: true
      };
    });
  }

  function reformatActiveCode(formatter = settings().formatter): void {
    updateActiveTab((tab) => ({ ...tab, code: serializeRoot(tab.root, formatter), parseError: undefined }));
  }

  function optimizeActive(): void {
    mutateRoot((root) => optimizeNode(root, settings().optimizer) as SvgElementNode);
  }

  function createNewTab(): void {
    const root = createDefaultRoot();
    const tab = {
      id: createId(),
      name: "Untitled.svg",
      root,
      code: serializeRoot(root, settings().formatter),
      dirty: false,
      parseError: undefined
    } satisfies EditorTab;
    setTabs((items) => [...items, tab]);
    setActiveTabId(tab.id);
    clearSelection();
    centerFrame();
  }

  function closeTab(tabId: string): void {
    const items = tabs();

    if (items.length <= 1) {
      createNewTab();
    }

    setTabs((current) => current.filter((tab) => tab.id !== tabId));
    histories.delete(tabId);

    if (activeTabId() === tabId) {
      const next = items.find((tab) => tab.id !== tabId);

      if (next) {
        setActiveTabId(next.id);
      }
    }
  }

  function downloadSvg(): void {
    downloadBlob(exportText(), activeTab()?.name ?? "image.svg", "image/svg+xml");
    updateActiveTab((tab) => ({ ...tab, dirty: false }));
  }

  async function copySvgText(): Promise<void> {
    await navigator.clipboard.writeText(exportText());
  }

  function openImportDialog(): void {
    importInputRef?.click();
  }

  function openReferenceDialog(): void {
    referenceInputRef?.click();
  }

  async function onImportFile(event: Event): Promise<void> {
    const input = event.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    input.value = "";

    await importSvgFile(file);
  }

  async function importSvgFile(file: File | undefined): Promise<void> {
    if (!file) {
      return;
    }

    const text = await file.text();
    importSvgText(text, file.name);
  }

  function importSvgText(text: string, name: string): void {
    const parsed = parseSvgMarkup(text);

    if (!parsed.ok) {
      updateActiveTab((tab) => ({ ...tab, code: text, parseError: parsed.message }));
      setActivePanel("code");
      return;
    }

    const tab = {
      id: createId(),
      name,
      root: parsed.root,
      code: serializeRoot(parsed.root, settings().formatter),
      dirty: false,
      parseError: undefined
    } satisfies EditorTab;

    setTabs((items) => [...items, tab]);
    setActiveTabId(tab.id);
    clearSelection();
    centerFrame();
  }

  async function importDroppedSvg(dataTransfer: DataTransfer): Promise<void> {
    const file = Array.from(dataTransfer.files).find((item) => item.type === "image/svg+xml" || item.name.toLowerCase().endsWith(".svg"));

    if (file) {
      await importSvgFile(file);
      return;
    }

    const text = dataTransfer.getData("text/plain").trim();

    if (text.startsWith("<svg") || text.includes("<svg")) {
      importSvgText(text, "Dropped.svg");
    }
  }

  function onReferenceFile(event: Event): void {
    const input = event.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    input.value = "";

    if (!file) {
      return;
    }

    const previous = referenceImage();

    if (previous) {
      URL.revokeObjectURL(previous);
    }

    setReferenceImage(URL.createObjectURL(file));
    setShowReference(true);
  }

  function onKeyDown(event: KeyboardEvent): void {
    const target = event.target as HTMLElement | null;
    const editing = target?.matches("input, textarea, select, [contenteditable='true']") ?? false;
    const control = event.ctrlKey || event.metaKey;

    if (control && event.key.toLowerCase() === "z" && event.shiftKey) {
      event.preventDefault();
      redo();
      return;
    }

    if (control && event.key.toLowerCase() === "z") {
      event.preventDefault();
      undo();
      return;
    }

    if (control && event.key.toLowerCase() === "s") {
      event.preventDefault();
      downloadSvg();
      return;
    }

    if (control && event.key.toLowerCase() === "o") {
      event.preventDefault();
      openImportDialog();
      return;
    }

    if (control && event.key.toLowerCase() === "e") {
      event.preventDefault();
      setModal("export");
      return;
    }

    if (control && event.key.toLowerCase() === "n") {
      event.preventDefault();
      createNewTab();
      return;
    }

    if (control && event.key === ",") {
      event.preventDefault();
      setModal("settings");
      return;
    }

    if (control && event.key === "=") {
      event.preventDefault();
      zoomBy(Math.SQRT2);
      return;
    }

    if (control && event.key === "-") {
      event.preventDefault();
      zoomBy(1 / Math.SQRT2);
      return;
    }

    if (control && event.key === "0") {
      event.preventDefault();
      centerFrame();
      return;
    }

    if (control && event.key.toLowerCase() === "g") {
      event.preventDefault();
      setSettings((current) => ({ ...current, showGrid: !current.showGrid }));
      return;
    }

    if (control && event.key.toLowerCase() === "h") {
      event.preventDefault();
      setSettings((current) => ({ ...current, showHandles: !current.showHandles }));
      return;
    }

    if (editing) {
      return;
    }

    if (control && event.key.toLowerCase() === "a") {
      event.preventDefault();
      selectAll();
      return;
    }

    if (control && event.key.toLowerCase() === "d") {
      event.preventDefault();
      duplicateSelected();
      return;
    }

    if (event.key === "Delete" || event.key === "Backspace") {
      event.preventDefault();
      deleteSelected();
      return;
    }

    if (event.altKey && event.key === "ArrowUp") {
      event.preventDefault();
      moveSelected(-1);
      return;
    }

    if (event.altKey && event.key === "ArrowDown") {
      event.preventDefault();
      moveSelected(1);
      return;
    }

    if (pathCommandLetters.map((letter) => letter.toLowerCase()).includes(event.key.toLowerCase())) {
      insertPathCommandFromKey(event.key, event.shiftKey);
    }
  }

  function insertPathCommandFromKey(key: string, absolute: boolean): void {
    const selected = selectedPathCommand();

    if (!selected) {
      return;
    }

    const command = absolute ? key.toUpperCase() : key.toLowerCase();
    mutateRoot((root) =>
      updateNode(root, selected.nodeId, (node) => {
        if (node.kind !== "element") {
          return node;
        }

        const commands = parsePathData(getAttribute(node, "d", true));
        const nextCommands = insertPathCommand(commands, selected.index, command);
        return setAttribute(node, "d", formatPathData(nextCommands));
      })
    );
    setSelectedPathCommand({ nodeId: selected.nodeId, index: selected.index + 1 });
  }

  function openContextMenu(event: MouseEvent, nodeId: string): void {
    event.preventDefault();
    selectNode(nodeId, event);
    setContextMenu({ x: event.clientX, y: event.clientY, nodeId });
  }

  function runContextAction(action: "duplicate" | "delete" | "move-up" | "move-down" | "insert-after"): void {
    const menu = contextMenu();

    if (!menu) {
      return;
    }

    setContextMenu(undefined);

    if (action === "duplicate") {
      duplicateSelected();
    } else if (action === "delete") {
      deleteSelected();
    } else if (action === "move-up") {
      moveSelected(-1);
    } else if (action === "move-down") {
      moveSelected(1);
    } else {
      mutateRoot((root) => insertSibling(root, menu.nodeId, createDefaultElement("g"), true));
    }
  }

  return (
    <div
      class="app-root"
      classList={{ "theme-light": settings().themePreset === "light", "theme-black": settings().themePreset === "black", "theme-gray": settings().themePreset === "gray", "svg-drop-active": isSvgDropActive() }}
      style={themeVars()}
      onDragEnter={(event) => {
        if (hasSvgDrag(event)) {
          event.preventDefault();
          setIsSvgDropActive(true);
        }
      }}
      onDragOver={(event) => {
        if (hasSvgDrag(event)) {
          event.preventDefault();
          const transfer = event.dataTransfer;

          if (transfer) {
            transfer.dropEffect = "copy";
          }

          setIsSvgDropActive(true);
        }
      }}
      onDragLeave={(event) => {
        if (event.currentTarget === event.target) {
          setIsSvgDropActive(false);
        }
      }}
      onDrop={(event) => {
        event.preventDefault();
        setIsSvgDropActive(false);

        const transfer = event.dataTransfer;

        if (transfer) {
          void importDroppedSvg(transfer);
        }
      }}
    >
      <input ref={importInputRef} class="hidden-input" type="file" name="svg-import" aria-label="Import SVG" accept=".svg,image/svg+xml,text/xml" onChange={(event) => void onImportFile(event)} />
      <input ref={referenceInputRef} class="hidden-input" type="file" name="reference-import" aria-label="Import reference image" accept="image/*" onChange={onReferenceFile} />
      <TopBar
        activeTab={activeTab}
        tabs={tabs}
        fileSize={fileSize}
        canUndo={canUndo}
        canRedo={canRedo}
        setActiveTabId={setActiveTabId}
        activeTabId={activeTabId}
        closeTab={closeTab}
        createNewTab={createNewTab}
        openImportDialog={openImportDialog}
        downloadSvg={downloadSvg}
        copySvgText={() => void copySvgText()}
        undo={undo}
        redo={redo}
        optimizeActive={optimizeActive}
        openExport={() => setModal("export")}
        openSettings={() => setModal("settings")}
        openAbout={() => setModal("about")}
        openDonate={() => setModal("donate")}
        openShortcuts={() => setModal("shortcuts")}
      />

      <div class="workspace">
        <aside class="left-workbench" style={{ width: `${leftWidth()}px` }}>
          <PanelTabs activePanel={activePanel} setActivePanel={setActivePanel} />
          <Show when={activePanel() === "inspector"}>
            <InspectorPanel
              root={activeRoot}
              selectedIds={selectedIds}
              selectedPathCommand={selectedPathCommand}
              setSelectedPathCommand={setSelectedPathCommand}
              selectNode={selectNode}
              clearSelection={clearSelection}
              addElement={addElement}
              addTextNode={addTextNode}
              updateElementAttribute={updateElementAttribute}
              removeElementAttribute={removeElementAttribute}
              updateBasicNodeText={updateBasicNodeText}
              openContextMenu={openContextMenu}
            />
          </Show>
          <Show when={activePanel() === "code"}>
            <CodePanel
              code={activeCode}
              parseError={() => activeTab()?.parseError}
              applyCode={applyCode}
              reformatPretty={() => reformatActiveCode(settings().formatter)}
              reformatCompact={() => reformatActiveCode(settings().exportFormatter)}
              copySvgText={() => void copySvgText()}
            />
          </Show>
          <Show when={activePanel() === "previews"}>
            <PreviewsPanel root={activeRoot} selectedNodes={selectedNodes} exportText={exportText} />
          </Show>
          <Show when={activePanel() === "debug"}>
            <DebugPanel root={activeRoot} selectedNodes={selectedNodes} elementCount={elementCount} exportText={exportText} />
          </Show>
        </aside>
        <button
          class="splitter"
          type="button"
          aria-label="Resize sidebar"
          onPointerDown={(event) => {
            leftResizeStart = { x: event.clientX, width: leftWidth() };
            setPointerCaptureSafely(event.currentTarget, event.pointerId);
          }}
          onPointerMove={(event) => {
            if (!leftResizeStart) {
              return;
            }

            setLeftWidth(clamp(leftResizeStart.width + event.clientX - leftResizeStart.x, 320, 720));
          }}
          onPointerUp={() => {
            leftResizeStart = undefined;
          }}
        />
        <main class="viewport-column">
          <ViewportToolbar
            settings={settings}
            setSettings={setSettings}
            zoom={zoom}
            zoomBy={zoomBy}
            centerFrame={centerFrame}
            openReferenceDialog={openReferenceDialog}
            hasReference={() => Boolean(referenceImage())}
            showReference={showReference}
            setShowReference={setShowReference}
            overlayReference={overlayReference}
            setOverlayReference={setOverlayReference}
            dragSelectionMode={() => settings().dragSelectionMode}
            setDragSelectionMode={(mode) => setSettings((current) => ({ ...current, dragSelectionMode: mode }))}
            clearReference={() => {
              const current = referenceImage();

              if (current) {
                URL.revokeObjectURL(current);
              }

              setReferenceImage(undefined);
            }}
          />
          <div class="viewport-shell">
            <svg
              ref={setCanvasSvg}
              class="viewport-svg"
              viewBox={`${viewRect().x} ${viewRect().y} ${viewRect().width} ${viewRect().height}`}
              onWheel={onCanvasWheel}
              onPointerDown={onCanvasPointerDown}
              onContextMenu={(event) => event.preventDefault()}
            >
              <defs>
                <pattern id="checkerboard" patternUnits="userSpaceOnUse" width="96" height="96">
                  <rect width="96" height="96" fill="#5c6070" opacity="0.38" />
                  <rect width="48" height="48" fill="#d4d7df" opacity="0.23" />
                  <rect x="48" y="48" width="48" height="48" fill="#d4d7df" opacity="0.23" />
                </pattern>
              </defs>
              <rect x={viewRect().x} y={viewRect().y} width={viewRect().width} height={viewRect().height} fill="var(--canvas)" />
              <g transform={viewportTransform()}>
                <Show when={settings().showGrid}>
                  <GridLayer viewRect={gridViewRect} zoom={zoom} color={() => settings().gridColor} moving={viewportIsMoving} />
                </Show>
                <rect
                  x={rootSize().viewBox[0]}
                  y={rootSize().viewBox[1]}
                  width={rootSize().viewBox[2]}
                  height={rootSize().viewBox[3]}
                  fill="url(#checkerboard)"
                  stroke="#7d8596"
                  stroke-width={1 / Math.max(zoom(), 0.001)}
                />
                <Show when={referenceImage() && showReference() && !overlayReference()}>
                  <image href={referenceImage()} x={rootSize().viewBox[0]} y={rootSize().viewBox[1]} width={rootSize().viewBox[2]} height={rootSize().viewBox[3]} opacity="0.62" preserveAspectRatio="xMidYMid meet" />
                </Show>
                <Show
                  when={useRasterPreview() ? rasterPreviewUrl() : undefined}
                  fallback={
                    <g classList={{ rasterized: settings().viewRasterized }}>
                      <For each={activeRoot().children}>{(node) => <SvgNodeView node={node} selectedIds={selectedIds} onNodePointerDown={onNodePointerDown} openContextMenu={openContextMenu} />}</For>
                    </g>
                  }
                >
                  {(href) => (
                    <image
                      class="viewport-raster-preview"
                      href={href()}
                      x={rasterPreviewRect().x}
                      y={rasterPreviewRect().y}
                      width={rasterPreviewRect().width}
                      height={rasterPreviewRect().height}
                      preserveAspectRatio="xMidYMid meet"
                    />
                  )}
                </Show>
                <Show when={referenceImage() && showReference() && overlayReference()}>
                  <image href={referenceImage()} x={rootSize().viewBox[0]} y={rootSize().viewBox[1]} width={rootSize().viewBox[2]} height={rootSize().viewBox[3]} opacity="0.46" preserveAspectRatio="xMidYMid meet" />
                </Show>
                <Show when={settings().showHandles}>
                  <HandlesLayer handles={handles} zoom={zoom} onHandlePointerDown={startHandleDrag} />
                  <TransformBoxLayer box={selectionBox} zoom={zoom} onHandlePointerDown={startTransformBoxDrag} />
                </Show>
              </g>
            </svg>
            <Show when={marqueeRect()}>
              {(rect) => (
                <div
                  class="selection-marquee"
                  style={{
                    left: `${rect().x}px`,
                    top: `${rect().y}px`,
                    width: `${rect().width}px`,
                    height: `${rect().height}px`
                  }}
                />
              )}
            </Show>
          </div>
        </main>
      </div>

      <Show when={contextMenu()}>
        {(menu) => (
          <div class="context-menu" style={{ left: `${menu().x}px`, top: `${menu().y}px` }}>
            <button type="button" onClick={() => runContextAction("duplicate")}>
              <img src="/assets/icons/Duplicate.svg" alt="" /> Duplicate
            </button>
            <button type="button" onClick={() => runContextAction("move-up")}>
              <img src="/assets/icons/MoveUp.svg" alt="" /> Move up
            </button>
            <button type="button" onClick={() => runContextAction("move-down")}>
              <img src="/assets/icons/MoveDown.svg" alt="" /> Move down
            </button>
            <button type="button" onClick={() => runContextAction("insert-after")}>
              <img src="/assets/icons/InsertAfter.svg" alt="" /> Insert group after
            </button>
            <button type="button" onClick={() => runContextAction("delete")}>
              <img src="/assets/icons/Delete.svg" alt="" /> Delete
            </button>
          </div>
        )}
      </Show>

      <Show when={modal() === "settings"}>
        <SettingsModal settings={settings} setSettings={setSettings} close={() => setModal(undefined)} reformatActiveCode={reformatActiveCode} />
      </Show>
      <Show when={modal() === "export"}>
        <ExportModal root={activeRoot} exportText={exportText} close={() => setModal(undefined)} />
      </Show>
      <Show when={modal() === "about"}>
        <AboutModal close={() => setModal(undefined)} />
      </Show>
      <Show when={modal() === "donate"}>
        <DonateModal close={() => setModal(undefined)} />
      </Show>
      <Show when={modal() === "shortcuts"}>
        <ShortcutsModal close={() => setModal(undefined)} />
      </Show>
      <Show when={isSvgDropActive()}>
        <div class="svg-drop-overlay">
          <img src="/assets/icons/Import.svg" alt="" />
          <span>Drop SVG to import</span>
        </div>
      </Show>
    </div>
  );

  function startHandleDrag(event: PointerEvent, handle: HandleDescriptor): void {
    if (event.pointerType === "touch" || event.button !== 0) {
      return;
    }

    event.stopPropagation();
    pushHistory();
    setActiveDrag({
      type: "handle",
      pointerId: event.pointerId,
      handle
    });
    setPointerCaptureSafely(event.currentTarget as Element, event.pointerId);
  }

  function startTransformBoxDrag(event: PointerEvent, handle: TransformBoxHandleDescriptor): void {
    if (event.pointerType === "touch" || event.button !== 0) {
      return;
    }

    const box = selectionBox();
    const ids = topLevelSelectedElementIds(activeRoot(), selectedIds());

    if (!box || ids.length === 0) {
      return;
    }

    event.stopPropagation();
    pushHistory();
    const center = rectCenter(box);
    const point = clientToSvgPoint(event.clientX, event.clientY, false);
    setActiveDrag({
      type: "transform-box",
      pointerId: event.pointerId,
      handleKind: handle.kind,
      selectedIds: ids,
      startRoot: activeRoot(),
      startBox: box,
      startAngle: Math.atan2(point.y - center.y, point.x - center.x)
    });
    setPointerCaptureSafely(event.currentTarget as Element, event.pointerId);
  }
}

export default App;

function sameSvgSize(previous: SvgSize, next: SvgSize): boolean {
  return previous.width === next.width && previous.height === next.height && previous.viewBox.every((value, index) => value === next.viewBox[index]);
}

function createRotatedGridRect(rect: ViewRect, rotation: number): ViewRect {
  if (Math.abs(rotation) < 0.0001) {
    return rect;
  }

  const size = Math.hypot(rect.width, rect.height);

  return {
    x: rect.x + rect.width / 2 - size / 2,
    y: rect.y + rect.height / 2 - size / 2,
    width: size,
    height: size
  };
}

function createRasterPreviewRect(size: SvgSize): ViewRect {
  const [x, y, width, height] = size.viewBox;
  const padding = Math.max(width, height, 1);

  return {
    x: x - padding,
    y: y - padding,
    width: width + padding * 2,
    height: height + padding * 2
  };
}

function normalizeClientRect(startX: number, startY: number, endX: number, endY: number): Rect {
  const x = Math.min(startX, endX);
  const y = Math.min(startY, endY);
  return {
    x,
    y,
    width: Math.abs(endX - startX),
    height: Math.abs(endY - startY)
  };
}

function clientRectContains(selection: Rect, element: DOMRectReadOnly): boolean {
  return element.left >= selection.x && element.right <= selection.x + selection.width && element.top >= selection.y && element.bottom <= selection.y + selection.height;
}

function clientRectsIntersect(selection: Rect, element: DOMRectReadOnly): boolean {
  return element.right >= selection.x && element.left <= selection.x + selection.width && element.bottom >= selection.y && element.top <= selection.y + selection.height;
}

function pointForTransformHandle(box: Rect, kind: TransformBoxHandleKind): Point {
  const center = rectCenter(box);
  const left = box.x;
  const right = box.x + box.width;
  const top = box.y;
  const bottom = box.y + box.height;

  switch (kind) {
    case "nw":
      return { x: left, y: top };
    case "n":
      return { x: center.x, y: top };
    case "ne":
      return { x: right, y: top };
    case "e":
      return { x: right, y: center.y };
    case "se":
      return { x: right, y: bottom };
    case "s":
      return { x: center.x, y: bottom };
    case "sw":
      return { x: left, y: bottom };
    case "w":
      return { x: left, y: center.y };
    case "rotate":
      return { x: center.x, y: top };
  }
}

function anchorForTransformHandle(box: Rect, kind: TransformBoxHandleKind): Point {
  const center = rectCenter(box);
  const left = box.x;
  const right = box.x + box.width;
  const top = box.y;
  const bottom = box.y + box.height;

  switch (kind) {
    case "nw":
      return { x: right, y: bottom };
    case "n":
      return { x: center.x, y: bottom };
    case "ne":
      return { x: left, y: bottom };
    case "e":
      return { x: left, y: center.y };
    case "se":
      return { x: left, y: top };
    case "s":
      return { x: center.x, y: top };
    case "sw":
      return { x: right, y: top };
    case "w":
      return { x: right, y: center.y };
    case "rotate":
      return center;
  }
}

function transformHandleChangesX(kind: TransformBoxHandleKind): boolean {
  return kind === "nw" || kind === "ne" || kind === "e" || kind === "se" || kind === "sw" || kind === "w";
}

function transformHandleChangesY(kind: TransformBoxHandleKind): boolean {
  return kind === "nw" || kind === "n" || kind === "ne" || kind === "se" || kind === "s" || kind === "sw";
}

function clampedScaleRatio(current: number, start: number, anchor: number): number {
  const denominator = start - anchor;

  if (Math.abs(denominator) < 0.0001) {
    return 1;
  }

  return clamp((current - anchor) / denominator, 0.02, 50);
}

function setPointerCaptureSafely(element: Element, pointerId: number): void {
  try {
    element.setPointerCapture(pointerId);
  } catch {
    // Synthetic pointer events in tests do not always create an active pointer.
  }
}

function pointerEventToTouchPoint(event: PointerEvent): TouchPoint {
  return { pointerId: event.pointerId, clientX: event.clientX, clientY: event.clientY };
}

function centroidOfPoints(points: readonly TouchPoint[]): Point {
  const total = points.reduce((sum, point) => ({ x: sum.x + point.clientX, y: sum.y + point.clientY }), { x: 0, y: 0 });
  return { x: total.x / points.length, y: total.y / points.length };
}

function distanceBetween(first: TouchPoint, second: TouchPoint): number {
  return Math.hypot(second.clientX - first.clientX, second.clientY - first.clientY);
}

function angleBetween(first: TouchPoint, second: TouchPoint): number {
  return Math.atan2(second.clientY - first.clientY, second.clientX - first.clientX);
}

function firstTwoTouchPoints(points: readonly TouchPoint[]): readonly [TouchPoint, TouchPoint] | undefined {
  const first = points[0];
  const second = points[1];
  return first && second ? [first, second] : undefined;
}

function rotatePoint(point: Point, radians: number): Point {
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  return {
    x: point.x * cos - point.y * sin,
    y: point.x * sin + point.y * cos
  };
}

function createRasterPreviewRoot(root: SvgElementNode, rect: ViewRect): SvgElementNode {
  const xmlns = getAttribute(root, "xmlns", true) || "http://www.w3.org/2000/svg";
  let next = setAttribute(root, "xmlns", xmlns);
  next = setAttribute(next, "viewBox", `${formatPreviewNumber(rect.x)} ${formatPreviewNumber(rect.y)} ${formatPreviewNumber(rect.width)} ${formatPreviewNumber(rect.height)}`);
  next = setAttribute(next, "width", formatPreviewNumber(rect.width));
  next = setAttribute(next, "height", formatPreviewNumber(rect.height));
  return next;
}

function formatPreviewNumber(value: number): string {
  const rounded = Math.round(value * 1000) / 1000;
  return Object.is(rounded, -0) ? "0" : String(rounded);
}
