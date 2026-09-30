import type { ButtonProps } from '@app-game/components/ui/button';
import { errorMessage } from '@app-game/solid-gpu/errors';
import { createFullscreen } from '@solid-primitives/fullscreen';
import { createSignal, getOwner, isDisposed, untrack } from 'solid-js';
import type { FullscreenError } from '../../shared/errors';
import type { createViewerI18n } from './i18n/createViewerI18n';

/** Provides fullscreen button props for a replaceable container. Must be created within a Solid owner. */
export function createFullscreenToggleButton(t: ReturnType<typeof createViewerI18n>['t']) {
  const owner = getOwner()!;
  const [error, setError] = createSignal<FullscreenError>();
  const [container, setContainer] = createSignal<HTMLDivElement>();
  const { enter, exit, isActive } = untrack(() => createFullscreen(container));

  return {
    props: {
      get 'aria-label'() {
        return isActive() ? t('exitFullscreen') : t('enterFullscreen');
      },
      get title() {
        return document.fullscreenEnabled
          ? isActive()
            ? t('exitFullscreen')
            : t('enterFullscreen')
          : t('fullscreenUnsupported');
      },
      get disabled() {
        return !document.fullscreenEnabled;
      },
      /** Toggles fullscreen from the click gesture; resolves after the browser request settles. */
      onClick: toggle
    } satisfies Pick<ButtonProps, 'aria-label' | 'title' | 'disabled' | 'onClick'>,
    /** Sets or clears the element that enters fullscreen. */
    setContainer,
    /** Whether the container is currently fullscreen. */
    isActive,
    /** Latest rejected browser request; cleared by a successful toggle or `dismissError`. */
    error,
    /** Hides the latest fullscreen failure. */
    dismissError: () => setError(undefined)
  };

  /** Must run from a user gesture. Browser failures become observable errors; disposal ignores late results. */
  async function toggle() {
    if (isDisposed(owner)) {
      return;
    }

    try {
      await (isActive() ? exit() : enter());
      if (!isDisposed(owner)) {
        setError(undefined);
      }
    } catch (cause) {
      if (!isDisposed(owner)) {
        setError({ kind: 'fullscreen', message: errorMessage(cause), cause });
      }
    }
  }
}
