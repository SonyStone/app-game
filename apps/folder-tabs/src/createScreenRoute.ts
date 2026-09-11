import { createEventListener } from '@solid-primitives/event-listener';
import { createSignal, flush, onCleanup, type Accessor } from 'solid-js';
import styles from './transitions.module.css';

/**
 * Two same-document routes sharing one mounted deck. History navigation uses the
 * same view transition as links. Browsers without View Transitions animate the
 * shared element from its previous bounds; reduced motion updates immediately.
 * A newer navigation supersedes the pending snapshot; disposal cancels it.
 */
export function createScreenRoute(
  reducedMotion: Accessor<boolean>,
  screen: Accessor<HTMLElement | undefined>,
  options: {
    /** Mount path without a trailing slash; defaults to the standalone root. */
    basePath?: string;
    /** Delegates URL changes to the host router; the deck still owns layout transitions. */
    navigate?: (path: string) => void;
  } = {}
) {
  const href = (path: '/' | '/fullscreen') => `${options.basePath ?? ''}${path === '/' ? '' : path}` || '/';
  document.documentElement.classList.add(styles.transitionDocument!);
  const [fullscreen, setFullscreen] = createSignal(window.location.pathname.replace(/\/$/, '') === href('/fullscreen'));
  let transition: ViewTransition | undefined;
  let animation: Animation | undefined;
  let disposed = false;
  let previewScroll = 0;

  function update(next = window.location.pathname.replace(/\/$/, '') === href('/fullscreen')) {
    transition?.skipTransition();
    const element = screen();
    const before = element?.getBoundingClientRect();
    const radius = element ? getComputedStyle(element).borderRadius : '0px';
    // Retarget from the currently painted bounds when a navigation interrupts motion.
    animation?.cancel();
    const commit = () => {
      if (disposed) return;
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
    const destination = href(path);
    if (window.location.pathname === destination) return;
    if (options.navigate) options.navigate(destination);
    else window.history.pushState(null, '', destination);
    update(path === '/fullscreen');
  }

  createEventListener(window, 'popstate', () => update());
  onCleanup(() => {
    document.documentElement.classList.remove(styles.transitionDocument!);
    disposed = true;
    transition?.skipTransition();
    animation?.cancel();
  });
  return { fullscreen, navigate, href };
}
