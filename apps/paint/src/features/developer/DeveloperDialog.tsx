import { supportsRawPointerUpdates } from '@app-game/paint-core/input';
import { onSettled, Show } from 'solid-js';
import { SketchIcon } from '../../shared/ui/SketchIcon';
import type { DeveloperSettings } from './createDeveloperSettings';
import styles from './DeveloperDialog.module.css';

/**
 * Modal development controls: switches, the execution mode and engine metrics. Native modal focus containment keeps
 * drawing shortcuts inactive while it is open.
 */
export function DeveloperDialog(props: {
  settings: DeveloperSettings;
  /** The engine is ready; the wireframe and the execution mode switch wait for it. */
  ready: boolean;
  /** The engine runs in a Web Worker with an OffscreenCanvas. */
  workerEnabled: boolean;
  /** A switch between worker and main thread is in progress. */
  switching: boolean;
  /** GPU cache bytes and the last frame's CPU submission time. */
  metrics: { gpu: number; ms: number };
  /**
   * Requests the other execution mode; the checkbox shows `workerEnabled` until the switch completes. Also offered
   * while the engine is not ready, so an engine that cannot start in one mode can be restarted in the other.
   */
  onWorkerEnabledChange: (enabled: boolean) => void;
  /**
   * Closes the dialog and starts recording input for a bug report; the button is shown only when this is given,
   * which the studio does on the Vite dev server, where recordings are saved.
   */
  onRecordInput?: () => void;
  close: () => void;
}) {
  let dialog!: HTMLDialogElement;
  const rawSupported = supportsRawPointerUpdates();
  const inkSupported = 'ink' in navigator;
  onSettled(() => {
    dialog.showModal();
    return () => dialog.close();
  });

  return (
    <dialog
      ref={dialog}
      class={styles.developer}
      aria-labelledby="paint-developer-title"
      onClose={() => props.close()}
      onCancel={(event) => {
        event.preventDefault();
        props.close();
      }}
    >
      <div class={styles.panelTitle}>
        <strong id="paint-developer-title">Developer</strong>
        <button autofocus aria-label="Close developer tools" onClick={() => props.close()}>
          <SketchIcon name="close" size={18} />
        </button>
      </div>
      <fieldset class={styles.developerControls}>
        <legend>Pen latency · remembered on this device</legend>
        <Switch
          id="paint-developer-predict"
          checked={props.settings.predictStrokes()}
          onChange={props.settings.setPredictStrokes}
          label="Predict the pen ahead of the stroke"
          description="Draws the line a bit ahead, where the browser expects the pen. Try it if the line lags; it can overshoot on sharp stops."
        />
        <Switch
          id="paint-developer-ink"
          checked={props.settings.inkTrail()}
          onChange={props.settings.setInkTrail}
          label="Browser ink trail between frames"
          description={
            inkSupported
              ? 'The browser draws a plain line to the pen tip between frames. Try it if the line lags on slow devices.'
              : 'Not available in this browser. Where it is, the browser draws a plain line to the pen tip between frames.'
          }
        />
        <Switch
          id="paint-developer-warm"
          checked={props.settings.warmGpu()}
          onChange={props.settings.setWarmGpu}
          label="Warm the GPU while the pen hovers"
          description="Keeps the GPU busy while the pen hovers, so the first stroke starts faster. Off saves a little battery."
        />
      </fieldset>
      <fieldset class={styles.developerControls}>
        <legend>Engine and debugging</legend>
        <Switch
          id="paint-developer-tail"
          checked={props.settings.liveTail()}
          onChange={props.settings.setLiveTail}
          label="Live stroke tail"
          description="Shows the newest part of the stroke before smoothing settles it. Turn off only to compare; prediction needs it."
        />
        <Switch
          id="paint-developer-cursor"
          checked={props.settings.showPenCursor()}
          onChange={props.settings.setShowPenCursor}
          label="Show cursor while drawing with a pen"
          description="Keeps the brush outline visible while a pen draws; it is hidden by default so it does not cover the line."
        />
        <Switch
          id="paint-developer-quality"
          checked={props.settings.adaptiveQuality()}
          onChange={props.settings.setAdaptiveQuality}
          label="Adaptive brush quality"
          description="Zoomed out, brushes paint with less detail to stay fast. Turn off if those strokes look rough up close."
        />
        <Switch
          id="paint-developer-worker"
          checked={props.workerEnabled}
          disabled={props.switching}
          onChange={(enabled, input) => {
            input.checked = props.workerEnabled;
            props.onWorkerEnabledChange(enabled);
          }}
          label="Web Worker + OffscreenCanvas"
          description={
            props.switching
              ? 'Switching drawing engine…'
              : 'Draws in a background thread so the page stays responsive. Turn off only to debug; switching resets undo.'
          }
          status
        />
        <Switch
          id="paint-developer-wireframe"
          checked={props.settings.debug()}
          disabled={!props.ready}
          onChange={props.settings.setDebug}
          label="Canvas wireframe and palm zone"
          description="Shows tiles, cache statistics and the palm rejection area over the canvas, to debug drawing or palms."
        />
        <Switch
          id="paint-developer-monitor"
          checked={props.settings.performanceMonitor()}
          onChange={props.settings.setPerformanceMonitor}
          label="Performance monitor"
          description="Shows how long each frame takes on the CPU and GPU, to measure speed. ?performance in the address opens it."
        />
      </fieldset>
      <dl>
        <div>
          <dt>Drawing engine</dt>
          <dd>{props.workerEnabled ? 'Worker · OffscreenCanvas' : 'Main thread · HTML canvas'}</dd>
        </div>
        <div>
          <dt>pointerrawupdate</dt>
          <dd>
            {rawSupported
              ? props.settings.rawReceived()
                ? 'Receiving pen events'
                : 'Available · waiting for pen'
              : 'Unavailable · using pointermove'}
          </dd>
        </div>
        <div>
          <dt>GPU resources</dt>
          <dd>{(props.metrics.gpu / 1024 / 1024).toFixed(1)} MiB</dd>
        </div>
        <div>
          <dt>Last frame submission</dt>
          <dd>{props.metrics.ms.toFixed(1)} ms</dd>
        </div>
      </dl>
      <Show when={props.onRecordInput}>
        {(record) => (
          <div class={styles.recording}>
            <button onClick={() => record()()}>Record input…</button>
            <p class={styles.panelNote}>
              Records pen, touch, mouse and keyboard input with a snapshot of the drawing, to reproduce a bug. Saved to
              <code>apps/paint/recordings</code> on the dev server.
            </p>
          </div>
        )}
      </Show>
      <p class={styles.panelNote}>
        Submission measures CPU preparation, not pen latency. The performance monitor adds the wait for GPU work.
        Execution mode stays in the URL; the other engine and debugging switches reset on reload.
      </p>
    </dialog>
  );
}

/**
 * A developer checkbox with its name and a one-line description below, which assistive technology reads with it.
 * `onChange` receives the requested state and the input, which a caller may reset to show a pending change.
 * `status` announces description changes.
 */
function Switch(props: {
  id: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (checked: boolean, input: HTMLInputElement) => void;
  label: string;
  description: string;
  status?: boolean;
}) {
  return (
    <div class={styles.option}>
      <label>
        <input
          type="checkbox"
          checked={props.checked}
          disabled={props.disabled}
          aria-describedby={`${props.id}-note`}
          onChange={(event) => props.onChange(event.currentTarget.checked, event.currentTarget)}
        />
        {props.label}
      </label>
      <p id={`${props.id}-note`} class={styles.optionNote} role={props.status ? 'status' : undefined}>
        {props.description}
      </p>
    </div>
  );
}
