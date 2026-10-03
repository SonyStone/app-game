import type { JSX } from '@solidjs/web';
import { SketchIcon } from '../../shared/ui/SketchIcon';
import styles from './PaintStudio.module.css';

/** Floating side panel opened from the toolbar; a backdrop button closes it when tapping outside. */
export function StudioPanel(props: {
  /** Identifies the panel for styling. */
  id: PanelId;
  title: string;
  onClose: () => void;
  children: JSX.Element;
}) {
  return (
    <>
      <button class={styles.panelDismiss} aria-label="Close panel" onClick={() => props.onClose()} />
      <aside id="paint-panel" class={styles.panel} data-panel={props.id} aria-label={props.title}>
        <div class={styles.panelTitle}>
          <strong>{props.title}</strong>
          <button aria-label="Close controls" onClick={() => props.onClose()}>
            <SketchIcon name="close" size={18} />
          </button>
        </div>
        {props.children}
      </aside>
    </>
  );
}

/** Side panels, by id, with their titles. */
export const panelTitles = {
  symmetry: 'Paint symmetry',
  file: 'Drawing',
  brush: 'Brush',
  color: 'Color',
  layers: 'Layers'
} as const;

/** A side panel opened from the toolbar or the brush, color and drawing launchers. */
export type PanelId = keyof typeof panelTitles;
