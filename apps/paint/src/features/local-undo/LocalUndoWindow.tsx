import { FloatingWindow } from '../../shared/ui/FloatingWindow';
import type { LocalUndo } from './createLocalUndo';
import styles from './LocalUndo.module.css';
import { LocalUndoPanel } from './LocalUndoPanel';

/**
 * The local undo's settings, Apply and Cancel as a floating window over any variant, for variants without a place
 * of their own for them; see `LocalUndoPanel`.
 */
export function LocalUndoWindow(props: {
  localUndo: LocalUndo;
  position: { x: number; y: number };
  onMove: (position: { x: number; y: number }, done: boolean) => void;
  onClose: () => void;
}) {
  return (
    <FloatingWindow
      title="Local undo"
      width={280}
      position={props.position}
      onMove={props.onMove}
      onClose={props.onClose}
    >
      <div class={styles.window}>
        <LocalUndoPanel
          settings={props.localUndo.settings()}
          onChange={props.localUndo.update}
          depth={props.localUndo.depth()}
          onDepth={props.localUndo.setDepth}
          open={props.localUndo.open()}
          shown={props.localUndo.shown()}
          onApply={() => void props.localUndo.apply()}
          onCancel={() => void props.localUndo.cancel()}
        />
      </div>
    </FloatingWindow>
  );
}
