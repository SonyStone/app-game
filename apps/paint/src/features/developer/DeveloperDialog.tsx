import { supportsRawPointerUpdates } from '@app-game/paint-core/input';
import { onSettled } from 'solid-js';
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
  /** Requests the other execution mode; the checkbox shows `workerEnabled` until the switch completes. */
  onWorkerEnabledChange: (enabled: boolean) => void;
  close: () => void;
}) {
  let dialog!: HTMLDialogElement;
  const rawSupported = supportsRawPointerUpdates();
  onSettled(() => {
    dialog.showModal();
    return () => dialog.close();
  });

  return (
    <dialog
      ref={dialog}
      class={styles.developer}
      aria-labelledby="paint-developer-title"
      onClose={props.close}
      onCancel={(event) => {
        event.preventDefault();
        props.close();
      }}
    >
      <div class={styles.panelTitle}>
        <strong id="paint-developer-title">Developer</strong>
        <button autofocus aria-label="Close developer tools" onClick={props.close}>
          <SketchIcon name="close" size={18} />
        </button>
      </div>
      <div class={styles.developerControls}>
        <label>
          <input
            type="checkbox"
            checked={props.settings.debug()}
            disabled={!props.ready}
            onChange={(event) => props.settings.setDebug(event.currentTarget.checked)}
          />
          Canvas wireframe
        </label>
        <label>
          <input
            type="checkbox"
            checked={props.settings.liveTail()}
            onChange={(event) => props.settings.setLiveTail(event.currentTarget.checked)}
          />
          Live stroke tail
        </label>
        <label>
          <input
            type="checkbox"
            checked={props.settings.showPenCursor()}
            onChange={(event) => props.settings.setShowPenCursor(event.currentTarget.checked)}
          />
          Show cursor while drawing with a pen
        </label>
        <label>
          <input
            type="checkbox"
            checked={props.workerEnabled}
            disabled={!props.ready || props.switching}
            onChange={(event) => {
              const enabled = event.currentTarget.checked;
              event.currentTarget.checked = props.workerEnabled;
              props.onWorkerEnabledChange(enabled);
            }}
          />
          Web Worker + OffscreenCanvas
        </label>
        <label>
          <input
            type="checkbox"
            checked={props.settings.adaptiveQuality()}
            onChange={(event) => props.settings.setAdaptiveQuality(event.currentTarget.checked)}
          />
          Adaptive brush quality
        </label>
      </div>
      <p class={styles.panelNote}>
        On by default for all brushes. Uses the canvas LOD to reduce work. New strokes may keep reduced detail; no
        detailed replay.
      </p>
      <p class={styles.panelNote} role="status">
        {props.switching
          ? 'Switching drawing engine…'
          : 'Switching keeps the drawing and settings. Undo history and the selection clipboard reset.'}
      </p>
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
      <p class={styles.panelNote}>
        Submission measures CPU preparation, not pen latency. Execution mode stays in the URL; other switches apply to
        this session.
      </p>
    </dialog>
  );
}
