import { editable } from '@app-game/paint-core/input';
import { createEffect, createSignal, createUniqueId, Match, Switch } from 'solid-js';
import { SettingsBack, SettingsList, SettingsSplit, type SettingsListItem } from '../../shared/ui/SettingsList';
import { partsBounds, type Part, type Span } from './board';
import { useGrid } from './grid';
import legoStyles from './LegoStudio.module.css';
import styles from './OptionsSheet.module.css';
import { PartFrame } from './PartFrame';
import { gridSizeKind } from './parts/options';
import { BlockView } from './PartsTray';

/**
 * LEGO's options, the editor's own settings, as a modal sheet over the whole page in the brush studio's Sidebar
 * style: its sections in a list on one plate beside the chosen section's controls (`SettingsSplit`), the chosen one
 * on the accent pill; where the plate is narrow, the list and a section are two screens with a way back. Mounting it
 * opens it; Done, Escape and the browser's cancel call `onClose`, and the host's back gesture closes it as the host
 * decides. Every change applies at once, so there is nothing to cancel. While it is open the page behind is inert and
 * no key or pointer event in it reaches the page's listeners.
 *
 * Its one section for now, Interface, holds the grid size: its value part (`gridSizePart`), and under it a sample of
 * real parts drawn at the cell in use (`GridSample`), since the sheet covers the board. A new section is an entry in
 * `sections` and a `Match` with its controls.
 */
export function OptionsSheet(props: {
  onClose: () => void;
  /** Added to the dialog's class. */
  class?: string;
}) {
  const [section, setSection] = createSignal<SectionId>('interface');
  /** The screen shown where the list and a section are two screens. */
  const [view, setView] = createSignal<'list' | 'detail'>('list');
  const [dialog, setDialog] = createSignal<HTMLDialogElement>();
  const titleId = createUniqueId();
  const current = () => sections.find((entry) => entry.id === section())!;
  createEffect(dialog, (element) => {
    if (element && !element.open) {
      // Focusable, so a press on a bare part of the sheet keeps the focus, and with it the keys, in the dialog.
      element.tabIndex = -1;
      showModal(element);
    }
  });

  return (
    <dialog
      ref={setDialog}
      class={[styles.dialog, props.class]}
      aria-label="Options"
      onCancel={(event) => {
        event.preventDefault();
        props.onClose();
      }}
      onKeyDown={(event) => {
        // Escape that cancels a typed number stays in its field.
        if (event.key === 'Escape' && editable(event.target)) {
          event.preventDefault();
        }

        event.stopPropagation();
      }}
      onKeyUp={(event) => event.stopPropagation()}
      onPointerDown={(event) => event.stopPropagation()}
      onPointerMove={(event) => event.stopPropagation()}
      onPointerUp={(event) => event.stopPropagation()}
      onPointerCancel={(event) => event.stopPropagation()}
    >
      <div class={styles.frame}>
        <div class={styles.actions}>
          <button type="button" class={styles.done} onClick={() => props.onClose()}>
            Done
          </button>
        </div>
        <SettingsSplit
          class={styles.sheet}
          view={view()}
          list={
            <div class={styles.side}>
              <h1 class={styles.name}>Options</h1>
              <SettingsList
                class={styles.list}
                label="Option sections"
                items={sections}
                selected={section()}
                onSelect={(id) => {
                  setSection(id as SectionId);
                  setView('detail');
                }}
              />
            </div>
          }
        >
          <section class={styles.pane} aria-labelledby={titleId} data-section={section()}>
            <SettingsBack label="Options" title={current().label} onBack={() => setView('list')} />
            <h2 id={titleId} class={styles.title}>
              {current().label}
            </h2>
            <Switch>
              <Match when={section() === 'interface'}>
                <div class={[legoStyles.studioTile, styles.setting]}>
                  <PartFrame kind={gridSizeKind} span={settingSpan} look="slider" />
                </div>
                <GridSample />
              </Match>
            </Switch>
          </section>
        </SettingsSplit>
      </div>
    </dialog>
  );
}

/** The sheet's sections in order. */
const sections = [
  { id: 'interface', label: 'Interface', icon: 'tools' }
] as const satisfies readonly (SettingsListItem & { id: string })[];

type SectionId = (typeof sections)[number]['id'];

/**
 * The span a setting's part shows at in its row, where it fills the row whatever its span: a slider one cell high,
 * as the brush studio's rows.
 */
const settingSpan: Span = { columns: 6, rows: 1 };

/**
 * A small plate of real parts lying on paper as on the board, drawn at the cell in use, so the grid size shows what it
 * does while the sheet covers the board: a slider fused with a knob, then undo and redo, and the eraser fused with
 * the lasso and the fill. The parts are previews: they show the session's values and take no presses.
 */
function GridSample() {
  const grid = useGrid();
  const bounds = partsBounds(sampleParts);

  return (
    <div class={styles.sampleGround} data-grid-sample>
      <div class={styles.samplePlate}>
        <div
          class={styles.sampleParts}
          style={{ width: `${grid.length(bounds.columns)}px`, height: `${grid.length(bounds.rows)}px` }}
        >
          <BlockView parts={sampleParts} immediate />
        </div>
      </div>
    </div>
  );
}

/** The sample's parts; the knob keeps its look at every cell, as a part whose look was chosen does. */
const sampleParts: readonly Part[] = [
  { id: 'size', kind: 'value:size', cell: { column: 0, row: 0 }, span: { columns: 4, rows: 1 } },
  {
    id: 'opacity',
    kind: 'value:opacity',
    cell: { column: 4, row: 0 },
    span: { columns: 1, rows: 1 },
    looks: { '1x1': 'knob' }
  },
  { id: 'undo', kind: 'action:undo', cell: { column: 0, row: 1 }, span: { columns: 1, rows: 1 } },
  { id: 'redo', kind: 'action:redo', cell: { column: 1, row: 1 }, span: { columns: 1, rows: 1 } },
  { id: 'eraser', kind: 'action:eraser', cell: { column: 2, row: 1 }, span: { columns: 1, rows: 1 } },
  { id: 'lasso', kind: 'action:lasso', cell: { column: 3, row: 1 }, span: { columns: 1, rows: 1 } },
  { id: 'fill', kind: 'action:fill', cell: { column: 4, row: 1 }, span: { columns: 1, rows: 1 } }
];

/** Opens `element` as a modal dialog, or merely open where the environment has no modal dialogs, as jsdom. */
function showModal(element: HTMLDialogElement) {
  if (typeof element.showModal === 'function') {
    element.showModal();
  } else {
    element.setAttribute('open', '');
  }
}
