import { onSettled } from 'solid-js';
import type { PaintSession } from './createPaintSession';
import { supportsRawPointerUpdates } from './input';
import { SketchIcon } from './SketchIcon';

/** Compact development controls; native modal focus containment keeps drawing shortcuts inactive. */
export function DeveloperDialog(props: {
  session: Pick<
    PaintSession,
    | 'debug'
    | 'ready'
    | 'toggleDebug'
    | 'liveTail'
    | 'setLiveTail'
    | 'showPenCursor'
    | 'setShowPenCursor'
    | 'rawReceived'
    | 'metrics'
    | 'workerEnabled'
    | 'setWorkerEnabled'
    | 'switchingRenderer'
  >;
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
      class="paint-developer"
      aria-labelledby="paint-developer-title"
      onClose={props.close}
      onCancel={(event) => {
        event.preventDefault();
        props.close();
      }}
    >
      <div class="paint-panel-title">
        <strong id="paint-developer-title">Developer</strong>
        <button autofocus aria-label="Close developer tools" onClick={props.close}>
          <SketchIcon name="close" size={18} />
        </button>
      </div>
      <div class="paint-developer-controls">
        <label>
          <input
            type="checkbox"
            checked={props.session.debug()}
            disabled={!props.session.ready()}
            onChange={() => props.session.toggleDebug()}
          />
          Canvas wireframe
        </label>
        <label>
          <input
            type="checkbox"
            checked={props.session.liveTail()}
            onChange={(event) => props.session.setLiveTail(event.currentTarget.checked)}
          />
          Live stroke tail
        </label>
        <label>
          <input
            type="checkbox"
            checked={props.session.showPenCursor()}
            onChange={(event) => props.session.setShowPenCursor(event.currentTarget.checked)}
          />
          Show cursor while drawing with a pen
        </label>
        <label>
          <input
            type="checkbox"
            checked={props.session.workerEnabled()}
            disabled={!props.session.ready() || props.session.switchingRenderer()}
            onChange={(event) => {
              const enabled = event.currentTarget.checked;
              event.currentTarget.checked = props.session.workerEnabled();
              props.session.setWorkerEnabled(enabled);
            }}
          />
          Web Worker + OffscreenCanvas
        </label>
      </div>
      <p class="paint-panel-note" role="status">
        {props.session.switchingRenderer()
          ? 'Switching drawing engine…'
          : 'Switching keeps the drawing and settings. Undo history and the selection clipboard reset.'}
      </p>
      <dl>
        <div>
          <dt>Drawing engine</dt>
          <dd>{props.session.workerEnabled() ? 'Worker · OffscreenCanvas' : 'Main thread · HTML canvas'}</dd>
        </div>
        <div>
          <dt>pointerrawupdate</dt>
          <dd>
            {rawSupported
              ? props.session.rawReceived()
                ? 'Receiving pen events'
                : 'Available · waiting for pen'
              : 'Unavailable · using pointermove'}
          </dd>
        </div>
        <div>
          <dt>GPU resources</dt>
          <dd>{(props.session.metrics().gpu / 1024 / 1024).toFixed(1)} MiB</dd>
        </div>
        <div>
          <dt>Last frame submission</dt>
          <dd>{props.session.metrics().ms.toFixed(1)} ms</dd>
        </div>
      </dl>
      <p class="paint-panel-note">
        Submission measures CPU preparation, not pen latency. Execution mode stays in the URL; other switches apply to
        this session.
      </p>
    </dialog>
  );
}
