import type { ViewSize } from '@app-game/paint-core/camera';
import { Match, Show, Switch } from 'solid-js';
import { FloatingBar, floatingBarPrimary } from '../../shared/ui/FloatingBar';
import { SketchIcon } from '../../shared/ui/SketchIcon';
import styles from './HiddenLayerNotice.module.css';

/**
 * A notice at the top of the canvas that the active layer cannot be painted on, with a button to show what hides it,
 * and one to close the notice: the layer is hidden, or `hiddenFolder` is, or the active node is a `folder`, which
 * offers no button to show.
 */
export function HiddenLayerNotice(props: {
  /** The active layer's or folder's name. */
  name: string;
  /** The active node is a folder. */
  folder?: boolean;
  /** The name of the hidden folder the layer is in. */
  hiddenFolder?: string;
  size: ViewSize;
  onShow: () => void;
  onDismiss: () => void;
}) {
  return (
    <FloatingBar
      placement={{ left: props.size.width / 2, top: noticeTop }}
      label={props.folder ? 'Folder selected' : 'Hidden layer'}
    >
      <span>
        <SketchIcon name={props.folder ? 'layers' : 'hidden'} size={18} />
      </span>
      <Switch fallback={<span role="status">“{props.name}” is hidden, so it cannot be painted on.</span>}>
        <Match when={props.folder}>
          <span role="status">“{props.name}” is a folder: select a layer in it to paint.</span>
        </Match>
        <Match when={props.hiddenFolder}>
          {(folder) => (
            <span role="status">
              “{props.name}” is in the hidden folder “{folder()}”, so it cannot be painted on.
            </span>
          )}
        </Match>
      </Switch>
      <Show when={!props.folder}>
        <button class={`${floatingBarPrimary} ${styles.text}`} onClick={() => props.onShow()}>
          {props.hiddenFolder ? 'Show folder' : 'Show layer'}
        </button>
      </Show>
      <button aria-label="Close" onClick={() => props.onDismiss()}>
        <SketchIcon name="close" size={20} />
      </button>
    </FloatingBar>
  );
}

/** Distance of the notice from the top of the canvas, below the view controls. */
const noticeTop = 66;
