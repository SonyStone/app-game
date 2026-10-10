import type { JSX } from '@solidjs/web';
import { For } from 'solid-js';
import { SketchIcon } from '../../shared/ui/SketchIcon';
import type { Side } from './geometry';
import styles from './Sheet.module.css';

/**
 * The sheet that slides in from the free hand's edge, over its zone, with large touch rows: tabs for the layers, the
 * brushes and the drawing's file commands and settings, and a close button. `children` is the open tab's content.
 */
export function Sheet(props: {
  side: Side;
  tab: SheetTab;
  onTab: (tab: SheetTab) => void;
  onClose: () => void;
  children: JSX.Element;
}) {
  return (
    <aside class={styles.sheet} data-side={props.side} data-hands-ui aria-label={sheetTabs[props.tab]}>
      <header class={styles.header}>
        <div class={styles.tabs} role="tablist">
          <For each={Object.keys(sheetTabs) as SheetTab[]}>
            {(tab) => (
              <button
                class={styles.tab}
                role="tab"
                aria-selected={props.tab === tab ? 'true' : 'false'}
                onClick={() => props.onTab(tab)}
              >
                {sheetTabs[tab]}
              </button>
            )}
          </For>
        </div>
        <button class={styles.close} aria-label="Close" title="Close · Escape" onClick={() => props.onClose()}>
          <SketchIcon name="close" size={20} />
        </button>
      </header>
      <div class={styles.body} role="tabpanel">
        {props.children}
      </div>
    </aside>
  );
}

/** The sheet's tabs and their names. */
export const sheetTabs = { layers: 'Layers', brushes: 'Brushes', drawing: 'Drawing' } as const;

/** A tab of the sheet. */
export type SheetTab = keyof typeof sheetTabs;
