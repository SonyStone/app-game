import { cn } from '@app-game/utils/cn';
import type { JSX } from '@solidjs/web';
import {
  DOCK_OVERLAY_Z_INDEX,
  type DockController,
  type DockEdge,
  dockGuides,
  type DockPanelView,
  type DockRect,
  dockRootGuides,
  type DockZone,
  rectStyle,
  useDock
} from 'solid-dock';
import { createMemo, For, Show } from 'solid-js';

/*
 * Drag-behaviour add-ons for the playground. Each is ordinary JSX on top of the
 * dock controller (`useDock()`): the library supplies the drag session, the
 * preview and slot rectangles; these parts decide how to show them.
 */

/** Height of the floating window's title bar, in px. */
const TITLE_BAR = 32;

/** Size used when the drag started without a measured slot. */
const FALLBACK_BODY = { width: 300, height: 190 };

/**
 * Where the floating window is: the panel keeps the size it had in its group and
 * its offset from the pointer, so lifting it out of the layout barely moves it.
 * The title bar sits above the body, where the group's tab strip was.
 */
function floatingWindow(dock: DockController): { panelId: string; body: DockRect; frame: DockRect } | undefined {
  const session = dock.drag.session();
  if (session?.subject.type !== 'panel') {
    return undefined;
  }

  const point = dock.toRootPoint(session.point);
  const origin = dock.toRootPoint(session.origin);
  if (!point || !origin) {
    return undefined;
  }

  const source = session.sourceRect;
  const body: DockRect = source
    ? {
        x: point.x + source.x - origin.x,
        y: point.y + source.y - origin.y,
        width: source.width,
        height: source.height
      }
    : { x: point.x + 14, y: point.y + 14 + TITLE_BAR, ...FALLBACK_BODY };

  return {
    panelId: session.subject.panelId,
    body,
    frame: { x: body.x, y: body.y - TITLE_BAR, width: body.width, height: body.height + TITLE_BAR }
  };
}

/** Places the detached panel in the body of the floating window. */
export function floatingPanelStyle(panel: DockPanelView, dock: DockController): JSX.CSSProperties | undefined {
  const window = panel.dragging() ? floatingWindow(dock) : undefined;
  if (!window) {
    return undefined;
  }

  return {
    ...rectStyle(window.body),
    visibility: 'visible',
    'content-visibility': 'visible',
    'pointer-events': 'none',
    'z-index': DOCK_OVERLAY_Z_INDEX + 1
  };
}

/**
 * Frame of the floating window: a title bar showing the dragged tab plus a body
 * the detached panel fills (see {@link floatingPanelStyle}). Colours come from the
 * dock's text colour and color-scheme (`Canvas`), so it suits light and dark designs.
 */
export function FloatingWindowFrame(): JSX.Element {
  const dock = useDock();

  return (
    <Show when={floatingWindow(dock)}>
      {(window) => (
        <div
          style={{ ...rectStyle(window().frame), 'pointer-events': 'none', 'z-index': DOCK_OVERLAY_Z_INDEX }}
          class="overflow-hidden rounded-[8px] border border-[color-mix(in_srgb,currentColor_22%,transparent)] bg-[Canvas] shadow-[0_18px_48px_rgb(0_0_0/0.35)]"
        >
          <div
            style={{ height: `${TITLE_BAR}px` }}
            class="flex items-end border-b border-[color-mix(in_srgb,currentColor_15%,transparent)] bg-[color-mix(in_srgb,currentColor_7%,Canvas)] px-2"
          >
            <div class="flex h-[26px] items-center gap-1.5 rounded-t-[6px] bg-[Canvas] px-3 text-[13px] whitespace-nowrap">
              {dock.panel(window().panelId)?.title ?? window().panelId}
            </div>
          </div>
        </div>
      )}
    </Show>
  );
}

/** Compass guides over the hovered group and on the dock edges, matching {@link findGuideDropTarget}. */
export function DockingGuides(): JSX.Element {
  const dock = useDock();
  const target = () => dock.drag.preview()?.target;
  const hovered = createMemo(() => {
    const session = dock.drag.session();
    const point = session && dock.toRootPoint(session.point);
    if (!point) {
      return undefined;
    }

    const entry = Object.entries(dock.slots.rects).find(([, rect]) => contains(rect, point));
    return entry && { groupId: entry[0], rect: entry[1] };
  });
  // The resolver measures the root's border box; the overlay origin is its padding box.
  const rootRect = (): DockRect | undefined => {
    const root = dock.root();
    return root && { x: -root.clientLeft, y: -root.clientTop, width: root.offsetWidth, height: root.offsetHeight };
  };

  /**
   * A dock-edge guide is shown when it changes the layout and is not just the
   * same edge of a group that already runs along it. Independent of the pointer,
   * so guides do not flicker while dragging.
   */
  const usefulRootGuide = (edge: DockEdge): boolean =>
    dock.drag.canDrop({ type: 'root', edge }) && !dock.drag.isRedundantEdge(edge);

  return (
    <Show when={dock.drag.session()}>
      <Show when={hovered()} keyed>
        {(group) => (
          // Only guides that would change the layout, such as never merging a tab into its own group.
          <For
            each={dockGuides(group.rect).filter((guide) =>
              dock.drag.canDrop({ type: 'group', groupId: group.groupId, zone: guide.zone })
            )}
          >
            {(guide) => {
              const active = () => {
                const current = target();
                return current?.type === 'group' && current.groupId === group.groupId && current.zone === guide.zone;
              };
              return <Guide rect={guide.rect} zone={guide.zone} active={active()} />;
            }}
          </For>
        )}
      </Show>
      <Show when={dock.state.nodes[dock.state.root]?.type === 'split' && rootRect()}>
        {(rect) => (
          <For each={dockRootGuides(rect()).filter((guide) => usefulRootGuide(guide.edge))}>
            {(guide) => {
              const active = () => {
                const current = target();
                return current?.type === 'root' && current.edge === guide.edge;
              };
              return <Guide rect={guide.rect} zone={guide.edge} active={active()} />;
            }}
          </For>
        )}
      </Show>
    </Show>
  );
}

function Guide(props: { rect: DockRect; zone: DockZone | DockEdge; active: boolean }): JSX.Element {
  return (
    <div
      style={{ ...rectStyle(props.rect), 'pointer-events': 'none', 'z-index': DOCK_OVERLAY_Z_INDEX + 10 }}
      class={cn(
        'rounded-[6px] border bg-white/95 shadow-md transition-colors',
        props.active ? 'border-sky-500' : 'border-neutral-300'
      )}
    >
      <div
        class={cn('absolute rounded-[2px]', GUIDE_FILL[props.zone], props.active ? 'bg-sky-500' : 'bg-neutral-300')}
      />
    </div>
  );
}

const GUIDE_FILL: Record<DockZone, string> = {
  center: 'inset-1.5',
  left: 'inset-y-1.5 left-1.5 w-2.5',
  right: 'inset-y-1.5 right-1.5 w-2.5',
  top: 'inset-x-1.5 top-1.5 h-2.5',
  bottom: 'inset-x-1.5 bottom-1.5 h-2.5'
};

function contains(rect: DockRect, point: { x: number; y: number }): boolean {
  return point.x >= rect.x && point.x <= rect.x + rect.width && point.y >= rect.y && point.y <= rect.y + rect.height;
}
