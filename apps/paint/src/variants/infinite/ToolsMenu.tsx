import { For, Show } from 'solid-js';
import { InfiniteIcon } from './icons';
import { longPress } from './longPress';
import theme from './theme.module.css';
import type { ToolItem, ToolSection } from './toolCatalog';
import styles from './ToolsMenu.module.css';

/**
 * An Infinite Painter tools menu (manual pp. 36–38): titled sections of icons with their labels under them, four to a
 * row; a longer row scrolls sideways and shows a chevron. Entries Paint cannot run are disabled, and the active ones
 * are lit. A long press on an entry hands it to `onDragStart`, which docks it on the custom toolbar (p. 39).
 */
export function ToolsMenu(props: {
  label: string;
  sections: readonly ToolSection[];
  available: (id: string) => boolean;
  active: (id: string) => boolean;
  onRun: (id: string) => void;
  /** A long press on an entry; `point` is the pointer in client CSS pixels. Omitted where nothing can be docked. */
  onDragStart?: (item: ToolItem, point: { x: number; y: number }, event: PointerEvent) => void;
}) {
  return (
    <nav class={[theme.panel, styles.menu]} aria-label={props.label}>
      <For each={props.sections}>
        {(section) => (
          <section class={styles.section} aria-label={section.title}>
            <h3 class={theme.sectionTitle}>{section.title}</h3>
            <div class={styles.rowFrame}>
              <div class={styles.row} data-wrap={section.wrap ? '' : undefined}>
                <For each={section.items}>
                  {(item) => {
                    const hold = longPress((point, event) => props.onDragStart?.(item, point, event));

                    return (
                      <button
                        class={[theme.labeledIcon, styles.item]}
                        aria-pressed={props.active(item.id) ? 'true' : 'false'}
                        disabled={!props.available(item.id)}
                        title={props.available(item.id) ? item.label : `${item.label} · not in Paint`}
                        onClick={() => {
                          if (!hold.consumeClick()) {
                            props.onRun(item.id);
                          }
                        }}
                        {...(props.onDragStart ? hold.handlers : {})}
                      >
                        <InfiniteIcon name={item.icon} size={22} />
                        <span>{item.label}</span>
                      </button>
                    );
                  }}
                </For>
              </div>
              <Show when={!section.wrap && section.items.length > 4}>
                <span class={styles.chevron} aria-hidden="true">
                  <InfiniteIcon name="chevronRight" size={14} />
                </span>
              </Show>
            </div>
          </section>
        )}
      </For>
    </nav>
  );
}
