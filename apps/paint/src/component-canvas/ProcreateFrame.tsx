import type { JSX } from '@solidjs/web';
import popover from '../variants/procreate/Popover.module.css';
import procreate from '../variants/procreate/ProcreateStudio.module.css';
import styles from './ComponentCanvas.module.css';

/**
 * A Procreate variant's popover card standing free, over the variant's dark grey and with its tokens, for the
 * variant's popover contents: the variant places its `Popover` under a toolbar button, which the canvas does not
 * have. `width` is the variant's width for that popover.
 */
export function ProcreateFrame(props: { width: number; label: string; children: JSX.Element }) {
  return (
    <div class={[procreate.editor, styles.procreateGround]}>
      {/* Inline, as the variant's stylesheet may load after the canvas's and keep the card absolutely placed. */}
      <section
        class={popover.popover}
        style={{ position: 'relative', animation: 'none', width: `${props.width}px` }}
        role="dialog"
        aria-label={props.label}
      >
        <div class={popover.body}>{props.children}</div>
      </section>
    </div>
  );
}
