import { createEventListener } from '@solid-primitives/event-listener';
import { createSignal, flush, onCleanup, type Accessor } from 'solid-js';

/**
 * Two same-document routes sharing one mounted deck. History navigation uses the
 * same view transition as links. Browsers without View Transitions animate the
 * shared element from its previous bounds; reduced motion updates immediately.
 * A newer navigation supersedes the pending snapshot; disposal cancels it.
 */
export function createScreenRoute(reducedMotion: Accessor<boolean>, screen: Accessor<HTMLElement | undefined>) {
  const [fullscreen, setFullscreen] = createSignal(window.location.pathname.replace(/\/$/, '') === '/fullscreen');
  let transition: ViewTransition | undefined;
  let animation: Animation | undefined;
  let disposed = false;
  let previewScroll = 0;

  function update() {
    transition?.skipTransition();
    const element = screen();
    const before = element?.getBoundingClientRect();
    const radius = element ? getComputedStyle(element).borderRadius : '0px';
    // Retarget from the currently painted bounds when a navigation interrupts motion.
    animation?.cancel();
    const commit = () => {
      if (disposed) return;
      const next = window.location.pathname.replace(/\/$/, '') === '/fullscreen';
      if (next && !fullscreen()) previewScroll = window.scrollY;
      // The shared screen owns route motion; settle its internal layout before capture.
      element?.setAttribute('data-route-layout', '');
      setFullscreen(next);
      flush();
      element?.getBoundingClientRect();
      element?.removeAttribute('data-route-layout');
      window.scrollTo({ top: next ? 0 : previewScroll, behavior: 'instant' });
    };
    if (reducedMotion()) {
      commit();
      return;
    }
    if (typeof document.startViewTransition !== 'function') {
      commit();
      const after = element?.getBoundingClientRect();
      if (element && before && after?.width && after.height && typeof element.animate === 'function') {
        animation = element.animate(
          [
            {
              transformOrigin: '0 0',
              transform: `translate(${before.x - after.x}px, ${before.y - after.y}px) scale(${before.width / after.width}, ${before.height / after.height})`,
              borderRadius: radius
            },
            {
              transformOrigin: '0 0',
              transform: 'translate(0, 0) scale(1, 1)',
              borderRadius: getComputedStyle(element).borderRadius
            }
          ],
          { duration: 800, easing: 'cubic-bezier(0.22, 0.7, 0.18, 1)' }
        );
      }
      return;
    }
    transition = document.startViewTransition(commit);
    void transition.finished.catch(() => {});
  }

  /** Intercepts only unmodified same-tab activation; native new-tab links still work. */
  function navigate(event: MouseEvent, path: '/' | '/fullscreen') {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    if (window.location.pathname === path) return;
    window.history.pushState(null, '', path);
    update();
  }

  createEventListener(window, 'popstate', update);
  onCleanup(() => {
    disposed = true;
    transition?.skipTransition();
    animation?.cancel();
  });
  return { fullscreen, navigate };
}
