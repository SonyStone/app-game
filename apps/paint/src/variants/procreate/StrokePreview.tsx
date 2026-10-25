import type { BrushResource } from '@app-game/abr-paint/resources';
import type { Brush } from '@app-game/paint-core/brush';
import { createEffect, createSignal, onSettled, Show, untrack, useContext } from 'solid-js';
import { PreviewAttachment } from '../../features/brush-library/previewAttachment';

/** Replays the shared tablet sample through Paint's real preset engine at its current size and saved color. */
export function StrokePreview(props: {
  settings: Partial<Brush>;
  height: number;
  /** Fallback stroke color when the preset does not save its own. */
  color?: string;
  /** Sample background; defaults to the shared preview's dark grey. */
  background?: string;
  /** When supplied, overrides the preset's saved color. Other callers keep saved-color precedence. */
  colorOverride?: string;
  class?: string;
  /** Loads all referenced tip, texture and dual resources, only while visible. */
  resources?: () => Promise<readonly BrushResource[]>;
}) {
  const attach = useContext(PreviewAttachment);
  const [warning, setWarning] = createSignal('');
  let canvas!: HTMLCanvasElement;
  let refresh = () => {};
  createEffect(
    () => [
      JSON.stringify(props.settings),
      props.height,
      props.color,
      props.colorOverride,
      props.background,
      props.resources
    ],
    () => refresh()
  );
  onSettled(() => {
    const connection = attach(canvas);
    const status = new MutationObserver(() => setWarning(canvas.dataset.previewReason ?? ''));
    status.observe(canvas, { attributes: true, attributeFilter: ['data-preview-reason'] });
    let visible = false;
    let revision = 0;
    // Refresh is an imperative snapshot, also called by the effect's untracked callback and browser observers.
    refresh = () =>
      untrack(() => {
        const current = ++revision;
        if (!visible) {
          return;
        }

        const brush: Partial<Brush> = JSON.parse(JSON.stringify(props.settings));
        const dpr = Math.min(2, devicePixelRatio || 1, 2048 / Math.max(1, canvas.clientWidth), 512 / props.height);
        const width = Math.max(1, Math.round(canvas.clientWidth * dpr));
        const height = Math.max(1, Math.round(props.height * dpr));
        void (props.resources?.() ?? Promise.resolve([]))
          .then((resources) => {
            if (current !== revision || !visible) {
              return;
            }
            connection.update({
              kind: 'brush',
              brush: {
                color: props.color ?? '#ffffff',
                ...brush,
                ...(props.colorOverride === undefined ? {} : { color: props.colorOverride })
              },
              resources,
              width,
              height,
              dpr,
              background: props.background ?? '#333333',
              thumbnail: true
            });
          })
          .catch((error: unknown) => {
            if (current === revision) {
              canvas.dataset.previewState = 'error';
              canvas.dataset.previewReason = String(error);
            }
          });
      });

    const resize = new ResizeObserver(refresh);
    resize.observe(canvas);
    const intersection = new IntersectionObserver(([entry]) => {
      visible = entry?.isIntersecting ?? false;
      if (visible) {
        refresh();
      } else {
        revision++;
        connection.pause();
      }
    });
    intersection.observe(canvas);
    return () => {
      revision++;
      status.disconnect();
      resize.disconnect();
      intersection.disconnect();
      connection.dispose();
    };
  });
  return (
    <div style={{ position: 'relative', width: '100%' }}>
      <canvas
        ref={canvas}
        class={props.class}
        style={{ display: 'block', width: '100%', height: `${props.height}px` }}
        aria-hidden="true"
        data-preview-state="waiting"
      />
      <Show when={warning()}>
        <span role="status" style={{ position: 'absolute', inset: '0', 'font-size': '10px' }}>
          {warning()}
        </span>
      </Show>
    </div>
  );
}
