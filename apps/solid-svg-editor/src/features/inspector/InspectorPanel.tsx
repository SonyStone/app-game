import { createEffect, createMemo, createSignal, For, Index, onCleanup, onMount, Show, type Accessor } from "solid-js";

import {
  attributeEnumValues,
  colorAttributesWithCurrentColorAllowed,
  colorAttributesWithNoneAllowed,
  colorAttributesWithUrlAllowed,
  getAttributeDefault,
  getAttributeType,
  iconForElement,
  iconForNode,
  isAttributeRecognized,
  isRecognizedElement,
  isValidChild,
  type RecognizedElement
} from "../../svg-db";
import {
  addPoint,
  commandParameters,
  convertCommand,
  createCommand,
  deleteCommand,
  deletePoint,
  formatPathData,
  formatPoints,
  pathCommandLetters,
  parsePathData,
  parsePoints,
  toggleRelative,
  updateCommandValue,
  updatePoint,
  type PathCommand
} from "../../path-data";
import { findNode, findParent, getAttribute, nodeLabel, type DropPosition, type SvgAttribute, type SvgElementNode, type SvgNode } from "../../svg-model";
import {
  clampNumericAttribute,
  estimateInspectorRowHeight,
  flattenInspectorRows,
  insertPathCommand,
  normalizeColorInput,
  orderedAttributes
} from "../../editor/tree-utils";
import { parseTransformList } from "../../editor/geometry";
import type { InspectorRow, VirtualInspectorRow } from "../../editor/types";

type InspectorDropTarget = {
  readonly nodeId: string;
  readonly position: DropPosition;
  readonly valid: boolean;
};

export function InspectorPanel(props: {
  readonly root: () => SvgElementNode;
  readonly selectedIds: () => readonly string[];
  readonly selectedPathCommand: () => { readonly nodeId: string; readonly index: number } | undefined;
  readonly setSelectedPathCommand: (selection: { readonly nodeId: string; readonly index: number } | undefined) => void;
  readonly selectNode: (id: string, event?: MouseEvent | PointerEvent) => void;
  readonly clearSelection: () => void;
  readonly addElement: (name: RecognizedElement | string) => void;
  readonly addTextNode: (kind: "text" | "comment" | "cdata") => void;
  readonly updateElementAttribute: (nodeId: string, name: string, value: string) => void;
  readonly removeElementAttribute: (nodeId: string, name: string) => void;
  readonly updateBasicNodeText: (nodeId: string, text: string) => void;
  readonly openContextMenu: (event: MouseEvent, nodeId: string) => void;
  readonly reorderNodes: (nodeIds: readonly string[], targetId: string, position: DropPosition) => void;
}) {
  const [addOpen, setAddOpen] = createSignal(false);
  const [scrollTop, setScrollTop] = createSignal(0);
  const [viewportHeight, setViewportHeight] = createSignal(0);
  const [heightVersion, setHeightVersion] = createSignal(0);
  const [draggingIds, setDraggingIds] = createSignal<readonly string[]>([]);
  const [dropTarget, setDropTarget] = createSignal<InspectorDropTarget>();
  const [dragPreviewPoint, setDragPreviewPoint] = createSignal<{ readonly x: number; readonly y: number }>();
  const rowHeights = new Map<string, number>();
  const estimatedRowHeights = new Map<string, { readonly node: SvgNode; readonly height: number }>();
  const virtualRowCache = new Map<string, VirtualInspectorRow>();
  let scrollerRef: HTMLDivElement | undefined;
  let virtualSpacerRef: HTMLDivElement | undefined;
  let suppressNextSelectionScroll = false;

  const rows = createMemo((previous: readonly InspectorRow[] | undefined) => flattenInspectorRows(props.root(), previous), [] as readonly InspectorRow[]);
  const virtualLayout = createMemo(() => {
    heightVersion();
    const currentRows = rows();
    const tops: number[] = [];
    const heights: number[] = [];
    let totalHeight = 0;

    for (const row of currentRows) {
      const height = rowHeights.get(row.node.id) ?? cachedEstimatedRowHeight(row.node);
      tops.push(totalHeight);
      heights.push(height);
      totalHeight += height + 4;
    }

    return { rows: currentRows, tops, heights, totalHeight };
  });
  const visibleWindow = createMemo(() => {
    const layout = virtualLayout();
    const virtualTop = Math.max(0, scrollTop() - (virtualSpacerRef?.offsetTop ?? 0));
    const startY = Math.max(0, virtualTop - 900);
    const endY = virtualTop + viewportHeight() + 900;
    let startIndex = 0;
    let endIndex = layout.rows.length;

    for (let index = 0; index < layout.rows.length; index += 1) {
      const top = layout.tops[index] ?? 0;
      const height = layout.heights[index] ?? 0;

      if (top + height >= startY) {
        startIndex = index;
        break;
      }
    }

    for (let index = startIndex; index < layout.rows.length; index += 1) {
      const top = layout.tops[index] ?? 0;

      if (top > endY) {
        endIndex = index + 1;
        break;
      }
    }

    const topAfterEnd = endIndex >= layout.rows.length ? layout.totalHeight : layout.tops[endIndex] ?? layout.totalHeight;
    const activeIds = new Set(layout.rows.map((row) => row.node.id));
    const visibleRows = layout.rows.slice(startIndex, endIndex).map((row, offset) => {
      const index = startIndex + offset;
      const top = layout.tops[index] ?? 0;
      const cached = virtualRowCache.get(row.node.id);

      if (cached && cached.node === row.node && cached.depth === row.depth && cached.index === index && cached.top === top) {
        return cached;
      }

      const next = { ...row, index, top } satisfies VirtualInspectorRow;
      virtualRowCache.set(row.node.id, next);
      return next;
    });

    for (const id of virtualRowCache.keys()) {
      if (!activeIds.has(id)) {
        virtualRowCache.delete(id);
      }
    }

    for (const id of estimatedRowHeights.keys()) {
      if (!activeIds.has(id)) {
        estimatedRowHeights.delete(id);
      }
    }

    return {
      rows: visibleRows,
      paddingTop: layout.tops[startIndex] ?? 0,
      paddingBottom: Math.max(0, layout.totalHeight - topAfterEnd),
      totalHeight: layout.totalHeight
    };
  });
  const virtualSpacerHeight = createMemo(() => visibleWindow().totalHeight + Math.max(0, viewportHeight() - 24));
  const dragPreviewNodes = createMemo(() =>
    draggingIds()
      .map((id) => findNode(props.root(), id))
      .filter((node): node is SvgNode => Boolean(node))
  );

  onMount(() => {
    const scroller = scrollerRef;

    if (!scroller) {
      return;
    }

    setViewportHeight(scroller.clientHeight);
    const observer = new ResizeObserver(() => setViewportHeight(scroller.clientHeight));
    observer.observe(scroller);
    onCleanup(() => observer.disconnect());
  });

  createEffect(() => {
    const ids = props.selectedIds();
    const selectedId = ids.at(-1);

    if (!selectedId) {
      return;
    }

    if (suppressNextSelectionScroll) {
      suppressNextSelectionScroll = false;
      return;
    }

    queueMicrotask(() => {
      scrollRowToTop(selectedId);
      requestAnimationFrame(() => {
        scrollRowToTop(selectedId);
        alignMountedRowToTop(selectedId);
        requestAnimationFrame(() => alignMountedRowToTop(selectedId));
      });
    });
  });

  function measureRow(id: string, height: number): void {
    if (Math.abs((rowHeights.get(id) ?? 0) - height) < 1) {
      return;
    }

    rowHeights.set(id, height);
    estimatedRowHeights.delete(id);
    setHeightVersion((version) => version + 1);
  }

  function cachedEstimatedRowHeight(node: SvgNode): number {
    const cached = estimatedRowHeights.get(node.id);

    if (cached?.node === node) {
      return cached.height;
    }

    const height = estimateInspectorRowHeight(node);
    estimatedRowHeights.set(node.id, { node, height });
    return height;
  }

  function scrollRowToTop(id: string): void {
    const scroller = scrollerRef;

    if (!scroller) {
      return;
    }

    if (id === props.root().id) {
      scroller.scrollTo({ top: 0 });
      setScrollTop(0);
      return;
    }

    const layout = virtualLayout();
    let rowIndex = layout.rows.findIndex((row) => row.node.id === id);

    if (rowIndex === -1) {
      rowIndex = layout.rows.findIndex((row) => row.node.kind === "element" && nodeContainsId(row.node, id));
    }

    if (rowIndex === -1) {
      return;
    }

    const rowTop = layout.tops[rowIndex] ?? 0;
    const spacerTop = virtualSpacerRef?.offsetTop ?? 0;
    const nextScrollTop = Math.max(0, spacerTop + rowTop);
    const currentScrollTop = scroller.scrollTop;

    if (Math.abs(nextScrollTop - currentScrollTop) < 1) {
      return;
    }

    scroller.scrollTo({ top: nextScrollTop });
    setScrollTop(nextScrollTop);
  }

  function selectNodeFromInspector(id: string, event?: MouseEvent | PointerEvent): void {
    suppressNextSelectionScroll = true;
    props.selectNode(id, event);
    queueMicrotask(() => {
      suppressNextSelectionScroll = false;
    });
  }

  function openContextMenuFromInspector(event: MouseEvent, nodeId: string): void {
    suppressNextSelectionScroll = true;
    props.openContextMenu(event, nodeId);
    queueMicrotask(() => {
      suppressNextSelectionScroll = false;
    });
  }

  function alignMountedRowToTop(id: string): void {
    const scroller = scrollerRef;

    if (!scroller) {
      return;
    }

    const card = findMountedInspectorCard(scroller, id);

    if (!card) {
      return;
    }

    const offset = card.getBoundingClientRect().top - scroller.getBoundingClientRect().top;

    if (Math.abs(offset) < 1) {
      return;
    }

    const nextScrollTop = Math.max(0, scroller.scrollTop + offset);

    if (Math.abs(nextScrollTop - scroller.scrollTop) < 1) {
      return;
    }

    scroller.scrollTo({ top: nextScrollTop });
    setScrollTop(nextScrollTop);
  }

  function resetInspectorDrag(): void {
    setDraggingIds([]);
    setDropTarget(undefined);
    setDragPreviewPoint(undefined);
  }

  function dragIdsForNode(nodeId: string): readonly string[] {
    const selected = props.selectedIds().filter((id) => id !== props.root().id);
    return selected.includes(nodeId) ? selected : [nodeId];
  }

  function updateDragPoint(event: DragEvent): void {
    setDragPreviewPoint({ x: event.clientX, y: event.clientY });
  }

  function startInspectorDrag(nodeId: string, event: DragEvent): void {
    const ids = dragIdsForNode(nodeId);

    if (ids.length === 0) {
      event.preventDefault();
      return;
    }

    selectNodeFromInspector(nodeId);
    setDraggingIds(ids);
    updateDragPoint(event);
    event.dataTransfer?.setData("application/x-solid-svg-node-ids", ids.join(","));

    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = "move";
    }
  }

  function updateInspectorDropTarget(node: SvgNode, event: DragEvent): void {
    const ids = draggingIds();

    if (ids.length === 0) {
      return;
    }

    event.preventDefault();
    updateDragPoint(event);

    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = "move";
    }

    const position = dropPositionForEvent(node, event);
    setDropTarget({ nodeId: node.id, position, valid: isDropTargetValid(ids, node.id, position) });
  }

  function dropInspectorNodes(node: SvgNode, event: DragEvent): void {
    const target = dropTarget();

    if (!target || target.nodeId !== node.id) {
      resetInspectorDrag();
      return;
    }

    event.preventDefault();

    if (target.valid) {
      props.reorderNodes(draggingIds(), target.nodeId, target.position);
    }

    resetInspectorDrag();
  }

  function dropPositionForEvent(node: SvgNode, event: DragEvent): DropPosition {
    if (node.id === props.root().id) {
      return "inside";
    }

    const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
    const y = rect.height > 0 ? (event.clientY - rect.top) / rect.height : 0.5;

    if (node.kind === "element" && y > 0.27 && y < 0.73) {
      return "inside";
    }

    return y < 0.5 ? "before" : "after";
  }

  function isDropTargetValid(ids: readonly string[], targetId: string, position: DropPosition): boolean {
    const root = props.root();
    const target = findNode(root, targetId);
    const parent = position === "inside" && target?.kind === "element" ? target : findParent(root, targetId);

    if (!target || !parent) {
      return false;
    }

    for (const id of ids) {
      const node = findNode(root, id);

      if (!node || node.id === root.id || nodeContainsId(node, parent.id)) {
        return false;
      }

      if (node.kind === "element" && !isValidChild(parent.name, node.name)) {
        return false;
      }
    }

    return true;
  }

  return (
    <section class="panel inspector-panel">
      <div class="panel-action-row">
        <button class="primary-action" type="button" onClick={() => setAddOpen(!addOpen())}>
          <img src="/assets/icons/Plus.svg" alt="" /> Add element
        </button>
        <Show when={addOpen()}>
          <div class="popover add-popover">
            <For each={["path", "circle", "ellipse", "rect", "line", "polygon", "polyline", "g", "linearGradient", "radialGradient", "stop"] as const}>
              {(name) => (
                <button
                  type="button"
                  onClick={() => {
                    props.addElement(name);
                    setAddOpen(false);
                  }}
                >
                  <img src={iconForElement(name)} alt="" /> {name}
                </button>
              )}
            </For>
          </div>
        </Show>
      </div>
      <div class="inspector-scroll" ref={(element) => (scrollerRef = element)} onScroll={(event) => setScrollTop(event.currentTarget.scrollTop)}>
        <RootElementEditor root={props.root} updateElementAttribute={props.updateElementAttribute} />
        <div ref={(element) => (virtualSpacerRef = element)} class="virtual-inspector-spacer" style={{ height: `${virtualSpacerHeight()}px` }}>
          <div class="virtual-inspector-window" style={{ transform: `translateY(${visibleWindow().paddingTop}px)` }}>
            <Index each={visibleWindow().rows}>
              {(row) => (
                <VirtualInspectorCard
                  row={row}
                  measureRow={measureRow}
                  root={props.root}
                  selectedIds={props.selectedIds}
                  selectedPathCommand={props.selectedPathCommand}
                  setSelectedPathCommand={props.setSelectedPathCommand}
                  selectNode={selectNodeFromInspector}
                  updateElementAttribute={props.updateElementAttribute}
                  removeElementAttribute={props.removeElementAttribute}
                  updateBasicNodeText={props.updateBasicNodeText}
                  openContextMenu={openContextMenuFromInspector}
                  draggingIds={draggingIds}
                  dropTarget={dropTarget}
                  startInspectorDrag={startInspectorDrag}
                  updateInspectorDropTarget={updateInspectorDropTarget}
                  dropInspectorNodes={dropInspectorNodes}
                  resetInspectorDrag={resetInspectorDrag}
                />
              )}
            </Index>
            <div style={{ height: `${visibleWindow().paddingBottom}px` }} />
          </div>
        </div>
      </div>
      <Show when={dragPreviewPoint()}>
        {(point) => (
          <div class="inspector-drag-preview" style={{ left: `${point().x + 14}px`, top: `${point().y + 10}px` }}>
            <For each={dragPreviewNodes()}>
              {(node) => (
                <div class="inspector-drag-preview-card">
                  <img src={node.kind === "element" ? iconForElement(node.name) : iconForNode(node.kind)} alt="" />
                  <span>{inspectorTitle(node)}</span>
                </div>
              )}
            </For>
          </div>
        )}
      </Show>
    </section>
  );
}

function nodeContainsId(node: SvgNode, id: string): boolean {
  if (node.id === id) {
    return true;
  }

  if (node.kind !== "element") {
    return false;
  }

  return node.children.some((child) => nodeContainsId(child, id));
}

function inspectorTitle(node: SvgNode): string {
  return node.kind === "element" ? node.name : nodeLabel(node);
}

function findMountedInspectorCard(scroller: HTMLElement, id: string): HTMLElement | undefined {
  for (const element of scroller.querySelectorAll<HTMLElement>(".element-card[data-inspector-node-id]")) {
    if (element.dataset.inspectorNodeId === id) {
      return element;
    }
  }

  return undefined;
}

function VirtualInspectorCard(props: {
  readonly row: Accessor<VirtualInspectorRow>;
  readonly measureRow: (id: string, height: number) => void;
  readonly root: () => SvgElementNode;
  readonly selectedIds: () => readonly string[];
  readonly selectedPathCommand: () => { readonly nodeId: string; readonly index: number } | undefined;
  readonly setSelectedPathCommand: (selection: { readonly nodeId: string; readonly index: number } | undefined) => void;
  readonly selectNode: (id: string, event?: MouseEvent | PointerEvent) => void;
  readonly updateElementAttribute: (nodeId: string, name: string, value: string) => void;
  readonly removeElementAttribute: (nodeId: string, name: string) => void;
  readonly updateBasicNodeText: (nodeId: string, text: string) => void;
  readonly openContextMenu: (event: MouseEvent, nodeId: string) => void;
  readonly draggingIds: Accessor<readonly string[]>;
  readonly dropTarget: Accessor<InspectorDropTarget | undefined>;
  readonly startInspectorDrag: (nodeId: string, event: DragEvent) => void;
  readonly updateInspectorDropTarget: (node: SvgNode, event: DragEvent) => void;
  readonly dropInspectorNodes: (node: SvgNode, event: DragEvent) => void;
  readonly resetInspectorDrag: () => void;
}) {
  let rowRef: HTMLDivElement | undefined;
  const measure = () => {
    const element = rowRef;

    if (element) {
      props.measureRow(props.row().node.id, element.offsetHeight);
    }
  };

  onMount(() => {
    const element = rowRef;

    if (!element) {
      return;
    }

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    onCleanup(() => observer.disconnect());
  });

  createEffect(() => {
    props.row().node.id;
    queueMicrotask(measure);
  });

  return (
    <div
      ref={(element) => (rowRef = element)}
      class="virtual-inspector-row"
      style={{
        "padding-left": `${Math.min(props.row().depth * 12, 144)}px`
      }}
    >
      <ElementCard
        node={props.row().node}
        depth={props.row().depth}
        root={props.root}
        selectedIds={props.selectedIds}
        selectedPathCommand={props.selectedPathCommand}
        setSelectedPathCommand={props.setSelectedPathCommand}
        selectNode={props.selectNode}
        updateElementAttribute={props.updateElementAttribute}
        removeElementAttribute={props.removeElementAttribute}
        updateBasicNodeText={props.updateBasicNodeText}
        openContextMenu={props.openContextMenu}
        draggingIds={props.draggingIds}
        dropTarget={props.dropTarget}
        startInspectorDrag={props.startInspectorDrag}
        updateInspectorDropTarget={props.updateInspectorDropTarget}
        dropInspectorNodes={props.dropInspectorNodes}
        resetInspectorDrag={props.resetInspectorDrag}
        renderChildren={false}
      />
    </div>
  );
}

function ElementCard(props: {
  readonly node: SvgNode;
  readonly depth: number;
  readonly root: () => SvgElementNode;
  readonly selectedIds: () => readonly string[];
  readonly selectedPathCommand: () => { readonly nodeId: string; readonly index: number } | undefined;
  readonly setSelectedPathCommand: (selection: { readonly nodeId: string; readonly index: number } | undefined) => void;
  readonly selectNode: (id: string, event?: MouseEvent | PointerEvent) => void;
  readonly updateElementAttribute: (nodeId: string, name: string, value: string) => void;
  readonly removeElementAttribute: (nodeId: string, name: string) => void;
  readonly updateBasicNodeText: (nodeId: string, text: string) => void;
  readonly openContextMenu: (event: MouseEvent, nodeId: string) => void;
  readonly draggingIds: Accessor<readonly string[]>;
  readonly dropTarget: Accessor<InspectorDropTarget | undefined>;
  readonly startInspectorDrag: (nodeId: string, event: DragEvent) => void;
  readonly updateInspectorDropTarget: (node: SvgNode, event: DragEvent) => void;
  readonly dropInspectorNodes: (node: SvgNode, event: DragEvent) => void;
  readonly resetInspectorDrag: () => void;
  readonly renderChildren?: boolean;
}) {
  const isSelected = () => props.selectedIds().includes(props.node.id);
  const tint = () => `hsl(${268 + props.depth * 18}deg 52% ${props.depth === 0 ? 11 : 14}%)`;
  const dropState = () => (props.dropTarget()?.nodeId === props.node.id ? props.dropTarget() : undefined);
  const isDragging = () => props.draggingIds().includes(props.node.id);

  return (
    <article
      class="element-card"
      data-inspector-node-id={props.node.id}
      classList={{
        selected: isSelected(),
        "basic-node": props.node.kind !== "element",
        dragging: isDragging(),
        "drop-before": dropState()?.position === "before",
        "drop-after": dropState()?.position === "after",
        "drop-inside": dropState()?.position === "inside",
        "drop-invalid": dropState()?.valid === false
      }}
      style={{ "--card-tint": tint() }}
      draggable={props.node.id !== props.root().id}
      onDragStart={(event) => props.startInspectorDrag(props.node.id, event)}
      onDragOver={(event) => props.updateInspectorDropTarget(props.node, event)}
      onDrop={(event) => props.dropInspectorNodes(props.node, event)}
      onDragEnd={props.resetInspectorDrag}
    >
      <button
        type="button"
        class="element-title"
        draggable={props.node.id !== props.root().id}
        onClick={(event) => props.selectNode(props.node.id, event)}
        onContextMenu={(event) => props.openContextMenu(event, props.node.id)}
        onDragStart={(event) => props.startInspectorDrag(props.node.id, event)}
        onDragEnd={props.resetInspectorDrag}
      >
        <img src={props.node.kind === "element" ? iconForElement(props.node.name) : iconForNode(props.node.kind)} alt="" />
        <span>{inspectorTitle(props.node)}</span>
        <Show when={props.node.kind === "element" && props.node.name !== "svg" && isRecognizedElement(props.node.name) === false}>
          <img class="warning-icon" src="/assets/icons/Warning.svg" alt="" />
        </Show>
      </button>

      <Show
        when={props.node.kind === "element" ? props.node : undefined}
        fallback={
          <textarea
            class="basic-node-text"
            value={props.node.kind === "element" ? "" : props.node.text}
            onInput={(event) => props.updateBasicNodeText(props.node.id, event.currentTarget.value)}
          />
        }
      >
        {(node) => (
          <>
            <AttributeGrid
              node={node()}
              updateElementAttribute={props.updateElementAttribute}
              selectedPathCommand={props.selectedPathCommand}
              setSelectedPathCommand={props.setSelectedPathCommand}
            />
            <Show when={props.renderChildren !== false && node().children.length > 0}>
              <div class="children-stack">
                <For each={node().children}>
                  {(child) => (
                    <ElementCard
                      node={child}
                      depth={props.depth + 1}
                      root={props.root}
                      selectedIds={props.selectedIds}
                      selectedPathCommand={props.selectedPathCommand}
                      setSelectedPathCommand={props.setSelectedPathCommand}
                      selectNode={props.selectNode}
                      updateElementAttribute={props.updateElementAttribute}
                      removeElementAttribute={props.removeElementAttribute}
                      updateBasicNodeText={props.updateBasicNodeText}
                      openContextMenu={props.openContextMenu}
                      draggingIds={props.draggingIds}
                      dropTarget={props.dropTarget}
                      startInspectorDrag={props.startInspectorDrag}
                      updateInspectorDropTarget={props.updateInspectorDropTarget}
                      dropInspectorNodes={props.dropInspectorNodes}
                      resetInspectorDrag={props.resetInspectorDrag}
                    />
                  )}
                </For>
              </div>
            </Show>
          </>
        )}
      </Show>
    </article>
  );
}

const rootEditorAttributes = ["width", "height", "viewBox", "xmlns"] as const;

function RootElementEditor(props: {
  readonly root: () => SvgElementNode;
  readonly updateElementAttribute: (nodeId: string, name: string, value: string) => void;
}) {
  const rootValue = (name: string) => getAttribute(props.root(), name, true) || getAttributeDefault(name);
  const viewBoxValues = createMemo(() => listValues(rootValue("viewBox"), 4, listValues(getAttributeDefault("viewBox"), 4)));
  const unknownAttrs = createMemo(() => props.root().attrs.filter((attr) => !(rootEditorAttributes as readonly string[]).includes(attr.name)));

  function updateViewBoxPart(index: number, value: string): void {
    const next = [...viewBoxValues()];
    next[index] = value;
    props.updateElementAttribute(props.root().id, "viewBox", next.join(" "));
  }

  return (
    <div class="root-element-editor">
      <Show when={unknownAttrs().length > 0}>
        <div class="compact-attribute-flow root-unknown-flow">
          <For each={unknownAttrs()}>
            {(attr) => <AttributeControl node={props.root()} attr={attr} updateElementAttribute={props.updateElementAttribute} />}
          </For>
        </div>
      </Show>
      <div class="root-editor-fields">
        <label class="root-editor-field width-field">
          <span>width</span>
          <input class="mono-input compact-number-field" name={`${props.root().id}-width`} aria-label="width" value={rootValue("width")} onChange={(event) => props.updateElementAttribute(props.root().id, "width", clampNumericAttribute("width", event.currentTarget.value))} />
        </label>
        <label class="root-editor-field height-field">
          <span>height</span>
          <input class="mono-input compact-number-field" name={`${props.root().id}-height`} aria-label="height" value={rootValue("height")} onChange={(event) => props.updateElementAttribute(props.root().id, "height", clampNumericAttribute("height", event.currentTarget.value))} />
        </label>
        <fieldset class="root-editor-field viewbox-field">
          <legend>viewBox</legend>
          <div class="viewbox-inputs">
            <For each={viewBoxValues()}>
              {(value, index) => (
                <input
                  class="mono-input compact-number-field"
                  name={`${props.root().id}-viewbox-${index()}`}
                  aria-label={`viewBox ${index() + 1}`}
                  value={value}
                  onChange={(event) => updateViewBoxPart(index(), clampNumericAttribute(index() < 2 ? "x" : "width", event.currentTarget.value))}
                />
              )}
            </For>
          </div>
        </fieldset>
      </div>
    </div>
  );
}

function AttributeGrid(props: {
  readonly node: SvgElementNode;
  readonly updateElementAttribute: (nodeId: string, name: string, value: string) => void;
  readonly selectedPathCommand: () => { readonly nodeId: string; readonly index: number } | undefined;
  readonly setSelectedPathCommand: (selection: { readonly nodeId: string; readonly index: number } | undefined) => void;
}) {
  const attrs = createMemo(() => orderedAttributes(props.node));
  const unknownAttrs = createMemo(() => attrs().filter((attr) => !isAttributeRecognized(props.node.name, attr.name)));
  const compactAttrs = createMemo(() => attrs().filter((attr) => isCompactAttribute(props.node, attr)));
  const pathDataAttr = createMemo(() => attrs().find((attr) => getAttributeType(attr.name) === "pathdata"));
  const pointsAttr = createMemo(() => attrs().find((attr) => getAttributeType(attr.name) === "list" && attr.name === "points"));

  return (
    <div class="attribute-grid compact-attribute-grid">
      <Show when={unknownAttrs().length > 0}>
        <div class="compact-attribute-flow unknown-attribute-flow">
          <For each={unknownAttrs()}>
            {(attr) => <AttributeControl node={props.node} attr={attr} updateElementAttribute={props.updateElementAttribute} />}
          </For>
        </div>
      </Show>
      <div class="compact-attribute-flow">
        <For each={compactAttrs()}>
          {(attr) => <AttributeControl node={props.node} attr={attr} updateElementAttribute={props.updateElementAttribute} />}
        </For>
      </div>
      <Show when={pointsAttr()}>
        {(attr) => <PointsEditor value={attr().value} update={(value) => props.updateElementAttribute(props.node.id, attr().name, value)} />}
      </Show>
      <Show when={pathDataAttr()}>
        {(attr) => (
          <PathDataEditor
            node={props.node}
            value={attr().value}
            update={(value) => props.updateElementAttribute(props.node.id, attr().name, value)}
            selectedPathCommand={props.selectedPathCommand}
            setSelectedPathCommand={props.setSelectedPathCommand}
          />
        )}
      </Show>
    </div>
  );
}

function AttributeControl(props: {
  readonly node: SvgElementNode;
  readonly attr: SvgAttribute;
  readonly updateElementAttribute: (nodeId: string, name: string, value: string) => void;
}) {
  const type = () => getAttributeType(props.attr.name);
  const enumValues = () => {
    const values: Record<string, readonly string[]> = attributeEnumValues;
    return values[props.attr.name] ?? [];
  };
  const update = (value: string) => props.updateElementAttribute(props.node.id, props.attr.name, value);

  return (
    <div class="attribute-control" classList={{ unknown: !isAttributeRecognized(props.node.name, props.attr.name), [`type-${type()}`]: true }} title={props.attr.name}>
      <Show when={type() === "numeric" || (type() === "list" && props.attr.name !== "points")}>
        <input
          class="mono-input compact-number-field"
          type="text"
          name={`${props.node.id}-${props.attr.name}`}
          aria-label={props.attr.name}
          value={props.attr.value}
          placeholder={getAttributeDefault(props.attr.name)}
          onChange={(event) => update(clampNumericAttribute(props.attr.name, event.currentTarget.value))}
        />
      </Show>
      <Show when={type() === "enum"}>
        <select class="compact-enum-field" name={`${props.node.id}-${props.attr.name}`} aria-label={props.attr.name} value={props.attr.value} onChange={(event) => update(event.currentTarget.value)}>
          <For each={enumValues()}>{(value) => <option value={value}>{value}</option>}</For>
        </select>
      </Show>
      <Show when={type() === "color"}>
        <ColorField nodeId={props.node.id} attr={props.attr} update={update} />
      </Show>
      <Show when={type() === "transform-list"}>
        <TransformField value={props.attr.value} update={update} />
      </Show>
      <Show when={["id", "href", "unknown"].includes(type())}>
        <input class="mono-input compact-text-field" name={`${props.node.id}-${props.attr.name}`} aria-label={props.attr.name} value={props.attr.value} placeholder={props.attr.name} onChange={(event) => update(event.currentTarget.value)} />
      </Show>
    </div>
  );
}

function ColorField(props: { readonly nodeId: string; readonly attr: SvgAttribute; readonly update: (value: string) => void }) {
  const colorValue = () => normalizeColorInput(props.attr.value);
  const swatchValue = () => colorValue() ?? (isCssColorText(props.attr.value) ? props.attr.value : "transparent");
  const pickerValue = () => colorValue() ?? "#000000";

  return (
    <div class="color-field line-edit-button">
      <input
        class="mono-input"
        name={`${props.nodeId}-${props.attr.name}`}
        aria-label={props.attr.name}
        value={props.attr.value}
        placeholder={getAttributeDefault(props.attr.name)}
        onChange={(event) => props.update(event.currentTarget.value)}
        list={`color-options-${props.nodeId}-${props.attr.name}`}
      />
      <label class="field-side-button color-swatch-button" title={`${props.attr.name} color`}>
        <span class="color-swatch" classList={{ none: props.attr.value === "none" }} style={{ "--swatch-color": swatchValue() }} />
        <input type="color" name={`${props.nodeId}-${props.attr.name}-picker`} aria-label={`${props.attr.name} picker`} value={pickerValue()} onInput={(event) => props.update(event.currentTarget.value)} />
      </label>
      <datalist id={`color-options-${props.nodeId}-${props.attr.name}`}>
        <Show when={(colorAttributesWithNoneAllowed as readonly string[]).includes(props.attr.name)}>
          <option value="none" />
        </Show>
        <Show when={(colorAttributesWithUrlAllowed as readonly string[]).includes(props.attr.name)}>
          <option value="url(#linearGradient1)" />
        </Show>
        <Show when={(colorAttributesWithCurrentColorAllowed as readonly string[]).includes(props.attr.name)}>
          <option value="currentColor" />
        </Show>
      </datalist>
    </div>
  );
}

function isCompactAttribute(node: SvgElementNode, attr: SvgAttribute): boolean {
  if (!isAttributeRecognized(node.name, attr.name)) {
    return false;
  }

  const type = getAttributeType(attr.name);
  return type !== "pathdata" && !(type === "list" && attr.name === "points");
}

function listValues(value: string, count: number, fallback: readonly string[] = []): string[] {
  const values = value.split(/[\s,]+/).filter(Boolean);

  return Array.from({ length: count }, (_, index) => values[index] ?? fallback[index] ?? "0");
}

function isCssColorText(value: string): boolean {
  return value !== "" && !value.startsWith("url(") && value !== "currentColor";
}

function PathDataEditor(props: {
  readonly node: SvgElementNode;
  readonly value: string;
  readonly update: (value: string) => void;
  readonly selectedPathCommand: () => { readonly nodeId: string; readonly index: number } | undefined;
  readonly setSelectedPathCommand: (selection: { readonly nodeId: string; readonly index: number } | undefined) => void;
}) {
  const commands = createMemo(() => parsePathData(props.value));

  function updateCommands(next: readonly PathCommand[]): void {
    props.update(formatPathData(next));
  }

  return (
    <div class="path-editor">
      <input class="mono-input path-raw" name={`${props.node.id}-d`} aria-label="Path data" value={props.value} placeholder="No path data" onChange={(event) => props.update(event.currentTarget.value)} />
      <div class="path-command-list">
        <For each={commands()}>
          {(command, index) => (
            <PathCommandRow
              nodeId={props.node.id}
              command={command}
              index={index}
              commands={commands}
              updateCommands={updateCommands}
              selectedPathCommand={props.selectedPathCommand}
              setSelectedPathCommand={props.setSelectedPathCommand}
            />
          )}
        </For>
        <button type="button" class="add-command" title="Add move command" onClick={() => updateCommands([...commands(), createCommand("M")])}>
          <img src="/assets/icons/Plus.svg" alt="" />
        </button>
      </div>
    </div>
  );
}

function PathCommandRow(props: {
  readonly nodeId: string;
  readonly command: PathCommand;
  readonly index: Accessor<number>;
  readonly commands: Accessor<readonly PathCommand[]>;
  readonly updateCommands: (next: readonly PathCommand[]) => void;
  readonly selectedPathCommand: () => { readonly nodeId: string; readonly index: number } | undefined;
  readonly setSelectedPathCommand: (selection: { readonly nodeId: string; readonly index: number } | undefined) => void;
}) {
  const [menuOpen, setMenuOpen] = createSignal(false);
  const isRelative = () => props.command.command === props.command.command.toLowerCase();
  const selected = () => {
    const current = props.selectedPathCommand();
    return current?.nodeId === props.nodeId && current.index === props.index();
  };

  function updateCommands(next: readonly PathCommand[]): void {
    props.updateCommands(next);
    setMenuOpen(false);
  }

  function selectCurrent(): void {
    props.setSelectedPathCommand({ nodeId: props.nodeId, index: props.index() });
  }

  return (
    <div
      class="path-command-row"
      classList={{ selected: selected() }}
      onFocusOut={(event) => {
        const nextFocus = event.relatedTarget;

        if (nextFocus instanceof Node && event.currentTarget.contains(nextFocus)) {
          return;
        }

        setMenuOpen(false);
      }}
    >
      <button
        type="button"
        class="command-pill"
        classList={{ relative: isRelative(), absolute: !isRelative() }}
        title={pathCommandDescription(props.command.command)}
        onClick={() => {
          selectCurrent();
          props.updateCommands(toggleRelative(props.commands(), props.index()));
        }}
      >
        {props.command.command}
      </button>
      <div class="path-params">
        <For each={commandParameters(props.command.command)}>
          {(param) => (
            <input
              classList={{ "flag-param": param.name === "large" || param.name === "sweep" }}
              type="number"
              step="0.001"
              name={`${props.nodeId}-command-${props.index()}-${param.name}`}
              aria-label={param.name}
              title={param.name}
              value={props.command.values[param.index] ?? 0}
              onFocus={selectCurrent}
              onChange={(event) => updateCommands(updateCommandValue(props.commands(), props.index(), param.index, Number.parseFloat(event.currentTarget.value) || 0))}
            />
          )}
        </For>
      </div>
      <button type="button" class="command-menu-button" title="Path command actions" onClick={() => setMenuOpen(!menuOpen())}>
        <img src="/assets/icons/SmallMore.svg" alt="" />
      </button>
      <Show when={menuOpen()}>
        <div class="command-menu">
          <button type="button" onClick={() => updateCommands(insertPathCommand(props.commands(), props.index(), props.command.command))}>
            <img src="/assets/icons/InsertAfter.svg" alt="" /> Insert after
          </button>
          <div class="command-convert-grid">
            <For each={pathCommandLetters}>
              {(letter) => (
                <button type="button" title={pathCommandDescription(letter)} onClick={() => updateCommands(convertCommand(props.commands(), props.index(), isRelative() ? letter.toLowerCase() : letter))}>
                  {letter}
                </button>
              )}
            </For>
          </div>
          <button type="button" onClick={() => updateCommands(deleteCommand(props.commands(), props.index()))}>
            <img src="/assets/icons/Delete.svg" alt="" /> Delete
          </button>
        </div>
      </Show>
    </div>
  );
}

function pathCommandDescription(command: string): string {
  const descriptions: Record<string, string> = {
    A: "Elliptical Arc to",
    C: "Cubic Bezier to",
    H: "Horizontal Line to",
    L: "Line to",
    M: "Move to",
    Q: "Quadratic Bezier to",
    S: "Shorthand Cubic Bezier to",
    T: "Shorthand Quadratic Bezier to",
    V: "Vertical Line to",
    Z: "Close Path"
  };
  const relation = command === command.toLowerCase() ? "Relative" : "Absolute";

  return `${descriptions[command.toUpperCase()] ?? command} (${relation})`;
}

function PointsEditor(props: { readonly value: string; readonly update: (value: string) => void }) {
  const points = createMemo(() => parsePoints(props.value));

  return (
    <div class="points-editor">
      <input class="mono-input" name="points" aria-label="Points" value={props.value} onChange={(event) => props.update(event.currentTarget.value)} />
      <div class="point-list">
        <For each={points()}>
          {(point, index) => (
            <div class="point-row">
              <span>{index() + 1}</span>
              <input type="number" name={`point-${index()}-x`} aria-label="Point x" value={point[0]} onChange={(event) => props.update(formatPoints(updatePoint(points(), index(), 0, Number.parseFloat(event.currentTarget.value) || 0)))} />
              <input type="number" name={`point-${index()}-y`} aria-label="Point y" value={point[1]} onChange={(event) => props.update(formatPoints(updatePoint(points(), index(), 1, Number.parseFloat(event.currentTarget.value) || 0)))} />
              <button type="button" onClick={() => props.update(formatPoints(deletePoint(points(), index())))}>
                <img src="/assets/icons/Delete.svg" alt="" />
              </button>
            </div>
          )}
        </For>
        <button type="button" class="add-command" onClick={() => props.update(formatPoints(addPoint(points())))}>
          <img src="/assets/icons/Plus.svg" alt="" />
        </button>
      </div>
    </div>
  );
}

function TransformField(props: { readonly value: string; readonly update: (value: string) => void }) {
  const [popupOpen, setPopupOpen] = createSignal(false);
  const [activeTransformMenu, setActiveTransformMenu] = createSignal<number>();
  const [insertMenu, setInsertMenu] = createSignal<number>();
  const transformItems = createMemo(() => parseTransformItems(props.value));
  const finalMatrix = createMemo(() => parseTransformList(props.value));

  function updateTransforms(items: readonly TransformItem[]): void {
    props.update(items.map((item) => `${item.type}(${item.body})`).join(" "));
  }

  function insertTransform(index: number, type: TransformType): void {
    const items = [...transformItems()];
    items.splice(Math.max(0, Math.min(index, items.length)), 0, createTransformItem(type));
    updateTransforms(items);
    setInsertMenu(undefined);
    setActiveTransformMenu(undefined);
  }

  function deleteTransform(index: number): void {
    updateTransforms(transformItems().filter((_, itemIndex) => itemIndex !== index));
    setInsertMenu(undefined);
    setActiveTransformMenu(undefined);
  }

  function updateTransformBody(index: number, body: string): void {
    updateTransforms(transformItems().map((item, itemIndex) => (itemIndex === index ? { ...item, body } : item)));
  }

  return (
    <div class="transform-field line-edit-button">
      <input class="mono-input" name="transform" aria-label="Transform" placeholder="No transforms" value={props.value} onChange={(event) => props.update(event.currentTarget.value)} />
      <button type="button" class="field-side-button" onClick={() => setPopupOpen(!popupOpen())}>
        <img src="/assets/icons/Arrow.svg" alt="" />
      </button>
      <Show when={popupOpen()}>
        <div class="transform-popup">
          <Show
            when={transformItems().length > 0}
            fallback={
              <button type="button" class="transform-popup-add" onClick={() => setInsertMenu(0)}>
                <img src="/assets/icons/Plus.svg" alt="" />
              </button>
            }
          >
            <div class="transform-popup-list">
              <For each={transformItems()}>
                {(item, index) => (
                  <div class="transform-popup-row">
                    <button type="button" class="transform-kind-button" title={item.type} onClick={() => setActiveTransformMenu(activeTransformMenu() === index() ? undefined : index())}>
                      <img src={transformIcon(item.type)} alt="" />
                    </button>
                    <input class="mono-input" aria-label={`${item.type} values`} value={item.body} onChange={(event) => updateTransformBody(index(), event.currentTarget.value)} />
                    <button type="button" class="command-menu-button" title="Transform actions" onClick={() => setActiveTransformMenu(activeTransformMenu() === index() ? undefined : index())}>
                      <img src="/assets/icons/SmallMore.svg" alt="" />
                    </button>
                    <Show when={activeTransformMenu() === index()}>
                      <div class="transform-actions-menu">
                        <button type="button" onClick={() => setInsertMenu(index() + 1)}>
                          <img src="/assets/icons/InsertAfter.svg" alt="" /> Insert after
                        </button>
                        <button type="button" onClick={() => setInsertMenu(index())}>
                          <img src="/assets/icons/InsertBefore.svg" alt="" /> Insert before
                        </button>
                        <button type="button" onClick={() => deleteTransform(index())}>
                          <img src="/assets/icons/Delete.svg" alt="" /> Delete
                        </button>
                      </div>
                    </Show>
                  </div>
                )}
              </For>
              <button type="button" class="transform-popup-add compact" onClick={() => setInsertMenu(transformItems().length)}>
                <img src="/assets/icons/Plus.svg" alt="" />
              </button>
            </div>
          </Show>
          <Show when={insertMenu() !== undefined}>
            <div class="transform-new-menu">
              <div class="transform-menu-title">New transform</div>
              <For each={transformTypes}>
                {(type) => (
                  <button
                    type="button"
                    onClick={() => {
                      const index = insertMenu();

                      if (index !== undefined) {
                        insertTransform(index, type);
                      }
                    }}
                  >
                    <img src={transformIcon(type)} alt="" /> {type}
                  </button>
                )}
              </For>
            </div>
          </Show>
          <div class="transform-final-matrix">
            <input class="mono-input" value={formatMiniNumber(finalMatrix().a)} readOnly aria-label="matrix a" />
            <input class="mono-input" value={formatMiniNumber(finalMatrix().c)} readOnly aria-label="matrix c" />
            <input class="mono-input" value={formatMiniNumber(finalMatrix().e)} readOnly aria-label="matrix e" />
            <input class="mono-input" value={formatMiniNumber(finalMatrix().b)} readOnly aria-label="matrix b" />
            <input class="mono-input" value={formatMiniNumber(finalMatrix().d)} readOnly aria-label="matrix d" />
            <input class="mono-input" value={formatMiniNumber(finalMatrix().f)} readOnly aria-label="matrix f" />
          </div>
        </div>
      </Show>
    </div>
  );
}

type TransformType = (typeof transformTypes)[number];
type TransformItem = {
  readonly type: TransformType;
  readonly body: string;
};

const transformTypes = ["matrix", "translate", "rotate", "scale", "skewX", "skewY"] as const;

function parseTransformItems(value: string): readonly TransformItem[] {
  const items: TransformItem[] = [];

  for (const match of value.matchAll(/([a-zA-Z]+)\(([^)]*)\)/g)) {
    const [, type, body] = match;

    if (isTransformType(type)) {
      items.push({ type, body: body ?? "" });
    }
  }

  return items;
}

function isTransformType(value: string | undefined): value is TransformType {
  return transformTypes.includes(value as TransformType);
}

function createTransformItem(type: TransformType): TransformItem {
  switch (type) {
    case "matrix":
      return { type, body: "1 0 0 1 0 0" };
    case "translate":
      return { type, body: "0 0" };
    case "rotate":
      return { type, body: "0 0 0" };
    case "scale":
      return { type, body: "1 1" };
    case "skewX":
    case "skewY":
      return { type, body: "0" };
  }
}

function transformIcon(type: TransformType): string {
  switch (type) {
    case "matrix":
      return "/assets/icons/Matrix.svg";
    case "translate":
      return "/assets/icons/Translate.svg";
    case "rotate":
      return "/assets/icons/Rotate.svg";
    case "scale":
      return "/assets/icons/Scale.svg";
    case "skewX":
      return "/assets/icons/SkewX.svg";
    case "skewY":
      return "/assets/icons/SkewY.svg";
  }
}

function formatMiniNumber(value: number): string {
  if (!Number.isFinite(value)) {
    return "0";
  }

  const rounded = Math.round(value * 1000) / 1000;
  return Number.isInteger(rounded) ? String(rounded) : String(rounded).replace(/0+$/, "").replace(/\.$/, "");
}
