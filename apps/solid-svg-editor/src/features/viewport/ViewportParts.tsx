import { createMemo, createSignal, For, Show } from "solid-js";
import { Dynamic } from "solid-js/web";

import { attrsToObject } from "../../editor/tree-utils";
import { createGridLines } from "../../editor/handles";
import type { AppSettings, DragSelectionMode, HandleDescriptor, TransformBoxHandleDescriptor, ViewRect } from "../../editor/types";
import type { SvgNode } from "../../svg-model";
import { IconButton } from "../chrome/TopBar";

export function ViewportToolbar(props: {
  readonly settings: () => AppSettings;
  readonly setSettings: (setter: (settings: AppSettings) => AppSettings) => void;
  readonly zoom: () => number;
  readonly zoomBy: (factor: number) => void;
  readonly centerFrame: () => void;
  readonly isFullscreen: () => boolean;
  readonly toggleFullscreen: () => void;
  readonly openReferenceDialog: () => void;
  readonly hasReference: () => boolean;
  readonly showReference: () => boolean;
  readonly setShowReference: (show: boolean) => void;
  readonly overlayReference: () => boolean;
  readonly setOverlayReference: (overlay: boolean) => void;
  readonly clearReference: () => void;
  readonly dragSelectionMode: () => DragSelectionMode;
  readonly setDragSelectionMode: (mode: DragSelectionMode) => void;
}) {
  const [visualsOpen, setVisualsOpen] = createSignal(false);
  const [referenceOpen, setReferenceOpen] = createSignal(false);

  return (
    <div class="viewport-toolbar">
      <div class="viewport-left-tools">
        <IconButton icon="/assets/icons/Visuals.svg" label="Visuals" active={visualsOpen()} onClick={() => setVisualsOpen(!visualsOpen())} />
        <Show when={visualsOpen()}>
          <div class="popover viewport-popover">
            <label>
              <input type="checkbox" checked={props.settings().showGrid} onChange={(event) => props.setSettings((settings) => ({ ...settings, showGrid: event.currentTarget.checked }))} />
              Grid
            </label>
            <label>
              <input type="checkbox" checked={props.settings().showHandles} onChange={(event) => props.setSettings((settings) => ({ ...settings, showHandles: event.currentTarget.checked }))} />
              Handles
            </label>
            <label>
              <input type="checkbox" checked={props.settings().viewRasterized} onChange={(event) => props.setSettings((settings) => ({ ...settings, viewRasterized: event.currentTarget.checked }))} />
              Rasterized
            </label>
          </div>
        </Show>
        <IconButton icon="/assets/icons/Reference.svg" label="Reference" active={referenceOpen()} onClick={() => setReferenceOpen(!referenceOpen())} />
        <Show when={referenceOpen()}>
          <div class="popover viewport-popover">
            <button type="button" onClick={props.openReferenceDialog}>
              <img src="/assets/icons/FileBrowse.svg" alt="" /> Load reference
            </button>
            <button type="button" disabled={!props.hasReference()} onClick={props.clearReference}>
              <img src="/assets/icons/Clear.svg" alt="" /> Clear reference
            </button>
            <label classList={{ disabled: !props.hasReference() }}>
              <input type="checkbox" checked={props.showReference()} disabled={!props.hasReference()} onChange={(event) => props.setShowReference(event.currentTarget.checked)} />
              Show
            </label>
            <label classList={{ disabled: !props.hasReference() }}>
              <input type="checkbox" checked={props.overlayReference()} disabled={!props.hasReference()} onChange={(event) => props.setOverlayReference(event.currentTarget.checked)} />
              Overlay
            </label>
          </div>
        </Show>
        <button class="snap-button" type="button" classList={{ active: props.settings().snapEnabled }} onClick={() => props.setSettings((settings) => ({ ...settings, snapEnabled: !settings.snapEnabled }))}>
          <img src="/assets/icons/Snap.svg" alt="" />
        </button>
        <input
          class="snap-input"
          type="number"
          min="0.001"
          step="1"
          name="snap-size"
          aria-label="Snap size"
          value={props.settings().snapSize}
          disabled={!props.settings().snapEnabled}
          onChange={(event) => props.setSettings((settings) => ({ ...settings, snapSize: Math.max(0.001, Number.parseFloat(event.currentTarget.value) || 1) }))}
        />
        <div class="selection-mode-toggle">
          <button type="button" classList={{ active: props.dragSelectionMode() === "intersect" }} title="Select touched objects" onClick={() => props.setDragSelectionMode("intersect")}>
            Touch
          </button>
          <button type="button" classList={{ active: props.dragSelectionMode() === "contain" }} title="Select enclosed objects" onClick={() => props.setDragSelectionMode("contain")}>
            Inside
          </button>
        </div>
      </div>
      <div class="zoom-widget">
        <IconButton icon="/assets/icons/Expand.svg" label={props.isFullscreen() ? "Exit fullscreen" : "Fullscreen"} active={props.isFullscreen()} onClick={props.toggleFullscreen} />
        <IconButton icon="/assets/icons/Minus.svg" label="Zoom out" onClick={() => props.zoomBy(1 / Math.SQRT2)} />
        <button type="button" onClick={props.centerFrame}>{Math.round(props.zoom() * 100)}%</button>
        <IconButton icon="/assets/icons/Plus.svg" label="Zoom in" onClick={() => props.zoomBy(Math.SQRT2)} />
      </div>
    </div>
  );
}

export function SvgNodeView(props: {
  readonly node: SvgNode;
  readonly selectedIds: () => readonly string[];
  readonly onNodePointerDown: (id: string, event: PointerEvent) => void;
  readonly openContextMenu: (event: MouseEvent, nodeId: string) => void;
}) {
  const node = props.node;

  if (node.kind === "text") {
    return <>{node.text}</>;
  }

  if (node.kind === "comment" || node.kind === "cdata") {
    return null;
  }

  const attrs = createMemo(() => attrsToObject(node.attrs));
  const selected = createMemo(() => props.selectedIds().includes(node.id));

  return (
    <Dynamic
      component={node.name}
      {...attrs()}
      data-node-id={node.id}
      classList={{ "svg-node-selected": selected() }}
      onPointerDown={(event: PointerEvent) => {
        if (event.pointerType === "touch" || event.button === 1 || event.altKey) {
          return;
        }

        event.stopPropagation();
        props.onNodePointerDown(node.id, event);
      }}
      onContextMenu={(event: MouseEvent) => {
        if (event.altKey) {
          event.preventDefault();
          return;
        }

        props.openContextMenu(event, node.id);
      }}
    >
      <For each={node.children}>{(child) => <SvgNodeView node={child} selectedIds={props.selectedIds} onNodePointerDown={props.onNodePointerDown} openContextMenu={props.openContextMenu} />}</For>
    </Dynamic>
  );
}

export function GridLayer(props: { readonly viewRect: () => ViewRect; readonly zoom: () => number; readonly color: () => string; readonly moving: () => boolean }) {
  const lines = createMemo(() => createGridLines(props.viewRect(), props.zoom(), props.moving() ? 128 : 64));
  const showLabels = createMemo(() => !props.moving());

  return (
    <g class="grid-layer">
      <For each={lines().minorVertical}>{(x) => <line x1={x} y1={props.viewRect().y} x2={x} y2={props.viewRect().y + props.viewRect().height} stroke={props.color()} opacity="0.12" stroke-width={1 / props.zoom()} />}</For>
      <For each={lines().minorHorizontal}>{(y) => <line x1={props.viewRect().x} y1={y} x2={props.viewRect().x + props.viewRect().width} y2={y} stroke={props.color()} opacity="0.12" stroke-width={1 / props.zoom()} />}</For>
      <For each={lines().majorVertical}>
        {(x) => (
          <>
            <line x1={x} y1={props.viewRect().y} x2={x} y2={props.viewRect().y + props.viewRect().height} stroke={props.color()} opacity="0.34" stroke-width={1 / props.zoom()} />
            <Show when={showLabels()}>
              <text x={x + 4 / props.zoom()} y={props.viewRect().y + 16 / props.zoom()} fill={props.color()} opacity="0.58" font-size={String(13 / props.zoom())}>
                {String(x)}
              </text>
            </Show>
          </>
        )}
      </For>
      <For each={lines().majorHorizontal}>
        {(y) => (
          <>
            <line x1={props.viewRect().x} y1={y} x2={props.viewRect().x + props.viewRect().width} y2={y} stroke={props.color()} opacity="0.34" stroke-width={1 / props.zoom()} />
            <Show when={showLabels()}>
              <text x={props.viewRect().x + 4 / props.zoom()} y={y + 14 / props.zoom()} fill={props.color()} opacity="0.58" font-size={String(13 / props.zoom())}>
                {String(y)}
              </text>
            </Show>
          </>
        )}
      </For>
      <line x1={0} y1={props.viewRect().y} x2={0} y2={props.viewRect().y + props.viewRect().height} stroke={props.color()} opacity="0.7" stroke-width={1 / props.zoom()} />
      <line x1={props.viewRect().x} y1={0} x2={props.viewRect().x + props.viewRect().width} y2={0} stroke={props.color()} opacity="0.7" stroke-width={1 / props.zoom()} />
    </g>
  );
}

export function HandlesLayer(props: {
  readonly handles: () => readonly HandleDescriptor[];
  readonly zoom: () => number;
  readonly onHandlePointerDown: (event: PointerEvent, handle: HandleDescriptor) => void;
}) {
  return (
    <g class="handles-layer">
      <For each={props.handles()}>
        {(handle) => (
          <g>
            <circle
              class={handle.small ? "handle small" : "handle"}
              cx={handle.x}
              cy={handle.y}
              r={(handle.small ? 3.2 : 4.6) / props.zoom()}
              stroke-width={1.4 / props.zoom()}
              onPointerDown={(event) => props.onHandlePointerDown(event, handle)}
            />
            <title>{handle.label}</title>
          </g>
        )}
      </For>
    </g>
  );
}

export function TransformBoxLayer(props: {
  readonly box: () => ViewRect | undefined;
  readonly zoom: () => number;
  readonly onHandlePointerDown: (event: PointerEvent, handle: TransformBoxHandleDescriptor) => void;
}) {
  const handles = createMemo(() => {
    const box = props.box();

    if (!box || box.width <= 0 || box.height <= 0) {
      return [] as readonly TransformBoxHandleDescriptor[];
    }

    const left = box.x;
    const top = box.y;
    const right = box.x + box.width;
    const bottom = box.y + box.height;
    const centerX = box.x + box.width / 2;
    const centerY = box.y + box.height / 2;
    const rotateOffset = 28 / props.zoom();

    return [
      { kind: "nw", x: left, y: top, label: "Resize northwest" },
      { kind: "n", x: centerX, y: top, label: "Resize north" },
      { kind: "ne", x: right, y: top, label: "Resize northeast" },
      { kind: "e", x: right, y: centerY, label: "Resize east" },
      { kind: "se", x: right, y: bottom, label: "Resize southeast" },
      { kind: "s", x: centerX, y: bottom, label: "Resize south" },
      { kind: "sw", x: left, y: bottom, label: "Resize southwest" },
      { kind: "w", x: left, y: centerY, label: "Resize west" },
      { kind: "rotate", x: centerX, y: top - rotateOffset, label: "Rotate selection" }
    ] as const satisfies readonly TransformBoxHandleDescriptor[];
  });

  return (
    <Show when={props.box()}>
      {(box) => (
        <g class="transform-box-layer">
          <rect class="transform-box-outline" x={box().x} y={box().y} width={box().width} height={box().height} stroke-width={1.2 / props.zoom()} />
          <line class="transform-box-rotate-line" x1={box().x + box().width / 2} y1={box().y} x2={box().x + box().width / 2} y2={box().y - 28 / props.zoom()} stroke-width={1 / props.zoom()} />
          <For each={handles()}>
            {(handle) => (
              <rect
                class={handle.kind === "rotate" ? "transform-box-handle rotate" : "transform-box-handle"}
                data-transform-handle={handle.kind}
                x={handle.x - 4.6 / props.zoom()}
                y={handle.y - 4.6 / props.zoom()}
                width={9.2 / props.zoom()}
                height={9.2 / props.zoom()}
                rx={1.3 / props.zoom()}
                stroke-width={1.2 / props.zoom()}
                onPointerDown={(event) => props.onHandlePointerDown(event, handle)}
              >
                <title>{handle.label}</title>
              </rect>
            )}
          </For>
        </g>
      )}
    </Show>
  );
}
