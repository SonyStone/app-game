import { errorMessage } from '@app-game/solid-gpu/errors';
import { createFullscreen } from '@solid-primitives/fullscreen';
import { getOwner, isDisposed, untrack, type Accessor } from 'solid-js';
import { createImmediateSignal } from '../../shared/createImmediateSignal';
import type { FullscreenError } from '../../shared/errors';
import { nativeShell } from '../native-shell';

/**
 * Provides props for a button that toggles fullscreen for `container`, the whole editor including its controls.
 * The state follows the browser, including exits through Escape. In the Android shell app there is nothing to toggle;
 * see `shown`. Must be created within a Solid owner.
 */
export function createFullscreenToggle(
  container: Accessor<HTMLElement | undefined>,
  /** Receives a refused browser request; drawing state is unaffected. */
  onError: (error: FullscreenError) => void
) {
  const owner = getOwner()!;
  const [pending, setPending, isRequesting] = createImmediateSignal(false);
  // createFullscreen reads `container` once during setup; keep that read out of the caller's tracking scope.
  const { enter, exit, isActive } = untrack(() => createFullscreen(container));
  const supported = () => document.fullscreenEnabled;

  return {
    props: {
      get 'aria-label'() {
        return isActive() ? 'Exit full screen' : 'Enter full screen';
      },
      get 'aria-pressed'() {
        return isActive() ? ('true' as const) : ('false' as const);
      },
      get title() {
        return supported() ? 'Toggle full screen' : 'Full screen is unavailable in this browser';
      },
      get disabled() {
        return !supported() || pending();
      },
      /** Toggles fullscreen from the click gesture; resolves after the browser request settles. */
      onClick: toggle
    },
    /** Whether the container is currently fullscreen. */
    isActive,
    /**
     * Whether a full screen control belongs in the UI at all: not in the Android shell app, which always runs full
     * screen. Variants leave the control out rather than disable it.
     */
    shown: nativeShell() === undefined
  };

  /**
   * Must run from a user gesture: the browser request starts before the first await. A second click before the
   * request settles is ignored. Failures after disposal are not reported.
   */
  async function toggle() {
    if (isDisposed(owner) || isRequesting() || !supported()) {
      return;
    }

    setPending(true);
    try {
      await (isActive() ? exit() : enter());
    } catch (cause) {
      if (!isDisposed(owner)) {
        onError({ kind: 'fullscreen', message: errorMessage(cause), cause });
      }
    } finally {
      setPending(false);
    }
  }
}
