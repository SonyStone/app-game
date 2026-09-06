import { createEventListener } from '@solid-primitives/event-listener';
import { createSignal, onCleanup, onSettled } from 'solid-js';
import { attempt, type Result } from './asyncResult';
import { SketchIcon } from './SketchIcon';

/** Toggles the entire editor, including its controls. Reports browser refusal without changing drawing state. */
export function FullscreenButton(props: { target: () => HTMLElement; onError: (message: string) => void }) {
  const fullscreen = createFullscreen(props.target);
  return (
    <button
      aria-label={fullscreen.active() ? 'Exit full screen' : 'Enter full screen'}
      aria-pressed={fullscreen.active() ? 'true' : 'false'}
      title={fullscreen.supported() ? 'Toggle full screen' : 'Full screen is unavailable in this browser'}
      disabled={!fullscreen.supported() || fullscreen.pending()}
      onClick={async () => {
        const result = await fullscreen.toggle();
        if (!result.ok && result.error.kind === 'request-failed') props.onError(result.error.cause.message);
      }}
    >
      <SketchIcon name={fullscreen.active() ? 'fullscreenExit' : 'fullscreen'} size={16} />
    </button>
  );
}

/** Browser fullscreen state follows fullscreenchange, including Escape and external exits.
 * toggle must be called from a user gesture; it starts the browser request before yielding.
 */
export function createFullscreen(target: () => HTMLElement) {
  const [active, setActive] = createSignal(false, { ownedWrite: true });
  const [supported, setSupported] = createSignal(false, { ownedWrite: true });
  const [pending, setPending] = createSignal(false, { ownedWrite: true });
  let busy = false;
  let disposed = false;
  const sync = () => {
    if (disposed) return;
    const element = target();
    const doc = element.ownerDocument;
    setActive(doc.fullscreenElement === element);
    setSupported(
      Boolean(
        doc.fullscreenEnabled &&
        typeof element.requestFullscreen === 'function' &&
        typeof doc.exitFullscreen === 'function'
      )
    );
  };
  onSettled(sync);
  createEventListener(() => target().ownerDocument, 'fullscreenchange', sync);
  onCleanup(() => {
    disposed = true;
  });
  return {
    active,
    supported,
    pending,
    async toggle(): Promise<Result<void, FullscreenError>> {
      if (disposed) return { ok: false, error: { kind: 'disposed' } };
      if (busy) return { ok: false, error: { kind: 'busy' } };
      const element = target();
      const doc = element.ownerDocument;
      if (
        !doc.fullscreenEnabled ||
        typeof element.requestFullscreen !== 'function' ||
        typeof doc.exitFullscreen !== 'function'
      )
        return { ok: false, error: { kind: 'unsupported' } };
      busy = true;
      setPending(true);
      const result = await attempt(() =>
        doc.fullscreenElement === element ? doc.exitFullscreen() : element.requestFullscreen()
      );
      busy = false;
      if (disposed) return { ok: false, error: { kind: 'disposed' } };
      setPending(false);
      sync();
      return result.ok ? result : { ok: false, error: { kind: 'request-failed', cause: result.error } };
    }
  };
}

/** Non-fatal fullscreen outcomes. Only request-failed carries a browser error suitable for reporting. */
export type FullscreenError = { kind: 'unsupported' | 'busy' | 'disposed' } | { kind: 'request-failed'; cause: Error };
