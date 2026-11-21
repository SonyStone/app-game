import { createMemo, For } from 'solid-js';
import { SettingsRow, SettingsRows } from '../../shared/ui/SettingsList';
import type { Board } from './board';
import { useGrid } from './grid';
import styles from './LegoStudio.module.css';
import { visiblePanels } from './windows';
import type { WorkspaceControls, WorkspaceId } from './workspaces';

/**
 * A workspace's board in miniature: the view's outline with every free and docked panel where it lies in a view of
 * `view` size at the grid's cell in use, and each part a tile on its plate, so the shape of the layout reads at a
 * glance. Panels a part opens are left out, as they show only while open. Docked layers stretch as `board.ts`'s
 * built-in lookup says, which keeps this file clear of the part registry. Scales to the box CSS gives it, keeping the
 * view's proportions.
 */
export function WorkspacePreview(props: { board: Board; view: { width: number; height: number } }) {
  const grid = useGrid();
  const size = () => (props.view.width > 0 && props.view.height > 0 ? props.view : fallbackView);
  const panels = createMemo(() => visiblePanels(grid.pitch(), props.board, undefined, false, size()));

  return (
    <svg
      class={styles.workspacePreview}
      viewBox={`0 0 ${size().width} ${size().height}`}
      preserveAspectRatio="xMidYMid meet"
      aria-hidden="true"
    >
      <rect class={styles.workspacePaper} width={size().width} height={size().height} />
      <For each={panels()}>
        {(entry) => (
          <g>
            <rect
              class={styles.workspacePlate}
              x={entry.frame.rect.left}
              y={entry.frame.rect.top}
              width={entry.frame.rect.width}
              height={entry.frame.rect.height}
              rx={grid.cell() / 3}
            />
            <For each={entry.panel.parts}>
              {(part) => (
                <rect
                  class={styles.workspaceTile}
                  x={entry.frame.origin.x + part.cell.column * grid.pitch()}
                  y={entry.frame.origin.y + part.cell.row * grid.pitch()}
                  width={grid.length(part.span.columns)}
                  height={grid.length(part.span.rows)}
                  rx={grid.cell() / 5}
                />
              )}
            </For>
          </g>
        )}
      </For>
    </svg>
  );
}

/** The view a preview assumes while the real one has no size yet, as before the first layout: a landscape tablet. */
const fallbackView = { width: 1646, height: 909 };

/**
 * The workspaces as a list to choose from, each row with its miniature, the active one marked: what the Workspace
 * part opens. Choosing one switches to it (`onSwitch`), then `onDone` closes the list.
 */
export function WorkspaceMenu(props: {
  workspaces: WorkspaceControls | undefined;
  onSwitch: (id: WorkspaceId) => void;
  onDone: () => void;
}) {
  return (
    <SettingsRows class={styles.workspaceMenu} role="listbox" label="Workspaces">
      <For each={props.workspaces?.list ?? []}>
        {(workspace) => (
          <SettingsRow
            id={workspace.id}
            role="option"
            label={workspace.name}
            trailing={props.workspaces?.edited(workspace.id) && workspace.id !== 'custom' ? 'Edited' : undefined}
            selected={props.workspaces?.active() === workspace.id}
            tile={<WorkspacePreview board={props.workspaces!.boardOf(workspace.id)} view={props.workspaces!.view()} />}
            onSelect={() => {
              props.onSwitch(workspace.id);
              props.onDone();
            }}
          />
        )}
      </For>
    </SettingsRows>
  );
}
