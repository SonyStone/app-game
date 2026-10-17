import { For, Show } from 'solid-js';
import { InfiniteIcon, type InfiniteIconName } from './icons';
import { longPress } from './longPress';
import theme from './theme.module.css';
import type { ToolItem } from './toolCatalog';
import styles from './TopBar.module.css';

/**
 * Infinite Painter's top bar (manual p. 35), always there, with no background of its own: its icons float over the
 * drawing. At the left, Home, and the Selection menu while a selection exists; in the middle, the custom toolbar's
 * docked icons; at the right, the Creative and Editing Tools menus, the Layer panel toggle and the Options menu.
 *
 * Home leads back to the page that embeds Paint (`homeHref`); Paint keeps one drawing, so there is no project gallery.
 * Docked icons run their entry on a tap and, after a long press, drag along the bar or off it (`onDockDragStart`).
 */
export function TopBar(props: {
  homeHref?: string;
  /** The open menu or panel of the bar, whose button shows it. */
  open?: TopBarMenu;
  onMenu: (menu: TopBarMenu, anchor: HTMLElement) => void;
  layersOpen: boolean;
  onLayers: () => void;
  /** A selection exists, so the Selection menu shows. */
  selection: boolean;
  docked: readonly ToolItem[];
  available: (id: string) => boolean;
  active: (id: string) => boolean;
  onRun: (id: string) => void;
  onDockDragStart: (id: string, point: { x: number; y: number }, pointerId: number) => void;
  /** Receives the custom toolbar's area, where dragged icons dock. */
  dockArea: (element: HTMLElement) => void;
  /** Where a dragged icon would land, as a slot index, while one hovers over the area. */
  dropSlot?: number;
}) {
  return (
    <header class={[theme.theme, styles.bar]}>
      <div class={styles.group}>
        <Show
          when={props.homeHref}
          fallback={
            <span class={[theme.iconButton, styles.icon]} aria-hidden="true">
              <InfiniteIcon name="home" size={22} />
            </span>
          }
        >
          {(href) => (
            <a class={[theme.iconButton, styles.icon]} href={href()} aria-label="Home" title="Home · back to Paint">
              <InfiniteIcon name="home" size={22} />
            </a>
          )}
        </Show>
        <Show when={props.selection}>
          <BarButton
            label="Selection menu"
            icon="selectionToggle"
            expanded={props.open === 'selection'}
            accent
            onClick={(anchor) => props.onMenu('selection', anchor)}
          />
        </Show>
      </div>

      <div ref={props.dockArea} class={styles.dock} aria-label="Custom toolbar" role="toolbar">
        <For each={props.docked}>
          {(item, index) => {
            const hold = longPress((point, event) => props.onDockDragStart(item.id, point, event.pointerId));

            return (
              <>
                <Show when={props.dropSlot === index()}>
                  <span class={styles.dropMark} />
                </Show>
                <button
                  class={[theme.iconButton, styles.icon]}
                  aria-label={item.label}
                  title={`${item.label} · long press to move or remove`}
                  aria-pressed={props.active(item.id) ? 'true' : 'false'}
                  disabled={!props.available(item.id)}
                  onClick={() => {
                    if (!hold.consumeClick()) {
                      props.onRun(item.id);
                    }
                  }}
                  {...hold.handlers}
                >
                  <InfiniteIcon name={item.icon} size={22} />
                </button>
              </>
            );
          }}
        </For>
        <Show when={props.dropSlot !== undefined && props.dropSlot >= props.docked.length}>
          <span class={styles.dropMark} />
        </Show>
      </div>

      <div class={styles.group}>
        <BarButton
          label="Creative Tools"
          icon="creativeTools"
          expanded={props.open === 'creative'}
          onClick={(anchor) => props.onMenu('creative', anchor)}
        />
        <BarButton
          label="Editing Tools"
          icon="editingTools"
          expanded={props.open === 'editing'}
          onClick={(anchor) => props.onMenu('editing', anchor)}
        />
        <BarButton label="Layers" icon="layers" expanded={props.layersOpen} onClick={() => props.onLayers()} />
        <BarButton
          label="Options"
          icon="more"
          expanded={props.open === 'options'}
          onClick={(anchor) => props.onMenu('options', anchor)}
        />
      </div>
    </header>
  );
}

/** The menus that the top bar's buttons open. */
export type TopBarMenu = 'creative' | 'editing' | 'options' | 'selection';

/** The bar's height in CSS pixels, below which panels open. */
export const topBarHeight = 48;

function BarButton(props: {
  label: string;
  icon: InfiniteIconName;
  expanded: boolean;
  /** Drawn in red, as Infinite Painter marks an active selection. */
  accent?: boolean;
  onClick: (anchor: HTMLElement) => void;
}) {
  return (
    <button
      class={[theme.iconButton, styles.icon]}
      aria-label={props.label}
      title={props.label}
      aria-expanded={props.expanded ? 'true' : 'false'}
      data-accent={props.accent ? '' : undefined}
      onClick={(event) => props.onClick(event.currentTarget)}
    >
      <InfiniteIcon name={props.icon} size={22} />
    </button>
  );
}
