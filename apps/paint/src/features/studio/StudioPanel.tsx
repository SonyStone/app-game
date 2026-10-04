import type { JSX } from '@solidjs/web';
import { SketchIcon } from '../../shared/ui/SketchIcon';
import styles from './PaintStudio.module.css';

/**
 * Floating side panel opened from the toolbar. It leaves the canvas usable: the studio closes it when a contact starts
 * on the canvas, unless the lock in its title pins it open.
 */
export function StudioPanel(props: {
  /** Identifies the panel for styling. */
  id: PanelId;
  title: string;
  /** Whether the panel stays open while the canvas is used. */
  pinned: boolean;
  onPinnedChange: (pinned: boolean) => void;
  onClose: () => void;
  children: JSX.Element;
}) {
  return (
    <aside id="paint-panel" class={styles.panel} data-panel={props.id} aria-label={props.title}>
      <div class={styles.panelTitle}>
        <strong>{props.title}</strong>
        <button
          aria-label="Keep panel open"
          title={
            props.pinned
              ? 'Stays open while you draw · press to close it when the canvas is used'
              : 'Keep open while you draw'
          }
          aria-pressed={props.pinned ? 'true' : 'false'}
          onClick={() => props.onPinnedChange(!props.pinned)}
        >
          <SketchIcon name={props.pinned ? 'lock' : 'unlock'} size={18} />
        </button>
        <button aria-label="Close controls" onClick={() => props.onClose()}>
          <SketchIcon name="close" size={18} />
        </button>
      </div>
      {props.children}
    </aside>
  );
}

/** Side panels, by id, with their titles. */
export const panelTitles = {
  symmetry: 'Paint symmetry',
  file: 'Drawing',
  brush: 'Brush',
  fill: 'Fill',
  gradient: 'Gradient',
  color: 'Color',
  layers: 'Layers'
} as const;

/** A side panel opened from the toolbar or the brush, color and drawing launchers. */
export type PanelId = keyof typeof panelTitles;
