import { createSignal, For, Show } from 'solid-js';
import { InfiniteIcon } from './icons';
import styles from './OptionsMenu.module.css';
import theme from './theme.module.css';
import { optionsItems } from './toolCatalog';

/**
 * Infinite Painter's Options menu (manual p. 407): New, Open, Save, Import, Record, Export, Community, Classroom and
 * Settings, three by three. Export turns the card into the export panel (p. 439), whose formats are Paint's: a PNG of
 * the view, a layered Photoshop file and Paint's own drawing file. Entries Paint lacks are disabled.
 */
export function OptionsMenu(props: {
  available: (id: string) => boolean;
  onRun: (id: string) => void;
  onExport: (format: ExportFormat) => void;
}) {
  const [exporting, setExporting] = createSignal(false);

  return (
    <div class={[theme.panel, styles.menu]} role="dialog" aria-label="Options">
      <Show
        when={exporting()}
        fallback={
          <>
            <h3 class={theme.sectionTitle}>Options</h3>
            <div class={styles.grid}>
              <For each={optionsItems}>
                {(item) => (
                  <button
                    class={theme.labeledIcon}
                    disabled={!props.available(item.id)}
                    title={props.available(item.id) ? item.label : `${item.label} · not in Paint`}
                    onClick={() => (item.id === 'export' ? setExporting(true) : props.onRun(item.id))}
                  >
                    <InfiniteIcon name={item.icon} size={22} />
                    <span>{item.label}</span>
                  </button>
                )}
              </For>
            </div>
          </>
        }
      >
        <header class={styles.header}>
          <button class={theme.iconButton} aria-label="Back to Options" onClick={() => setExporting(false)}>
            <InfiniteIcon name="chevronLeft" size={18} />
          </button>
          <h3 class={theme.sectionTitle}>Export</h3>
        </header>
        <For each={exportFormats}>
          {(format) => (
            <button class={styles.format} onClick={() => props.onExport(format.id)}>
              <b>{format.label}</b>
              <span>{format.note}</span>
            </button>
          )}
        </For>
      </Show>
    </div>
  );
}

/** What Export can write. */
export type ExportFormat = (typeof exportFormats)[number]['id'];

const exportFormats = [
  { id: 'png', label: 'PNG', note: 'The view as an image' },
  { id: 'psd', label: 'PSD', note: 'Layers, for Photoshop' },
  { id: 'download', label: 'Paint drawing', note: 'The whole project, to open again' }
] as const;
