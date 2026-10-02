import { flush } from 'solid-js';
import type { DockTransition } from './createDock';

/**
 * Marks an element for {@link flipTransition} with `<kind>:<id>`, unique within
 * the dock. `tab:<panelId>` elements only move; `group:<groupId>` and
 * `panel:<panelId>` elements move and resize. Window, tab and default panel
 * props carry it already; add it to custom panel elements.
 */
export const DOCK_FLIP_ATTRIBUTE = 'data-dock-flip';

/**
 * {@link DockTransition} that animates the live elements (FLIP): it measures
 * every marked element, applies the change, then animates each element from its
 * old box to its new one with the Web Animations API. Nothing is snapshotted, so
 * panels stay interactive and keep rendering while they move. A new window
 * starts from the window its active tab came from, so it travels together with
 * the panel inside it; other elements that appear fade in. A change during a
 * running animation starts from where the elements are on screen.
 *
 * Width and height are animated for windows and panels, so their content
 * reflows instead of being scaled. A marked element inside another (a tab in its
 * window) moves relative to it. The returned promise settles when every
 * animation of this change has finished or been cancelled.
 */
export function flipTransition(options: { duration: number; easing?: string }): DockTransition {
  const timing: KeyframeAnimationOptions = {
    duration: options.duration,
    easing: options.easing ?? 'cubic-bezier(0.2, 0.8, 0.2, 1)',
    id: FLIP_ANIMATION_ID
  };

  return (apply, root) => {
    if (!root || typeof root.animate !== 'function' || options.duration <= 0) {
      apply();
      return;
    }

    const before = new Map([...marked(root)].map(([key, element]) => [key, element.getBoundingClientRect()]));
    const parentsBefore = new Map(
      [...marked(root)].map(([key, element]) => [key, markedParent(element)?.getAttribute(DOCK_FLIP_ATTRIBUTE)])
    );
    root
      .getAnimations({ subtree: true })
      .filter((animation) => animation.id === FLIP_ANIMATION_ID)
      .forEach((animation) => animation.cancel());

    apply();
    // The first flush renders the layout; the second applies the rectangles measured by its effects.
    flush();
    flush();

    const after = marked(root);
    // New windows take the old box of the window their active tab was in.
    for (const [key, element] of after) {
      const origin = before.has(key) ? undefined : originOf(element, parentsBefore);
      const from = origin && before.get(origin);
      if (from) {
        before.set(key, from);
      }
    }

    const animations: Animation[] = [];
    for (const [key, element] of after) {
      const from = before.get(key);
      if (!from) {
        animations.push(element.animate([{ opacity: 0 }, { opacity: 1 }], timing));
        continue;
      }

      const to = element.getBoundingClientRect();
      const parent = markedParent(element);
      const parentFrom = parent && before.get(parent.getAttribute(DOCK_FLIP_ATTRIBUTE) ?? '');
      const parentTo = parentFrom && parent.getBoundingClientRect();
      // The parent animates its own move; the child only covers what is left.
      const dx = from.left - to.left - (parentTo ? parentFrom.left - parentTo.left : 0);
      const dy = from.top - to.top - (parentTo ? parentFrom.top - parentTo.top : 0);
      const resizes = !key.startsWith('tab:') && !sameSize(from, to);
      if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5 && !resizes) {
        continue;
      }

      const base = getComputedStyle(element).transform;
      const offset = `translate(${dx}px, ${dy}px)`;
      const start: Keyframe = { transform: base === 'none' ? offset : `${offset} ${base}` };
      const end: Keyframe = { transform: base };
      if (resizes) {
        Object.assign(start, { width: `${from.width}px`, height: `${from.height}px` });
        Object.assign(end, { width: `${to.width}px`, height: `${to.height}px` });
      }

      animations.push(element.animate([start, end], timing));
    }

    return Promise.allSettled(animations.map((animation) => animation.finished));
  };
}

const FLIP_ANIMATION_ID = 'dock-flip';

function marked(root: HTMLElement): Map<string, HTMLElement> {
  const elements = new Map<string, HTMLElement>();
  root.querySelectorAll<HTMLElement>(`[${DOCK_FLIP_ATTRIBUTE}]`).forEach((element) => {
    const key = element.getAttribute(DOCK_FLIP_ATTRIBUTE);
    if (key && !elements.has(key)) {
      elements.set(key, element);
    }
  });
  return elements;
}

/**
 * Key of the element that held the active tab (or the first tab) inside a new
 * `element` before the change, if that tab existed.
 */
function originOf(element: HTMLElement, parentsBefore: Map<string, string | null | undefined>): string | undefined {
  const tabs = [...element.querySelectorAll<HTMLElement>(`[${DOCK_FLIP_ATTRIBUTE}^="tab:"]`)];
  const tab = tabs.find((candidate) => candidate.getAttribute('aria-selected') === 'true') ?? tabs[0];
  const key = tab?.getAttribute(DOCK_FLIP_ATTRIBUTE);
  return (key && parentsBefore.get(key)) || undefined;
}

function markedParent(element: HTMLElement): HTMLElement | null | undefined {
  return element.parentElement?.closest<HTMLElement>(`[${DOCK_FLIP_ATTRIBUTE}]`);
}

function sameSize(left: DOMRect, right: DOMRect): boolean {
  return Math.abs(left.width - right.width) < 0.5 && Math.abs(left.height - right.height) < 0.5;
}
