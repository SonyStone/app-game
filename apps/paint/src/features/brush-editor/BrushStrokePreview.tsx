import type { AbrBrushSettings } from '@app-game/abr-paint/engine';
import type { Brush } from '@app-game/paint-core/brush';
import { createMemo } from 'solid-js';
import { sampleStrokeThickness } from '../brush-library/DabPresetStroke';
import { StrokePreview } from '../brush-library/StrokePreview';
import styles from './BrushEditor.module.css';

/**
 * The brush editor's stroke preview, for its `preview` slot: Paint's real stroke of `brush` along the shared sample
 * path, drawn at {@link previewBrushSize} so that it always fits its area. Under it, "Preview size: N px" while that
 * differs from the brush's size; the line keeps its place while hidden, so the editor's rows never move as the size
 * changes.
 */
export function BrushStrokePreview(props: {
  brush: Brush;
  /** CSS height of the stroke's area in pixels. */
  height: number;
  /** The area's paper color; see `StrokePreview`. */
  background?: string;
  /** Loads the resources the brush refers to; see `StrokePreview`. */
  resources?: Parameters<typeof StrokePreview>[0]['resources'];
}) {
  const size = createMemo(() => previewBrushSize(props.brush, props.height));
  const scaled = createMemo(() => size() !== Math.round(props.brush.size));

  return (
    <div>
      <StrokePreview
        settings={{ ...props.brush, size: size() }}
        height={props.height}
        background={props.background}
        resources={props.resources}
      />
      <p class={styles.previewSize} data-shown={scaled() ? '' : undefined} aria-hidden={scaled() ? undefined : 'true'}>
        Preview size: {size()} px
      </p>
    </div>
  );
}

/**
 * The size, in whole pixels, at which a preview `height` pixels high draws `brush`: its own size while the stroke
 * fits, and otherwise the brush lists' geometric sample size ({@link sampleStrokeThickness}), so that larger brushes
 * still draw larger. Either is capped so that the stroke, swinging along the sample path and spread by the brush's
 * scattering, stays inside the area.
 */
export function previewBrushSize(brush: Brush, height: number) {
  const room = (height * fitShare) / (1 + scatterSpread(brush));
  return Math.max(
    1,
    Math.min(Math.round(Math.min(brush.size, sampleStrokeThickness(brush.size, height))), Math.floor(room))
  );
}

/**
 * The share of the preview's height a stroke may take. The sample path swings 12% of the height to either side of the
 * middle, which leaves 76% for the stroke's width; a little stays clear.
 */
const fitShare = 0.7;

/** How far an ABR brush's scattering spreads its tips, as a multiple of its size; 0 for other brushes. */
function scatterSpread(brush: Brush) {
  if (brush.engine?.id !== 'abr') {
    return 0;
  }

  const values = (brush.engine.settings as Partial<AbrBrushSettings>).values;
  return values?.useScattering ? values.scattering.scatter / 100 : 0;
}
