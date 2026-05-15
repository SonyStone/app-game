import { type Rect } from '../core/rect';
import type { FlipAnimateEntry } from './createFlip';
import type { SimpleRect } from './createFlipSnapshot';
import { type FlipDelta } from './flipUtils';

type InlineStyleSnapshot = ReadonlyMap<string, string>;

export type FlipAnimationBatch = Readonly<{
  animations: Animation[];
  cleanup?: () => void;
}>;

export function buildFlipAnimateEntries<K>(
  deltas: Map<K, FlipDelta>,
  lastSnapshot: Map<K, Rect>
): ReadonlyArray<FlipAnimateEntry<K>> {
  const entries: FlipAnimateEntry<K>[] = [];

  for (const [key, delta] of deltas) {
    const snap = lastSnapshot.get(key);
    if (!snap) {
      continue;
    }

    entries.push({
      key,
      from: { x: snap.x + snap.width / 2 + delta.dx, y: snap.y + snap.height / 2 + delta.dy },
      to: { x: snap.x + snap.width / 2, y: snap.y + snap.height / 2 },
      delta
    });
  }

  return entries;
}

export function runStandardFlipAnimations<K>(options: {
  deltas: Map<K, FlipDelta>;
  duration: number;
  easing: string;
  elements: ReadonlyMap<K, Pick<HTMLElement, 'animate'>>;
}): FlipAnimationBatch {
  const animations: Animation[] = [];

  for (const [key, delta] of options.deltas) {
    const element = options.elements.get(key);
    if (!element || typeof element.animate !== 'function') {
      continue;
    }

    const hasScale = delta.scaleX !== 1 || delta.scaleY !== 1;
    const fromTransform = hasScale
      ? `translate(${delta.dx}px, ${delta.dy}px) scale(${delta.scaleX}, ${delta.scaleY})`
      : `translate(${delta.dx}px, ${delta.dy}px)`;
    const toTransform = hasScale ? 'translate(0, 0) scale(1, 1)' : 'translate(0, 0)';

    animations.push(
      element.animate([{ transform: fromTransform }, { transform: toTransform }], {
        duration: options.duration,
        easing: options.easing
      })
    );
  }

  return { animations };
}

export type LayoutContainerElement = Pick<HTMLElement, 'animate' | 'style' | 'getBoundingClientRect'> &
  Parameters<typeof getComputedStyle>[0];

export function runLayoutTransitionAnimations<K>(options: {
  duration: number;
  easing: string;
  deltas: Map<K, FlipDelta>;
  elements: ReadonlyMap<K, Pick<HTMLElement, 'animate' | 'style'>>;
  first: Map<K, Rect>;
  firstContainerRect: SimpleRect;
  last: Map<K, Rect>;
  layoutContainer: LayoutContainerElement;
}): FlipAnimationBatch {
  const animations: Animation[] = [];
  const containerLastRect = options.layoutContainer.getBoundingClientRect();
  const computedStyle = getComputedStyle(options.layoutContainer);
  const borderLeft = parseFloat(computedStyle.borderLeftWidth) || 0;
  const borderTop = parseFloat(computedStyle.borderTopWidth) || 0;
  const paddingBoxX = containerLastRect.x + borderLeft;
  const paddingBoxY = containerLastRect.y + borderTop;
  const savedStyles = new Map<Pick<HTMLElement, 'style'>, InlineStyleSnapshot>();

  savedStyles.set(
    options.layoutContainer,
    snapshotInlineStyles(options.layoutContainer, ['position', 'width', 'height'])
  );

  options.layoutContainer.style.position = 'relative';
  options.layoutContainer.style.width = `${containerLastRect.width}px`;
  options.layoutContainer.style.height = `${containerLastRect.height}px`;

  for (const [key, element] of options.elements) {
    const snap = options.last.get(key);
    if (!snap) {
      continue;
    }

    savedStyles.set(element, snapshotInlineStyles(element, ['position', 'left', 'top', 'width', 'height', 'margin']));
    element.style.position = 'absolute';
    element.style.left = `${snap.x - paddingBoxX}px`;
    element.style.top = `${snap.y - paddingBoxY}px`;
    element.style.width = `${snap.width}px`;
    element.style.height = `${snap.height}px`;
    element.style.margin = '0';
  }

  if (
    options.firstContainerRect.width !== containerLastRect.width ||
    options.firstContainerRect.height !== containerLastRect.height
  ) {
    animations.push(
      options.layoutContainer.animate(
        [
          {
            width: `${options.firstContainerRect.width}px`,
            height: `${options.firstContainerRect.height}px`
          },
          { width: `${containerLastRect.width}px`, height: `${containerLastRect.height}px` }
        ],
        { duration: options.duration, easing: options.easing }
      )
    );
  }

  for (const [key, delta] of options.deltas) {
    const element = options.elements.get(key);
    const firstSnap = options.first.get(key);
    const lastSnap = options.last.get(key);
    if (!element || !firstSnap || !lastSnap) {
      continue;
    }

    const hasSize = delta.scaleX !== 1 || delta.scaleY !== 1;
    const from: Keyframe = { transform: `translate(${delta.dx}px, ${delta.dy}px)` };
    const to: Keyframe = { transform: 'translate(0, 0)' };

    if (hasSize) {
      from.width = `${firstSnap.width}px`;
      from.height = `${firstSnap.height}px`;
      to.width = `${lastSnap.width}px`;
      to.height = `${lastSnap.height}px`;
    }

    animations.push(element.animate([from, to], { duration: options.duration, easing: options.easing }));
  }

  return {
    animations,
    cleanup: () => {
      for (const [element, styles] of savedStyles) {
        restoreInlineStyles(element, styles);
      }
    }
  };
}

function snapshotInlineStyles(
  element: Pick<HTMLElement, 'style'>,
  properties: ReadonlyArray<string>
): InlineStyleSnapshot {
  const styles = new Map<string, string>();

  for (const property of properties) {
    styles.set(property, element.style.getPropertyValue(property));
  }

  return styles;
}

function restoreInlineStyles(element: Pick<HTMLElement, 'style'>, styles: InlineStyleSnapshot): void {
  for (const [property, value] of styles) {
    if (value === '') {
      element.style.removeProperty(property);
    } else {
      element.style.setProperty(property, value);
    }
  }
}
