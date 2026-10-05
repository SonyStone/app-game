import { defaultBrush } from '@app-game/paint-core/brush';
import { worldToScreen } from '@app-game/paint-core/camera';
import { createEffect, createSignal, Show } from 'solid-js';
import type { PaintError } from '../../shared/errors';
import { createPaintCamera, createViewSize } from '../camera';
import { PaintCanvas, type CanvasInput } from '../canvas/PaintCanvas';
import { createPaintEngine } from '../engine/createPaintEngine';
import { createLiveWatch, followCamera } from './createLiveWatch';
import styles from './Live.module.css';

/**
 * Watches an author draw live in room `room`: a canvas of its own engine, whose drawing is kept in memory, showing the
 * author's drawing as the author's view shows it, with the author's pen, and a badge with the session's state. The
 * viewer cannot draw.
 */
export function LiveViewer(props: { room: string; url: string }) {
  const [error, setError] = createSignal<PaintError>();
  const engine = createPaintEngine({
    settings: { debug: () => false, liveTail: () => true, adaptiveQuality: () => true },
    onError: setError,
    onSelection: () => {},
    // Every viewer tab keeps its own copy, in memory.
    storageName: `live:${props.room}:${crypto.randomUUID().slice(0, 8)}`
  });
  const [stage, setStage] = createSignal<HTMLElement>();
  const [canvas, setCanvas] = createSignal<HTMLCanvasElement>();
  const size = createViewSize(stage);
  const camera = createPaintCamera({
    restored: () => undefined,
    size,
    ready: engine.canEdit,
    send: engine.send,
    bounds: () => canvas()?.getBoundingClientRect()
  });
  const watch = createLiveWatch({
    url: props.url,
    room: props.room,
    ready: engine.canEdit,
    apply: (state) => engine.send({ type: 'live-apply', state })
  });
  createEffect(
    () => watch.view() && { author: watch.view()!, size: size() },
    (follow) => {
      if (follow) {
        camera.navigate(followCamera(follow.author, follow.size));
      }
    }
  );
  // The viewer only looks; input neither draws nor moves the view, which follows the author.
  const input: CanvasInput = {
    camera: camera.current,
    size,
    brush: defaultBrush,
    ready: () => false,
    navigate: () => {},
    send: () => {},
    cursor: () => {}
  };
  const state = () => {
    if (watch.error()) {
      return watch.error()!;
    }

    if (watch.status() !== 'open') {
      return 'Connecting…';
    }

    return watch.author() ? 'Live' : 'The author is away';
  };

  return (
    <div class={styles.viewer}>
      <main ref={setStage} class={styles.stage} aria-label="Live drawing">
        <Show when={engine.session()} keyed>
          {(session) => (
            <PaintCanvas
              connect={(element) => engine.connect(element, session.mode)}
              input={input}
              crosshair={false}
              ref={setCanvas}
            />
          )}
        </Show>
        <Show when={watch.pointer()}>
          {(pointer) => {
            const at = () => worldToScreen(pointer().point, camera.camera(), size());
            const diameter = () => Math.max(6, pointer().size * camera.camera().zoom);
            return (
              <div
                class={styles.pointer}
                data-contact={pointer().contact ? 'true' : 'false'}
                style={{
                  left: `${at().x}px`,
                  top: `${at().y}px`,
                  width: `${diameter()}px`,
                  height: `${diameter()}px`
                }}
              />
            );
          }}
        </Show>
      </main>
      <div class={styles.badge} role="status">
        <span class={styles.dot} data-live={watch.status() === 'open' && watch.author() ? 'true' : 'false'} />
        <span>{state()}</span>
        <Show when={watch.viewers() > 1}>
          <span>· {watch.viewers()} watching</span>
        </Show>
        <Show when={error()}>{(failure) => <span>· {failure().message}</span>}</Show>
      </div>
    </div>
  );
}
