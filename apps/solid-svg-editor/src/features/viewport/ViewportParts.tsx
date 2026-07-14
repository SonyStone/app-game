import { createMemo, For, Show } from "solid-js";

import { createGridLines } from "../../editor/handles";
import type {
  ViewportLayerContribution,
  ViewportLayerPlacement,
  ViewportLayerService,
  ViewportOverlayContribution,
  ViewportOverlayPlacement,
  ViewportOverlayService,
  ViewportToolbarContribution,
  ViewportToolbarPlacement
} from "../../editor/kernel";
import type { Rect } from "../../editor/geometry";
import type { HandleDescriptor, TransformBoxHandleDescriptor, ViewRect } from "../../editor/types";

export { SvgNodeView } from './svg-renderer';

export function ViewportToolbar<TContext>(props: {
  readonly items?: readonly ViewportToolbarContribution<TContext>[] | undefined;
  readonly context?: TContext | undefined;
}) {
  const leftItems = createMemo(() => orderedToolbarItems(props.items ?? [], 'left'));
  const rightItems = createMemo(() => orderedToolbarItems(props.items ?? [], 'right'));

  return (
    <div class="viewport-toolbar relative z-10 flex min-w-0 items-center justify-between bg-[var(--base)] px-1" data-testid="viewport-toolbar">
      <div class="viewport-left-tools flex min-w-0 items-center gap-1" data-testid="viewport-left-tools">
        <For each={leftItems()}>{(item) => renderToolbarItem(item, props.context)}</For>
      </div>
      <div class="zoom-widget flex min-w-0 items-center gap-1" data-testid="zoom-widget">
        <For each={rightItems()}>{(item) => renderToolbarItem(item, props.context)}</For>
      </div>
    </div>
  );
}

function orderedToolbarItems<TContext>(
  items: readonly ViewportToolbarContribution<TContext>[],
  placement: ViewportToolbarPlacement
): readonly ViewportToolbarContribution<TContext>[] {
  return [...items]
    .filter((item) => (item.placement ?? 'left') === placement)
    .sort((first, second) => (first.order ?? 0) - (second.order ?? 0) || first.id.localeCompare(second.id));
}

function renderToolbarItem<TContext>(
  item: ViewportToolbarContribution<TContext>,
  context: TContext | undefined
) {
  return context ? item.render(context) : null;
}

export function ViewportLayerStack<TContext>(props: {
  readonly items?: readonly ViewportLayerContribution<TContext>[] | undefined;
  readonly context?: TContext | undefined;
  readonly layers: ViewportLayerService;
  readonly placement: ViewportLayerPlacement;
}) {
  const items = createMemo(() => orderedLayerItems(props.items ?? [], props.placement));

  return <For each={items()}>{(item) => renderLayerItem(item, props.context, props.layers)}</For>;
}

function orderedLayerItems<TContext>(
  items: readonly ViewportLayerContribution<TContext>[],
  placement: ViewportLayerPlacement
): readonly ViewportLayerContribution<TContext>[] {
  return [...items]
    .filter((item) => item.placement === placement)
    .sort((first, second) => (first.order ?? 0) - (second.order ?? 0) || first.id.localeCompare(second.id));
}

function renderLayerItem<TContext>(
  item: ViewportLayerContribution<TContext>,
  context: TContext | undefined,
  layers: ViewportLayerService
) {
  return context ? item.render({ context, layers }) : null;
}

export function ViewportOverlayLayer<TContext>(props: {
  readonly items?: readonly ViewportOverlayContribution<TContext>[] | undefined;
  readonly context?: TContext | undefined;
  readonly overlays: ViewportOverlayService;
  readonly placement: ViewportOverlayPlacement;
}) {
  const items = createMemo(() => orderedOverlayItems(props.items ?? [], props.placement));

  return <For each={items()}>{(item) => renderOverlayItem(item, props.context, props.overlays)}</For>;
}

function orderedOverlayItems<TContext>(
  items: readonly ViewportOverlayContribution<TContext>[],
  placement: ViewportOverlayPlacement
): readonly ViewportOverlayContribution<TContext>[] {
  return [...items]
    .filter((item) => item.placement === placement)
    .sort((first, second) => (first.order ?? 0) - (second.order ?? 0) || first.id.localeCompare(second.id));
}

function renderOverlayItem<TContext>(
  item: ViewportOverlayContribution<TContext>,
  context: TContext | undefined,
  overlays: ViewportOverlayService
) {
  return context ? item.render({ context, overlays }) : null;
}

export function SelectionMarquee(props: { readonly rect: Rect | undefined }) {
  return (
    <Show when={props.rect}>
      {(rect) => (
        <div
          class="selection-marquee pointer-events-none absolute z-4 border border-[color-mix(in_srgb,var(--accent)_82%,#ffffff)] bg-[color-mix(in_srgb,var(--accent)_18%,transparent)] shadow-[0_0_0_1px_#0008]"
          style={{
            left: `${rect().x}px`,
            top: `${rect().y}px`,
            width: `${rect().width}px`,
            height: `${rect().height}px`
          }}
          data-testid="selection-marquee"
        />
      )}
    </Show>
  );
}

export function GridLayer(props: { readonly viewRect: ViewRect; readonly zoom: number; readonly color: string; readonly moving: boolean }) {
  const lines = createMemo(() => createGridLines(props.viewRect, props.zoom, props.moving ? 128 : 64));
  const showLabels = createMemo(() => !props.moving);

  return (
    <g class="grid-layer pointer-events-none font-['GodSVG_Mono',ui-monospace,monospace]" data-testid="grid-layer">
      <For each={lines().minorVertical}>{(x) => <line x1={x} y1={props.viewRect.y} x2={x} y2={props.viewRect.y + props.viewRect.height} stroke={props.color} opacity="0.12" stroke-width={1 / props.zoom} />}</For>
      <For each={lines().minorHorizontal}>{(y) => <line x1={props.viewRect.x} y1={y} x2={props.viewRect.x + props.viewRect.width} y2={y} stroke={props.color} opacity="0.12" stroke-width={1 / props.zoom} />}</For>
      <For each={lines().majorVertical}>
        {(x) => (
          <>
            <line x1={x} y1={props.viewRect.y} x2={x} y2={props.viewRect.y + props.viewRect.height} stroke={props.color} opacity="0.34" stroke-width={1 / props.zoom} />
            <Show when={showLabels()}>
              <text x={x + 4 / props.zoom} y={props.viewRect.y + 16 / props.zoom} fill={props.color} opacity="0.58" font-size={String(13 / props.zoom)}>
                {String(x)}
              </text>
            </Show>
          </>
        )}
      </For>
      <For each={lines().majorHorizontal}>
        {(y) => (
          <>
            <line x1={props.viewRect.x} y1={y} x2={props.viewRect.x + props.viewRect.width} y2={y} stroke={props.color} opacity="0.34" stroke-width={1 / props.zoom} />
            <Show when={showLabels()}>
              <text x={props.viewRect.x + 4 / props.zoom} y={y + 14 / props.zoom} fill={props.color} opacity="0.58" font-size={String(13 / props.zoom)}>
                {String(y)}
              </text>
            </Show>
          </>
        )}
      </For>
      <line x1={0} y1={props.viewRect.y} x2={0} y2={props.viewRect.y + props.viewRect.height} stroke={props.color} opacity="0.7" stroke-width={1 / props.zoom} />
      <line x1={props.viewRect.x} y1={0} x2={props.viewRect.x + props.viewRect.width} y2={0} stroke={props.color} opacity="0.7" stroke-width={1 / props.zoom} />
    </g>
  );
}

export function HandlesLayer(props: {
  readonly handles: readonly HandleDescriptor[];
  readonly zoom: number;
  readonly onHandlePointerDown: (event: PointerEvent, handle: HandleDescriptor) => void;
}) {
  return (
    <g data-testid="handles-layer">
      <For each={props.handles}>
        {(handle) => (
          <g data-testid={`selection-handle-group-${handle.nodeId}-${handle.id}`}>
            <circle
              class={handle.small ? "handle small cursor-grab fill-[#d8e7ff] stroke-[#23314f] [vector-effect:non-scaling-stroke] hover:fill-[var(--accent)]" : "handle cursor-grab fill-[#f8fafc] stroke-[#111827] [vector-effect:non-scaling-stroke] hover:fill-[var(--accent)]"}
              classList={{
                'fill-[var(--accent)] stroke-white': handle.active
              }}
              data-active={handle.active ? 'true' : undefined}
              data-testid={`selection-handle-${handle.nodeId}-${handle.id}`}
              cx={handle.x}
              cy={handle.y}
              r={(handle.active ? 5.2 : handle.small ? 3.2 : 4.6) / props.zoom}
              stroke-width={(handle.active ? 2 : 1.4) / props.zoom}
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
  readonly box: ViewRect | undefined;
  readonly zoom: number;
  readonly onHandlePointerDown: (event: PointerEvent, handle: TransformBoxHandleDescriptor) => void;
}) {
  const handles = createMemo(() => {
    const box = props.box;

    if (!box || box.width <= 0 || box.height <= 0) {
      return [] as readonly TransformBoxHandleDescriptor[];
    }

    const left = box.x;
    const top = box.y;
    const right = box.x + box.width;
    const bottom = box.y + box.height;
    const centerX = box.x + box.width / 2;
    const centerY = box.y + box.height / 2;
    const rotateOffset = 28 / props.zoom;

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
    <Show when={props.box}>
      {(box) => (
        <g class="transform-box-layer pointer-events-none" data-testid="transform-box-layer">
          <rect class="transform-box-outline fill-none stroke-[var(--accent)] [stroke-dasharray:7_5] [vector-effect:non-scaling-stroke]" data-testid="transform-box-outline" x={box().x} y={box().y} width={box().width} height={box().height} stroke-width={1.2 / props.zoom} />
          <line class="transform-box-rotate-line fill-none stroke-[var(--accent)] [stroke-dasharray:7_5] [vector-effect:non-scaling-stroke]" data-testid="transform-box-rotate-line" x1={box().x + box().width / 2} y1={box().y} x2={box().x + box().width / 2} y2={box().y - 28 / props.zoom} stroke-width={1 / props.zoom} />
          <For each={handles()}>
            {(handle) => (
              <rect
                class={`transform-box-handle pointer-events-auto fill-[#eef4ff] stroke-[#111827] [vector-effect:non-scaling-stroke] hover:fill-[var(--accent)] ${
                  handle.kind === "nw" || handle.kind === "se"
                    ? "cursor-nwse-resize"
                    : handle.kind === "ne" || handle.kind === "sw"
                      ? "cursor-nesw-resize"
                      : handle.kind === "n" || handle.kind === "s"
                        ? "cursor-ns-resize"
                        : handle.kind === "e" || handle.kind === "w"
                          ? "cursor-ew-resize"
                          : "rotate cursor-grab fill-[#ffd166]"
                }`}
                data-transform-handle={handle.kind}
                data-testid={`transform-box-handle-${handle.kind}`}
                x={handle.x - 4.6 / props.zoom}
                y={handle.y - 4.6 / props.zoom}
                width={9.2 / props.zoom}
                height={9.2 / props.zoom}
                rx={1.3 / props.zoom}
                stroke-width={1.2 / props.zoom}
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
