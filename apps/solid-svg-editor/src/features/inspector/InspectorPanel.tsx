import { createEffect, createMemo, createSignal, For, Index, onCleanup, onMount, Show, type Accessor } from "solid-js";

import {
  attributeEnumValues,
  colorAttributesWithCurrentColorAllowed,
  colorAttributesWithNoneAllowed,
  colorAttributesWithUrlAllowed,
  getAttributeDefault,
  getAttributeType,
  getRecognizedAttributes,
  iconForElement,
  iconForNode,
  isAttributeRecognized,
  isRecognizedElement,
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
import { nodeLabel, type SvgAttribute, type SvgElementNode, type SvgNode } from "../../svg-model";
import {
  clampNumericAttribute,
  estimateInspectorRowHeight,
  flattenInspectorRows,
  insertPathCommand,
  normalizeColorInput,
  orderedAttributes
} from "../../editor/tree-utils";
import type { InspectorRow, VirtualInspectorRow } from "../../editor/types";

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
}) {
  const [addOpen, setAddOpen] = createSignal(false);
  const [scrollTop, setScrollTop] = createSignal(0);
  const [viewportHeight, setViewportHeight] = createSignal(0);
  const [heightVersion, setHeightVersion] = createSignal(0);
  const rowHeights = new Map<string, number>();
  const virtualRowCache = new Map<string, VirtualInspectorRow>();
  let scrollerRef: HTMLDivElement | undefined;

  const rows = createMemo((previous: readonly InspectorRow[] | undefined) => flattenInspectorRows(props.root(), previous), [] as readonly InspectorRow[]);
  const virtualLayout = createMemo(() => {
    heightVersion();
    const currentRows = rows();
    const tops: number[] = [];
    const heights: number[] = [];
    let totalHeight = 0;

    for (const row of currentRows) {
      const height = rowHeights.get(row.node.id) ?? estimateInspectorRowHeight(row.node);
      tops.push(totalHeight);
      heights.push(height);
      totalHeight += height + 7;
    }

    return { rows: currentRows, tops, heights, totalHeight };
  });
  const visibleWindow = createMemo(() => {
    const layout = virtualLayout();
    const startY = Math.max(0, scrollTop() - 900);
    const endY = scrollTop() + viewportHeight() + 900;
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

    return {
      rows: visibleRows,
      paddingTop: layout.tops[startIndex] ?? 0,
      paddingBottom: Math.max(0, layout.totalHeight - topAfterEnd),
      totalHeight: layout.totalHeight
    };
  });

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

    queueMicrotask(() => scrollRowIntoView(selectedId));
  });

  function measureRow(id: string, height: number): void {
    if (Math.abs((rowHeights.get(id) ?? 0) - height) < 1) {
      return;
    }

    rowHeights.set(id, height);
    setHeightVersion((version) => version + 1);
  }

  function scrollRowIntoView(id: string): void {
    const scroller = scrollerRef;

    if (!scroller) {
      return;
    }

    const layout = virtualLayout();
    const rowIndex = layout.rows.findIndex((row) => row.node.id === id);

    if (rowIndex === -1) {
      return;
    }

    const rowTop = layout.tops[rowIndex] ?? 0;
    const rowHeight = layout.heights[rowIndex] ?? estimateInspectorRowHeight(layout.rows[rowIndex]?.node ?? props.root());
    const rowBottom = rowTop + rowHeight;
    const margin = 12;
    const viewportTop = scroller.scrollTop;
    const viewportBottom = viewportTop + scroller.clientHeight;
    let nextScrollTop = viewportTop;

    if (rowTop < viewportTop + margin) {
      nextScrollTop = Math.max(0, rowTop - margin);
    } else if (rowBottom > viewportBottom - margin) {
      nextScrollTop = Math.max(0, rowBottom - scroller.clientHeight + margin);
    }

    if (Math.abs(nextScrollTop - viewportTop) < 1) {
      return;
    }

    scroller.scrollTo({ top: nextScrollTop });
    setScrollTop(nextScrollTop);
  }

  return (
    <section class="panel inspector-panel">
      <div class="panel-action-row">
        <button class="primary-action" type="button" onClick={() => setAddOpen(!addOpen())}>
          <img src="/assets/icons/Plus.svg" alt="" /> Add element
        </button>
        <button class="ghost-action" type="button" onClick={props.clearSelection}>
          <img src="/assets/icons/Clear.svg" alt="" />
        </button>
        <Show when={addOpen()}>
          <div class="popover add-popover">
            <For each={["path", "circle", "ellipse", "rect", "line", "polygon", "polyline", "g", "linearGradient", "radialGradient", "stop", "use"] as const}>
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
            <hr />
            <button type="button" onClick={() => props.addTextNode("text")}>
              <img src={iconForNode("text")} alt="" /> text
            </button>
            <button type="button" onClick={() => props.addTextNode("comment")}>
              <img src={iconForNode("comment")} alt="" /> comment
            </button>
            <button type="button" onClick={() => props.addTextNode("cdata")}>
              <img src={iconForNode("cdata")} alt="" /> CDATA
            </button>
          </div>
        </Show>
      </div>
      <div class="inspector-scroll" ref={(element) => (scrollerRef = element)} onScroll={(event) => setScrollTop(event.currentTarget.scrollTop)}>
        <div class="virtual-inspector-spacer" style={{ height: `${visibleWindow().totalHeight}px` }}>
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
                  selectNode={props.selectNode}
                  updateElementAttribute={props.updateElementAttribute}
                  removeElementAttribute={props.removeElementAttribute}
                  updateBasicNodeText={props.updateBasicNodeText}
                  openContextMenu={props.openContextMenu}
                />
              )}
            </Index>
            <div style={{ height: `${visibleWindow().paddingBottom}px` }} />
          </div>
        </div>
      </div>
    </section>
  );
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
        "padding-left": `${Math.min(props.row().depth * 14, 168)}px`
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
  readonly renderChildren?: boolean;
}) {
  const isSelected = () => props.selectedIds().includes(props.node.id);
  const tint = () => `hsl(${268 + props.depth * 18}deg 52% ${props.depth === 0 ? 11 : 14}%)`;

  return (
    <article class="element-card" classList={{ selected: isSelected(), "basic-node": props.node.kind !== "element" }} style={{ "--card-tint": tint() }}>
      <button
        type="button"
        class="element-title"
        onClick={(event) => props.selectNode(props.node.id, event)}
        onContextMenu={(event) => props.openContextMenu(event, props.node.id)}
      >
        <img src={props.node.kind === "element" ? iconForElement(props.node.name) : iconForNode(props.node.kind)} alt="" />
        <span>{nodeLabel(props.node)}</span>
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
              removeElementAttribute={props.removeElementAttribute}
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

function AttributeGrid(props: {
  readonly node: SvgElementNode;
  readonly updateElementAttribute: (nodeId: string, name: string, value: string) => void;
  readonly removeElementAttribute: (nodeId: string, name: string) => void;
  readonly selectedPathCommand: () => { readonly nodeId: string; readonly index: number } | undefined;
  readonly setSelectedPathCommand: (selection: { readonly nodeId: string; readonly index: number } | undefined) => void;
}) {
  const [newAttribute, setNewAttribute] = createSignal("");
  const attrs = createMemo(() => orderedAttributes(props.node));

  return (
    <div class="attribute-grid">
      <Index each={attrs()}>
        {(attr) => (
          <AttributeField
            node={props.node}
            attr={attr()}
            updateElementAttribute={props.updateElementAttribute}
            removeElementAttribute={props.removeElementAttribute}
            selectedPathCommand={props.selectedPathCommand}
            setSelectedPathCommand={props.setSelectedPathCommand}
          />
        )}
      </Index>
      <div class="attribute-row add-attribute-row">
        <input name={`new-attribute-${props.node.id}`} aria-label="New attribute" value={newAttribute()} placeholder="attribute" onInput={(event) => setNewAttribute(event.currentTarget.value)} list={`attrs-${props.node.id}`} />
        <datalist id={`attrs-${props.node.id}`}>
          <For each={getRecognizedAttributes(props.node.name)}>
            {(name) => <option value={name} />}
          </For>
        </datalist>
        <button
          type="button"
          onClick={() => {
            const name = newAttribute().trim();

            if (name) {
              props.updateElementAttribute(props.node.id, name, getAttributeDefault(name));
              setNewAttribute("");
            }
          }}
        >
          <img src="/assets/icons/Plus.svg" alt="" />
        </button>
      </div>
    </div>
  );
}

function AttributeField(props: {
  readonly node: SvgElementNode;
  readonly attr: SvgAttribute;
  readonly updateElementAttribute: (nodeId: string, name: string, value: string) => void;
  readonly removeElementAttribute: (nodeId: string, name: string) => void;
  readonly selectedPathCommand: () => { readonly nodeId: string; readonly index: number } | undefined;
  readonly setSelectedPathCommand: (selection: { readonly nodeId: string; readonly index: number } | undefined) => void;
}) {
  const type = () => getAttributeType(props.attr.name);
  const enumValues = () => {
    const values: Record<string, readonly string[]> = attributeEnumValues;
    return values[props.attr.name] ?? [];
  };
  const colorValue = () => normalizeColorInput(props.attr.value);

  return (
    <div class="attribute-row" classList={{ unknown: !isAttributeRecognized(props.node.name, props.attr.name) }}>
      <label title={props.attr.name}>{props.attr.name}</label>
      <Show when={type() === "pathdata"}>
        <PathDataEditor
          node={props.node}
          value={props.attr.value}
          update={(value) => props.updateElementAttribute(props.node.id, props.attr.name, value)}
          selectedPathCommand={props.selectedPathCommand}
          setSelectedPathCommand={props.setSelectedPathCommand}
        />
      </Show>
      <Show when={type() === "list" && props.attr.name === "points"}>
        <PointsEditor value={props.attr.value} update={(value) => props.updateElementAttribute(props.node.id, props.attr.name, value)} />
      </Show>
      <Show when={type() === "numeric" || (type() === "list" && props.attr.name !== "points")}>
        <input
          class="mono-input"
          type="text"
          name={`${props.node.id}-${props.attr.name}`}
          aria-label={props.attr.name}
          value={props.attr.value}
          onChange={(event) => props.updateElementAttribute(props.node.id, props.attr.name, clampNumericAttribute(props.attr.name, event.currentTarget.value))}
        />
      </Show>
      <Show when={type() === "enum"}>
        <select name={`${props.node.id}-${props.attr.name}`} aria-label={props.attr.name} value={props.attr.value} onChange={(event) => props.updateElementAttribute(props.node.id, props.attr.name, event.currentTarget.value)}>
          <For each={enumValues()}>{(value) => <option value={value}>{value}</option>}</For>
        </select>
      </Show>
      <Show when={type() === "color"}>
        <div class="color-field">
          <Show when={colorValue()}>
            {(value) => <input type="color" name={`${props.node.id}-${props.attr.name}-picker`} aria-label={`${props.attr.name} picker`} value={value()} onInput={(event) => props.updateElementAttribute(props.node.id, props.attr.name, event.currentTarget.value)} />}
          </Show>
          <input class="mono-input" name={`${props.node.id}-${props.attr.name}`} aria-label={props.attr.name} value={props.attr.value} onChange={(event) => props.updateElementAttribute(props.node.id, props.attr.name, event.currentTarget.value)} list={`color-options-${props.node.id}-${props.attr.name}`} />
          <datalist id={`color-options-${props.node.id}-${props.attr.name}`}>
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
      </Show>
      <Show when={type() === "transform-list"}>
        <TransformField value={props.attr.value} update={(value) => props.updateElementAttribute(props.node.id, props.attr.name, value)} />
      </Show>
      <Show when={["id", "href", "unknown"].includes(type())}>
        <input class="mono-input" name={`${props.node.id}-${props.attr.name}`} aria-label={props.attr.name} value={props.attr.value} onChange={(event) => props.updateElementAttribute(props.node.id, props.attr.name, event.currentTarget.value)} />
      </Show>
      <button class="remove-attribute" type="button" onClick={() => props.removeElementAttribute(props.node.id, props.attr.name)}>
        <img src="/assets/icons/Clear.svg" alt="" />
      </button>
    </div>
  );
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
      <input class="mono-input path-raw" name={`${props.node.id}-d`} aria-label="Path data" value={props.value} onChange={(event) => props.update(event.currentTarget.value)} />
      <div class="path-command-list">
        <For each={commands()}>
          {(command, index) => {
            const selected = () => {
              const current = props.selectedPathCommand();
              return current?.nodeId === props.node.id && current.index === index();
            };
            return (
              <div class="path-command-row" classList={{ selected: selected() }}>
                <button type="button" class="command-pill" onClick={() => props.setSelectedPathCommand({ nodeId: props.node.id, index: index() })}>
                  {command.command}
                </button>
                <select name={`${props.node.id}-command-${index()}`} aria-label="Path command" value={command.command} onChange={(event) => updateCommands(convertCommand(commands(), index(), event.currentTarget.value))}>
                  <For each={pathCommandLetters}>
                    {(letter) => (
                      <>
                        <option value={letter}>{letter}</option>
                        <option value={letter.toLowerCase()}>{letter.toLowerCase()}</option>
                      </>
                    )}
                  </For>
                </select>
                <div class="path-params">
                  <For each={commandParameters(command.command)}>
                    {(param) => (
                      <label>
                        <span>{param.name}</span>
                        <input
                          type="number"
                          step="0.001"
                          name={`${props.node.id}-command-${index()}-${param.name}`}
                          aria-label={param.name}
                          value={command.values[param.index] ?? 0}
                          onChange={(event) => updateCommands(updateCommandValue(commands(), index(), param.index, Number.parseFloat(event.currentTarget.value) || 0))}
                        />
                      </label>
                    )}
                  </For>
                </div>
                <button type="button" title="Insert after" onClick={() => updateCommands(insertPathCommand(commands(), index(), command.command))}>
                  <img src="/assets/icons/InsertAfter.svg" alt="" />
                </button>
                <button type="button" title="Relative/absolute" onClick={() => updateCommands(toggleRelative(commands(), index()))}>
                  <img src="/assets/icons/Translate.svg" alt="" />
                </button>
                <button type="button" title="Delete" onClick={() => updateCommands(deleteCommand(commands(), index()))}>
                  <img src="/assets/icons/Delete.svg" alt="" />
                </button>
              </div>
            );
          }}
        </For>
        <button type="button" class="add-command" onClick={() => updateCommands([...commands(), createCommand("M")])}>
          <img src="/assets/icons/Plus.svg" alt="" /> M
        </button>
      </div>
    </div>
  );
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
  const appendTransform = (item: string) => {
    const prefix = props.value.trim();
    props.update(prefix ? `${prefix} ${item}` : item);
  };

  return (
    <div class="transform-field">
      <input class="mono-input" name="transform" aria-label="Transform" value={props.value} onChange={(event) => props.update(event.currentTarget.value)} />
      <div class="transform-buttons">
        <button type="button" onClick={() => appendTransform("translate(0 0)")}>
          <img src="/assets/icons/Translate.svg" alt="" />
        </button>
        <button type="button" onClick={() => appendTransform("rotate(0)")}>
          <img src="/assets/icons/Rotate.svg" alt="" />
        </button>
        <button type="button" onClick={() => appendTransform("scale(1)")}>
          <img src="/assets/icons/Scale.svg" alt="" />
        </button>
        <button type="button" onClick={() => appendTransform("skewX(0)")}>
          <img src="/assets/icons/SkewX.svg" alt="" />
        </button>
        <button type="button" onClick={() => appendTransform("matrix(1 0 0 1 0 0)")}>
          <img src="/assets/icons/ApplyMatrix.svg" alt="" />
        </button>
      </div>
    </div>
  );
}
