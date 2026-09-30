import type { JSX } from '@solidjs/web';
import { SketchIcon } from '../../shared/ui/SketchIcon';
import styles from './PaintStudio.module.css';

/** Floating side panel opened from the toolbar; a backdrop button closes it when tapping outside. */
export function StudioPanel(props: {
  /** Identifies the panel for styling. */
  id: string;
  title: string;
  onClose: () => void;
  children: JSX.Element;
}) {
  return (
    <>
      <button class={styles.panelDismiss} aria-label="Close panel" onClick={() => props.onClose()} />
      <aside id="paint-panel" class={styles.panel} data-panel={props.id} aria-label={`${props.id} panel`}>
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
