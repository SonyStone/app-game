import type { BrushResource } from '@app-game/abr-paint/resources';
import { editable } from '@app-game/paint-core/input';
import { identityPressureCurve, samePressureCurve } from '@app-game/paint-core/pressureCurve';
import { PressureCalibration } from '@app-game/pressure-calibration';
import type { JSX } from '@solidjs/web';
import { createEffect, createMemo, createSignal, Show, untrack } from 'solid-js';
import { BrushStudio, snapshotBrushSettings } from '../brush-editor';
import { BrushStrokePreview } from '../brush-editor/BrushStrokePreview';
import { DrawingPad } from '../brush-editor/DrawingPad';
import { studioBrushRecipe } from '../engine/studioBrushes';
import { PenPressurePane, penPressureStatus } from '../pressure-calibration';
import type { PaintSession } from '../session';
import styles from './BrushStudioDialog.module.css';
import type { createBrushSettingsEditor } from './createBrushSettingsEditor';

/** The brush settings editor a studio edits through; see `createBrushSettingsEditor`. */
type BrushSettingsEditor = ReturnType<typeof createBrushSettingsEditor>;

/**
 * The brush studio (`BrushStudio`) for the session's current brush, as a modal dialog over the whole page: mounting
 * it opens it. The rows show `editor`'s edited brush (with an ABR preset's categories) and send their patches through
 * its `update`; an error of the editor or of loading the preset's images shows in a line over the studio. Under the
 * title, the session brush's stroke preview; beside the rows, a `DrawingPad` with the brush a stroke on the drawing
 * gets, its images and the session's pen pressure mapping.
 *
 * The sidebar's Pen group holds the pen's pressure curve, the session's `pressureCalibration`: edits apply to it at
 * once, so strokes on the pad and on the drawing follow them. Its page is the host's `penPane`, or `PenPressurePane`;
 * the pen's raw pressure on the pad shows on the graph and fills its histogram for as long as the dialog is open
 * (`session.penPressure`). While `measuring`, the page runs the three calibration steps (`PressureCalibration`)
 * instead, and the fitted curve becomes the pen's.
 *
 * Cancel returns to the brush as it was when the dialog mounted or, after that, when another preset was chosen, and
 * the pen's curve to what it was when the dialog mounted, and then calls `onClose`, as Done does, which keeps both. Escape closes it too, keeping the changes, unless a control inside used the key,
 * as a menu or a typed number does. While it is open the page behind it is inert, and no key or pointer event in it
 * reaches the page's listeners on the document or the window, so the drawing's shortcuts and gestures stay idle.
 *
 * While `away`, as while the host carries something out of the studio onto the page, the studio slides down and fades
 * out, taking no presses, and comes back as it was once `away` ends; it stays open throughout, keeping its state.
 */
export function BrushStudioDialog(props: {
  session: PaintSession;
  editor: BrushSettingsEditor;
  /** The host's rows for number settings; see `BrushStudio`. */
  hostRow?: Parameters<typeof BrushStudio>[0]['hostRow'];
  /** The host's page for the pen's pressure curve, in place of `PenPressurePane`. */
  penPane?: JSX.Element;
  /**
   * Whether the pen's page runs the calibration steps; the dialog keeps this itself without it. A host whose own page
   * starts measuring passes it with `onMeasuring`.
   */
  measuring?: boolean;
  /** Receives whether to measure: true from the page's Measure, false when the steps end or are cancelled. */
  onMeasuring?: (measuring: boolean) => void;
  /** Whether the studio is out of the way, showing the page under it; false by default. */
  away?: boolean;
  /** Called by Done, by Cancel once it has restored the baseline, and by Escape; the caller then unmounts the dialog. */
  onClose: () => void;
  /** Added to the dialog's class, so a host can map its theme to the editor's colors (`--surface`, `--ink`, ...). */
  class?: string;
  /** Receives the dialog element, as for a host that listens to presses on it. */
  ref?: (element: HTMLDialogElement) => void;
}) {
  const { session, editor } = props;
  const { brush, library, tools, pressureCalibration, penPressure } = session;
  /** The pen's curve when the dialog opened, which Cancel restores. */
  const penBaseline = untrack(() => pressureCalibration.calibration()?.curve);
  const [ownMeasuring, setOwnMeasuring] = createSignal(false);
  const measuring = () => props.measuring ?? ownMeasuring();
  const setMeasuring = (on: boolean) => (props.onMeasuring ?? setOwnMeasuring)(on);
  const [padSurface, setPadSurface] = createSignal<HTMLElement>();
  penPressure.watch(padSurface);
  const preset = createMemo(() => tools.preset());
  // Taken when the dialog opens and again whenever another preset is chosen; edits of the brush keep it.
  const baseline = createMemo(() => {
    preset();
    return snapshotBrushSettings(untrack(brush), true);
  });
  const { images, error: imagesError } = createPresetImages(session, preset);
  const padResources = createMemo(() => [...images(), ...editor.resources()]);
  const error = () => editor.editError() || imagesError();
  const [dialog, setDialog] = createSignal<HTMLDialogElement>();
  createEffect(dialog, (element) => {
    if (element && !element.open) {
      // Focusable, so a press on a bare part of the studio keeps the focus, and with it the keys, in the dialog.
      element.tabIndex = -1;
      showModal(element);
    }
  });

  return (
    <dialog
      ref={(element) => {
        setDialog(element);
        props.ref?.(element);
      }}
      class={[styles.dialog, props.class]}
      data-away={props.away ? '' : undefined}
      aria-label="Brush studio"
      onCancel={(event) => {
        event.preventDefault();
        props.onClose();
      }}
      onKeyDown={(event) => {
        // Escape that cancels a typed number stays in its field.
        if (event.key === 'Escape' && editable(event.target)) {
          event.preventDefault();
        }

        event.stopPropagation();
      }}
      onKeyUp={(event) => event.stopPropagation()}
      onPointerDown={(event) => event.stopPropagation()}
      onPointerMove={(event) => event.stopPropagation()}
      onPointerUp={(event) => event.stopPropagation()}
      onPointerCancel={(event) => event.stopPropagation()}
    >
      <Show when={error()}>
        {(message) => (
          <p class={styles.error} role="alert">
            {message()}
          </p>
        )}
      </Show>
      <BrushStudio
        brush={editor.edited()}
        categories={brush().engine?.id === 'abr' ? editor.categories() : undefined}
        baseline={baseline()}
        name={library.find(preset())?.name}
        hostRow={props.hostRow}
        onChange={(patch) => void editor.update(patch)}
        onDone={() => props.onClose()}
        onCancel={restorePen}
        penStatus={penPressureStatus(pressureCalibration.calibration()?.curve)}
        penPane={
          <Show
            when={measuring()}
            fallback={
              props.penPane ?? (
                <PenPressurePane
                  curve={pressureCalibration.curve()}
                  measured={penPressure.measured()}
                  marker={penPressure.marker()}
                  calibrated={!!pressureCalibration.calibration()}
                  onChange={pressureCalibration.save}
                  onMeasure={() => setMeasuring(true)}
                  onReset={pressureCalibration.reset}
                />
              )
            }
          >
            <div class={styles.measure}>
              <PressureCalibration
                saved={undefined}
                onSave={pressureCalibration.save}
                onReset={pressureCalibration.reset}
                onCancel={() => setMeasuring(false)}
                onMeasured={(curve, measured) => {
                  pressureCalibration.save(curve);
                  penPressure.add(measured);
                  setMeasuring(false);
                }}
                preview={{
                  brush: pressureCalibration.strokeBrush(brush(), true),
                  resources: padResources(),
                  recipe: studioBrushRecipe,
                  mixing: brush().mixing
                }}
              />
            </div>
          </Show>
        }
        pad={
          <div ref={setPadSurface} class={styles.padSurface}>
            <DrawingPad
              brush={pressureCalibration.strokeBrush(brush())}
              resources={padResources()}
              mapPressure={pressureCalibration.mapPressure}
            />
          </div>
        }
      />
    </dialog>
  );

  /** Puts the pen's curve back as it was when the dialog opened: that curve, or none. */
  function restorePen() {
    const current = pressureCalibration.calibration()?.curve;
    if (!penBaseline) {
      if (current) {
        pressureCalibration.reset();
      }

      return;
    }

    if (!samePressureCurve(penBaseline, current ?? identityPressureCurve)) {
      pressureCalibration.save(penBaseline);
    }
  }
}

/**
 * The stroke preview of a brush editor for the session's current brush, `height` CSS pixels high, on white paper as
 * a new drawing's: Paint's stroke with the chosen preset's saved images and the images of `editor`'s latest ABR edit.
 */
export function SessionStrokePreview(props: { session: PaintSession; editor: BrushSettingsEditor; height: number }) {
  const { session, editor } = props;

  return (
    <BrushStrokePreview
      brush={session.brush()}
      background={previewPaper}
      height={props.height}
      resources={async () => {
        const preset = session.library.find(session.tools.preset());
        if (!preset) {
          return [];
        }

        const result = await session.library.resources(preset);
        if (result.isErr()) {
          throw result.error;
        }

        return [...result.value, ...untrack(editor.resources)];
      }}
    />
  );
}

/** The preview's paper: white, as a new drawing's, whatever the UI's colors. */
const previewPaper = '#ffffff';

/**
 * The saved images of the chosen preset (`preset`), loaded under the caller's owner and again whenever another preset
 * is chosen; empty until they arrive. A late answer for a preset no longer chosen is dropped. `error` tells why the
 * latest load failed, or is empty.
 */
function createPresetImages(session: PaintSession, preset: () => string) {
  const [loaded, setLoaded] = createSignal<{ preset: string; resources: readonly BrushResource[] }>();
  const [error, setError] = createSignal('');
  createEffect(preset, (id) => {
    const chosen = session.library.find(id);
    if (!chosen) {
      return;
    }

    let current = true;
    void session.library.resources(chosen).then((result) => {
      if (!current) {
        return;
      }

      result.match(
        (resources) => {
          setError('');
          setLoaded({ preset: chosen.id, resources });
        },
        (failure) => setError(failure.message)
      );
    });
    return () => {
      current = false;
    };
  });

  return {
    images: (): readonly BrushResource[] => {
      const images = loaded();
      return images?.preset === preset() ? images.resources : [];
    },
    error
  };
}

/** Opens `element` as a modal dialog, or merely open where the environment has no modal dialogs, as jsdom. */
function showModal(element: HTMLDialogElement) {
  if (typeof element.showModal === 'function') {
    element.showModal();
  } else {
    element.setAttribute('open', '');
  }
}
