import { createEffect } from 'solid-js';
import styles from './ColorPickerLoupe.module.css';
import type { PickerPreview } from './createCanvasColorPicker';

/**
 * A ring around a pick being previewed, as in Procreate: the upper half shows the color under the point, the lower
 * half the current color it would replace. The hole magnifies the view around the point, pixel by pixel, with a
 * square marking the pixels the pick averages. A checkerboard stands for no paint, and the upper half is empty until
 * the first sample arrives.
 */
export function ColorPickerLoupe(props: { preview: PickerPreview }) {
  let canvas!: HTMLCanvasElement;
  /** The marked square's side in CSS pixels of the hole. */
  const marker = () => Math.max(4, (props.preview.size * hole) / props.preview.loupeSide);

  createEffect(
    () => props.preview.loupe,
    (loupe) => {
      if (loupe) {
        magnify(canvas, loupe);
      }
    }
  );

  return (
    <div
      class={styles.loupe}
      role="status"
      aria-label={props.preview.color ? `Picking ${props.preview.color}` : 'Picking a color'}
      style={{ left: `${props.preview.point.x}px`, top: `${props.preview.point.y}px` }}
    >
      <canvas
        ref={canvas}
        class={styles.magnifier}
        data-ready={props.preview.loupe ? 'true' : 'false'}
        width={Math.round(hole * devicePixelRatio)}
        height={Math.round(hole * devicePixelRatio)}
        aria-hidden="true"
      />
      <div class={styles.marker} style={{ width: `${marker()}px`, height: `${marker()}px` }} />
      <div class={styles.ring}>
        <div
          class={styles.sampled}
          data-empty={props.preview.color === null ? 'true' : 'false'}
          style={{ background: props.preview.color ?? undefined }}
        />
        <div class={styles.current} style={{ background: props.preview.current }} />
      </div>
    </div>
  );
}

/** Diameter of the ring's hole in CSS pixels; keep it in step with the stylesheet. */
const hole = 76;

/** Draws the loupe's pixels over the whole canvas, each as a hard-edged square. */
function magnify(canvas: HTMLCanvasElement, loupe: NonNullable<PickerPreview['loupe']>) {
  const context = canvas.getContext('2d');
  if (!context) {
    return;
  }

  const source = new OffscreenCanvas(loupe.side, loupe.side);
  source.getContext('2d')?.putImageData(new ImageData(new Uint8ClampedArray(loupe.pixels), loupe.side), 0, 0);
  context.imageSmoothingEnabled = false;
  context.drawImage(source, 0, 0, canvas.width, canvas.height);
}
