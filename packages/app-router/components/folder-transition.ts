import { makeEventListener } from '@solid-primitives/event-listener';
import styles from './folder-transition.module.css';

/** The view transition name shared by a folder tile and its panel while one morphs into the other. */
const folderMorph = 'folder';

/**
 * Navigates as a view transition in which `from` morphs into the element `target` finds on the new page:
 * a folder tile grows into its folder's panel, and the panel shrinks back into the tile. Falls back to a
 * plain navigation without the View Transitions API or when the user prefers reduced motion; gives up the
 * morph if the target does not render within a second and a half. Before the morph starts, `reveal`
 * scrolls the new page to the target: the top of an opened folder, or the tile it shrinks back into.
 */
export function navigateMorphing(
  from: HTMLElement,
  navigate: () => void,
  target: () => HTMLElement | null,
  reveal: (target: HTMLElement) => void
) {
  if (!document.startViewTransition || matchMedia('(prefers-reduced-motion: reduce)').matches) {
    navigate();
    return;
  }

  let to: HTMLElement | null = null;
  document.documentElement.classList.add(styles.morphing);
  from.style.viewTransitionName = folderMorph;
  const transition = document.startViewTransition(async () => {
    from.style.viewTransitionName = '';
    navigate();
    to = await waitForElement(target);
    if (to) {
      settleEntrances(to);
      reveal(to);
      to.style.viewTransitionName = folderMorph;
    }
  });

  transition.finished.finally(() => {
    document.documentElement.classList.remove(styles.morphing);
    if (to) {
      to.style.viewTransitionName = '';
    }
  });
}

/**
 * Finishes the entrance animations that remounted tiles start around the morph, so the morph lands on
 * the final layout; tiles inside the target, an opening panel's pages, keep theirs. Endless animations,
 * live tiles' slideshows among them, are left running.
 */
function settleEntrances(target: HTMLElement) {
  for (const animation of document.getAnimations()) {
    const element = (animation.effect as KeyframeEffect | null)?.target;
    const endless = animation.effect?.getTiming().iterations === Infinity;
    if (animation instanceof CSSAnimation && element && !endless && (element === target || !target.contains(element))) {
      animation.finish();
    }
  }
}

/**
 * Morphs folders on history traversal too — the browser's back and forward buttons, mouse side buttons,
 * Alt+arrows and back gestures — not only on the panel's close button. Listens to `popstate` in
 * the capture phase, ahead of the router: when the traversal leaves an opened folder for its parent page,
 * or reaches a folder whose tile is on screen — from another folder open in place too — it holds the event
 * back and hands it to the router inside the morph. Leaves traversals the browser already animates itself (Safari's swipe back) alone. Call it
 * once, outside the router; the listener is removed with the calling owner.
 */
export function createFolderHistoryMorph() {
  let replaying = false;

  makeEventListener(
    window,
    'popstate',
    (event) => {
      if (replaying || event.hasUAVisualTransition) {
        return;
      }

      const path = normalizePath(location.pathname);
      const panel = document.querySelector<HTMLElement>('[data-folder-panel]');
      const tile = document.querySelector<HTMLElement>(`[data-folder="${CSS.escape(path)}"]`);
      const replay = () => {
        replaying = true;
        window.dispatchEvent(new PopStateEvent('popstate', { state: event.state }));
        replaying = false;
      };

      if (panel && panel.dataset.folderBack === path) {
        event.stopImmediatePropagation();
        navigateMorphing(panel, replay, findFolderTile(panel.dataset.folderPanel ?? ''), (tile) =>
          tile.scrollIntoView({ block: 'center' })
        );
      } else if (tile) {
        event.stopImmediatePropagation();
        navigateMorphing(
          tile,
          replay,
          () => document.querySelector<HTMLElement>(`[data-folder-panel="${CSS.escape(path)}"]`),
          revealFolderPanel
        );
      }
    },
    { capture: true }
  );
}

/**
 * Finds the tile of the folder at `path` once no folder panel is left on the page, as the morph target
 * when a panel closes: a start page that shows folders in place keeps the tile on screen while the panel
 * is still open, and the morph must wait for the panel to go.
 */
export function findFolderTile(path: string) {
  return () =>
    document.querySelector('[data-folder-panel]')
      ? null
      : document.querySelector<HTMLElement>(`[data-folder="${CSS.escape(path)}"]`);
}

/**
 * Scrolls an opened folder's panel into view unless its top already shows in the upper half of the screen:
 * a panel opened mid-page comes up near the top.
 */
export function revealFolderPanel(panel: HTMLElement) {
  const top = panel.getBoundingClientRect().top;
  if (top < 0 || top > innerHeight * 0.5) {
    window.scrollBy(0, top - innerHeight * 0.15);
  }
}

/** A path without its trailing slash, so `/paint/` and `/paint` match; the root stays `/`. */
export function normalizePath(path: string) {
  return path.replace(/(.)\/$/, '$1');
}

/** Whether a click should navigate in place, rather than open a new tab or window. */
export function isPlainClick(event: MouseEvent) {
  return event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey;
}

/** Polls with timers: animation frames do not run while a view transition holds rendering. */
function waitForElement(find: () => HTMLElement | null, timeout = 1500) {
  const start = performance.now();

  return new Promise<HTMLElement | null>((resolve) => {
    const poll = () => {
      const element = find();
      if (element || performance.now() - start > timeout) {
        resolve(element);
        return;
      }

      setTimeout(poll, 16);
    };
    poll();
  });
}
