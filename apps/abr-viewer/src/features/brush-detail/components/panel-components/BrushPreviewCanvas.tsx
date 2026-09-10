import type { ColorMixing } from '@app-game/abr-brush/effects';
import { supportsAirbrush } from '@app-game/abr-brush/stroke';
import { createEffect, createSignal, onSettled, Show } from 'solid-js';
import type { BrushWithPreview } from '../../../../lib/abr';
import styles from './BrushPreviewCanvas.module.css';
import { attachPreview } from '../../../brush-preview/client';
import { brushPreviewResources } from '../../../brush-preview/resources';
import type { PreviewPoint } from '../../../brush-preview/stroke';
import type { BrushFormValues } from '../../brush-form-schema';
import { previewAppearance } from '../../preview-appearance';

/** Canvas and optional pointer input; rendering runs through the shared preview service. */
export function BrushPreviewCanvas(props: BrushPreviewCanvasProps) {
  const [warning, setWarning] = createSignal('');
  let canvas!: HTMLCanvasElement;
  let container!: HTMLDivElement;
  let connection: ReturnType<typeof attachPreview> | undefined;
  let visible = false;
  let refresh = () => {};
  let path: PreviewPoint[] | undefined;
  let strokeId = 0;
  let pointer: number | undefined;
  let hold: ReturnType<typeof setInterval> | undefined;
  const stop = () => {
    pointer = undefined;
    clearInterval(hold);
  };

  createEffect(
    () => [
      JSON.stringify(props.values),
      props.brush.brushTip,
      props.brush.settings,
      props.secondaryColor,
      props.height,
      props.backgroundColor,
      props.brushColor,
      props.priority,
      props.thumbnail,
      props.colorMixing
    ],
    () => refresh()
  );
  onSettled(() => {
    connection = attachPreview(canvas);
    const status = new MutationObserver(() => setWarning(canvas.dataset.previewReason ?? ''));
    if (props.interactive) status.observe(canvas, { attributes: true, attributeFilter: ['data-preview-reason'] });
    refresh = () => {
      if (!visible) return;
      const width = container.clientWidth;
      const height = props.height ?? 100;
      if (width < 1 || height < 1) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 2, 2048 / width, 512 / height);
      // Solid stores are proxies, so send a plain snapshot rather than the live form object.
      const values: BrushFormValues = JSON.parse(JSON.stringify(props.values));
      connection!.update(
        {
          ...previewAppearance(values, props),
          colorMixing: props.thumbnail ? 'classic' : props.colorMixing,
          width: Math.max(1, Math.round(width * dpr)),
          height: Math.max(1, Math.round(height * dpr)),
          dpr,
          background: props.backgroundColor ?? '#333333',
          path,
          strokeId: path ? strokeId : undefined,
          flow: values.tool.flow / 100,
          opacity: values.tool.opacity / 100
        },
        props.brush.brushTip,
        props.priority ?? 0,
        brushPreviewResources(props.brush)
      );
    };
    const resize = new ResizeObserver(refresh);
    resize.observe(container);
    const intersection = new IntersectionObserver((entries) => {
      const next = entries[0]?.isIntersecting ?? false;
      if (visible && !next) connection!.pause();
      visible = next;
      refresh();
    });
    intersection.observe(container);
    window.addEventListener('resize', refresh);
    return () => {
      stop();
      status.disconnect();
      resize.disconnect();
      intersection.disconnect();
      window.removeEventListener('resize', refresh);
      connection?.dispose();
      connection = undefined;
      refresh = () => {};
    };
  });
  function append(event: PointerEvent) {
    const bounds = canvas.getBoundingClientRect();
    if (!path) return;
    if (path.length >= 2048) path.splice(1, 1);
    path.push({
      x: (event.clientX - bounds.left) / bounds.width,
      y: (event.clientY - bounds.top) / bounds.height,
      pressure: event.pointerType === 'pen' ? event.pressure : 1,
      tiltX: (event.tiltX / 90) * 100,
      tiltY: (event.tiltY / 90) * 100,
      rotation: event.twist,
      time: performance.now()
    });
    refresh();
  }
  return (
    <div
      ref={(element) => {
        container = element;
      }}
      class="bg-ps-bg-dark border-ps-border relative w-full overflow-hidden rounded border"
      style={{ height: `${props.height ?? 100}px`, 'background-color': props.backgroundColor ?? '#333333' }}
    >
      <canvas
        onPointerDown={(event) => {
          if (!props.interactive) return;
          stop();
          canvas.setPointerCapture(event.pointerId);
          pointer = event.pointerId;
          path = [];
          strokeId++;
          append(event);
          hold = setInterval(() => {
            if (
              pointer !== undefined &&
              props.values.useBuildUp &&
              supportsAirbrush(props.values.tool) &&
              path?.length
            ) {
              if (path.length >= 2048) path.splice(1, 1);
              path.push({ ...path.at(-1)!, time: performance.now() });
              refresh();
            }
          }, 60);
        }}
        onPointerMove={(event) => {
          if (pointer === event.pointerId) append(event);
        }}
        onPointerUp={stop}
        onPointerCancel={stop}
        onLostPointerCapture={stop}
        onDblClick={() => {
          path = undefined;
          refresh();
        }}
        title={props.interactive ? 'Draw to test. Double-click to restore the sample stroke.' : undefined}
        ref={(element) => {
          canvas = element;
        }}
        class="block"
        role="img"
        aria-label={`${props.brush.name} stroke preview`}
        style={{
          width: '100%',
          height: '100%',
          'touch-action': props.interactive ? 'none' : 'auto',
          cursor: props.interactive ? 'crosshair' : 'default'
        }}
        data-preview-state="waiting"
      />
      <Show when={props.interactive && warning()}>
        <span class={styles.previewWarning} role="status">
          {warning()}
        </span>
      </Show>
      <Show when={props.interactive && props.values.tool.type === 'MixB'}>
        <span class={styles.previewToolNote}>
          Mixes a sample image. Each stroke starts with fresh foreground paint.
        </span>
      </Show>
      <Show when={props.interactive && props.values.tool.type === 'SmTl'}>
        <span class={styles.previewToolNote}>
          Smudges a sample image. The tinted band has two layers. Each stroke starts fresh.
        </span>
      </Show>
      <Show when={props.interactive && ['ShTl', 'BlTl'].includes(props.values.tool.type)}>
        <span class={styles.previewToolNote}>
          Filters a sample image. The tinted band has two layers. Each stroke starts fresh.
        </span>
      </Show>
      <Show when={props.interactive && props.values.tool.type === 'ErTl'}>
        <span class={styles.previewToolNote}>
          {props.values.tool.eraseToHistory
            ? 'Restores the sample layer from transparency. Each stroke starts fresh.'
            : 'Erases the sample layer to transparency. Each stroke starts fresh.'}
        </span>
      </Show>
    </div>
  );
}

/** CSS dimensions and colors affect presentation; priority puts the selected brush ahead of thumbnails. */
export type BrushPreviewCanvasProps = {
  brush: BrushWithPreview;
  values: BrushFormValues;
  height?: number;
  backgroundColor?: string;
  brushColor?: string;
  /** Runtime Normal-mode blending; thumbnails stay neutral and Classic. */
  colorMixing?: ColorMixing;
  /** Neutral library swatch; does not change saved colors, mode, or the interactive preview. */
  thumbnail?: boolean;
  priority?: number;
  secondaryColor?: string;
  interactive?: boolean;
};
