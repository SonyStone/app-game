import type { JSX } from '@solidjs/web';
import { For, Show } from 'solid-js';
import { pressHandlers } from '../../shared/ui/pressHandlers';
import { SketchIcon } from '../../shared/ui/SketchIcon';
import type { Workspace } from './createWorkspace';
import styles from './Dock.module.css';
import { panelIds, resizePair, sashPair, type PanelId } from './layout';

/**
 * The dock: the panels stacked in one column, as Blender's and Photoshop's side panels. A panel's header collapses
 * and expands it (its body stays mounted, keeping its state); the sashes between panels share the height of the
 * nearest expanded panels around them. Heights and collapsed panels are remembered by the workspace.
 */
export function Dock(props: {
  workspace: Workspace;
  /**
   * Each panel's title, header controls (shown while expanded) and body, each created once, and its largest height
   * in CSS pixels, header included, for a panel whose content does not grow, so the others take the space.
   */
  panels: Record<PanelId, { title: string; header?: JSX.Element; body: JSX.Element; maxHeight?: number }>;
}) {
  const elements: Partial<Record<PanelId, HTMLElement>> = {};
  const layout = () => props.workspace.layout();

  return (
    <aside class={styles.dock} aria-label="Panels">
      <For each={panelIds}>
        {(id, index) => {
          const panel = props.panels[id];
          const collapsed = () => layout().collapsed[id];
          const size = () => layout().sizes[id];

          return (
            <>
              <section
                ref={(element) => (elements[id] = element)}
                class={styles.panel}
                aria-label={panel.title}
                data-collapsed={collapsed() ? 'true' : 'false'}
                style={{
                  flex: collapsed() ? '0 0 auto' : `${size()} ${size()} 0px`,
                  'max-height': panel.maxHeight === undefined ? undefined : `${panel.maxHeight}px`
                }}
              >
                <header class={styles.header}>
                  <button
                    class={styles.title}
                    aria-expanded={collapsed() ? 'false' : 'true'}
                    title={collapsed() ? `Expand ${panel.title}` : `Collapse ${panel.title}`}
                    onClick={() => props.workspace.toggleCollapsed(id)}
                  >
                    <span class={styles.chevron}>
                      <SketchIcon name={collapsed() ? 'right' : 'down'} size={12} />
                    </span>
                    {panel.title}
                  </button>
                  <Show when={!collapsed() && panel.header}>
                    <div class={styles.headerControls}>{panel.header}</div>
                  </Show>
                </header>
                <div class={styles.body} hidden={collapsed()}>
                  {panel.body}
                </div>
              </section>
              <Show when={index() < panelIds.length - 1}>
                <PanelSash workspace={props.workspace} index={index()} elements={elements} />
              </Show>
            </>
          );
        }}
      </For>
    </aside>
  );
}

/**
 * The sash below panel `index`: drags the boundary between the nearest expanded panels around it (see `sashPair`),
 * inert when there are none on one side.
 */
function PanelSash(props: { workspace: Workspace; index: number; elements: Partial<Record<PanelId, HTMLElement>> }) {
  const pair = () => sashPair(props.workspace.layout().collapsed, props.index);
  let start:
    | {
        above: PanelId;
        below: PanelId;
        heights: { above: number; below: number };
        all: Partial<Record<PanelId, number>>;
      }
    | undefined;
  // Created once: a spread re-runs when the element's other attributes change, which would forget the press.
  const press = pressHandlers({
    start() {
      const current = pair();
      const above = current && props.elements[current[0]];
      const below = current && props.elements[current[1]];
      if (!current || !above || !below) {
        return false;
      }

      // Every expanded panel's weight becomes its height, so that only the pair moves.
      const all = Object.fromEntries(
        panelIds.flatMap((id) => {
          const element = props.elements[id];
          return element && !props.workspace.layout().collapsed[id]
            ? [[id, element.getBoundingClientRect().height]]
            : [];
        })
      );
      start = {
        above: current[0],
        below: current[1],
        heights: { above: above.getBoundingClientRect().height, below: below.getBoundingClientRect().height },
        all
      };
    },
    move(drag) {
      if (start) {
        const next = resizePair(start.heights, drag.point.y - drag.start.y, minPanelHeight);
        props.workspace.setSizes({ ...start.all, [start.above]: next.above, [start.below]: next.below });
      }
    },
    end() {
      start = undefined;
    },
    cancel() {
      start = undefined;
    },
    tapDistance: 0
  });

  return (
    <div
      class={styles.sash}
      role="separator"
      aria-orientation="horizontal"
      data-inert={pair() ? 'false' : 'true'}
      {...press}
    />
  );
}

/** The smallest height of an expanded panel, header included, in CSS pixels. */
const minPanelHeight = 96;

/**
 * The sash between the canvas and the dock: dragging it sideways resizes the dock, which is on side `dock` of it.
 */
export function WidthSash(props: { workspace: Workspace }) {
  let startWidth = 0;
  const press = pressHandlers({
    start() {
      startWidth = props.workspace.layout().width;
    },
    move(drag) {
      const dx = drag.point.x - drag.start.x;
      props.workspace.setWidth(props.workspace.layout().dock === 'right' ? startWidth - dx : startWidth + dx);
    },
    tapDistance: 0
  });

  return (
    <div class={styles.widthSash} role="separator" aria-orientation="vertical" aria-label="Resize panels" {...press} />
  );
}
