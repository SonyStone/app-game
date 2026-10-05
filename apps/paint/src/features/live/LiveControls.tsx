import { Show } from 'solid-js';
import type { LiveBroadcast } from './createLiveBroadcast';
import styles from './Live.module.css';

/**
 * Live broadcasting in the drawing menu: Go live, which opens a room and shows the link viewers open, with Copy link;
 * while live, how many watch and Stop.
 */
export function LiveControls(props: { live: LiveBroadcast; link: (room: string) => string; ready: boolean }) {
  return (
    <div class={styles.controls}>
      <Show
        when={props.live.session()}
        fallback={
          <button disabled={!props.ready} onClick={() => props.live.start()}>
            Go live
          </button>
        }
      >
        {(session) => (
          <>
            <p role="status">
              {props.live.status() === 'open'
                ? `Live · ${props.live.viewers()} watching`
                : (props.live.error() ?? 'Connecting to the live relay…')}
            </p>
            <input
              aria-label="Watch link"
              readonly
              value={props.link(session().room)}
              onFocus={(e) => e.currentTarget.select()}
            />
            <button onClick={() => void navigator.clipboard?.writeText(props.link(session().room))}>
              Copy watch link
            </button>
            <button onClick={() => props.live.stop()}>Stop live</button>
          </>
        )}
      </Show>
    </div>
  );
}

/** A badge over the canvas while live: the session's state and how many watch. */
export function LiveBadge(props: { live: LiveBroadcast }) {
  return (
    <Show when={props.live.session()}>
      <div class={styles.badge} role="status" style={{ top: '64px' }}>
        <span class={styles.dot} data-live={props.live.status() === 'open' ? 'true' : 'false'} />
        <span>{props.live.status() === 'open' ? `Live · ${props.live.viewers()} watching` : 'Live · connecting…'}</span>
      </div>
    </Show>
  );
}
