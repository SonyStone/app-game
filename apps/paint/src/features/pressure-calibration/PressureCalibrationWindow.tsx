import type { BrushResource } from '@app-game/abr-paint/resources';
import type { Brush } from '@app-game/paint-core/brush';
import { createPressureCalibration, PressureCalibration } from '@app-game/pressure-calibration';
import type { Result } from 'neverthrow';
import { createEffect, createMemo, createSignal, Show, untrack } from 'solid-js';
import type { PaintError } from '../../shared/errors';
import { FloatingWindow } from '../../shared/ui/FloatingWindow';
import { studioBrushRecipe } from '../engine/studioBrushes';
import styles from './PressureCalibrationWindow.module.css';

/**
 * Paint's pen pressure calibration (`PressureCalibration`) as a floating window over any variant. It does not block
 * the editor: brush settings, presets and tools stay usable, and its test canvas follows the current brush as
 * calibrated strokes reach it (`strokeBrush`), drawn by Studio's own recipe. A preset's images are read before the
 * canvas switches to it, so the canvas keeps the previous brush meanwhile; if they cannot be read, it says so and
 * keeps the brush it has. Saving, resetting or cancelling closes it.
 */
export function PressureCalibrationWindow(props: {
  position: { x: number; y: number };
  onMove: (position: { x: number; y: number }, done: boolean) => void;
  onClose: () => void;
  calibration: ReturnType<typeof createPressureCalibration>;
  /** The brush the next stroke would use. */
  brush: Brush;
  /** Id of the preset the brush comes from, whose images the brush may need. */
  preset: string | undefined;
  /** Reads the images of preset `id`, such as an ABR tip; none for no preset. */
  resources: (id: string | undefined) => Promise<Result<BrushResource[], PaintError>>;
}) {
  const [images, setImages] = createSignal<{ preset: string | undefined; resources: BrushResource[] }>();
  const [failure, setFailure] = createSignal<string>();
  createEffect(
    () => props.preset,
    (preset) => {
      let current = true;
      void untrack(() => props.resources(preset)).then((result) => {
        if (!current) {
          return;
        }

        result.match(
          (resources) => {
            setFailure(undefined);
            setImages({ preset, resources });
          },
          (error) => setFailure(error.message)
        );
      });
      return () => {
        current = false;
      };
    }
  );
  /** The brush with the images it needs; the last such pair while a newly chosen preset's images are read. */
  const preview = createMemo<Parameters<typeof PressureCalibration>[0]['preview'] | undefined>((previous) => {
    const loaded = images();
    if (!loaded || loaded.preset !== props.preset) {
      return previous;
    }

    return {
      brush: props.calibration.strokeBrush(props.brush, true),
      resources: loaded.resources,
      recipe: studioBrushRecipe,
      mixing: props.brush.mixing
    };
  });

  return (
    <FloatingWindow
      title="Pen pressure"
      width={Math.min(560, innerWidth - 16)}
      position={props.position}
      onMove={props.onMove}
      onClose={props.onClose}
      class={styles.window}
    >
      <Show when={preview()} fallback={<p class={styles.loading}>{failure() ?? 'Reading the brush…'}</p>}>
        {(current) => (
          <PressureCalibration
            saved={props.calibration.calibration()?.curve}
            onSave={(curve) => {
              props.calibration.save(curve);
              props.onClose();
            }}
            onReset={() => {
              props.calibration.reset();
              props.onClose();
            }}
            onCancel={() => props.onClose()}
            preview={current()}
            note={
              failure()
                ? `The chosen brush could not be read (${failure()}); the canvas keeps the previous one.`
                : 'The canvas draws with the current brush and follows its settings. A brush pen pressure range left at its default 5% to 80% spans 0% to 100% once the pen is calibrated.'
            }
          />
        )}
      </Show>
    </FloatingWindow>
  );
}
