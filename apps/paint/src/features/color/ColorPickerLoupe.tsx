import { createEffect } from 'solid-js';
import styles from './ColorPickerLoupe.module.css';
import type { PickerPreview } from './createCanvasColorPicker';

/**
 * A ring around a pick being previewed, as in Procreate: the upper half shows the color under the point, the lower
 * half the current color it would replace. The hole magnifies the view around the point, pixel by pixel, with a
 * square marking the pixels the pick averages. A checkerboard stands for no paint, and the upper half is empty until
 * the first sample arrives.
 *
 * `size` is the ring's diameter in CSS pixels, 120 by default; the hole and the ring's thickness scale with it.
 * `placement` puts the ring's center on the point (`center`, the default, for a pen or mouse) or the whole ring above
 * it (`above`, for a finger, which hides what lies under and around it). Without room above the point, as near the top
 * of the view, an `above` ring moves beside the point, to its left where it fits, else to its right.
 */
export function ColorPickerLoupe(props: { preview: PickerPreview; size?: number; placement?: 'center' | 'above' }) {
  let canvas!: HTMLCanvasElement;
  const size = () => props.size ?? defaultSize;
  const hole = () => Math.round(size() * holeRatio);
  /** The marked square's side in CSS pixels of the hole. */
  const marker = () => Math.max(4, (props.preview.size * hole()) / props.preview.loupeSide);
  /** Where the ring sits relative to the point. */
  const offset = () => {
    if (props.placement !== 'above') {
      return 'translate(-50%, -50%)';
    }

    const { x, y } = props.preview.point;
    if (y >= size() + fingerGap) {
      return `translate(-50%, calc(-100% - ${fingerGap}px))`;
    }

    return x >= size() + fingerGap
      ? `translate(calc(-100% - ${fingerGap}px), -50%)`
      : `translate(${fingerGap}px, -50%)`;
  };

  createEffect(
    () => [props.preview.loupe, hole()] as const,
    ([loupe]) => {
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
      style={{
        left: `${props.preview.point.x}px`,
        top: `${props.preview.point.y}px`,
        transform: offset(),
        '--loupe-size': `${size()}px`,
        '--loupe-hole': `${hole()}px`
      }}
    >
      <canvas
        ref={canvas}
        class={styles.magnifier}
        data-ready={props.preview.loupe ? 'true' : 'false'}
        width={Math.round(hole() * devicePixelRatio)}
        height={Math.round(hole() * devicePixelRatio)}
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

/** The ring's diameter in CSS pixels unless `size` says otherwise. */
const defaultSize = 120;
/** The hole's share of the ring's diameter: 76 px of 120. */
const holeRatio = 76 / 120;
/** CSS pixels between the point and an `above` ring, so that a fingertip on the point leaves the ring in sight. */
const fingerGap = 40;

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
