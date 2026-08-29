import { createSignal, onCleanup, type Accessor } from 'solid-js';

/**
 * Creates a reactive pixel gap by reading a layout container's computed
 * `row-gap`.
 *
 * Attach {@link DynamicGap.setElementRef} to the element whose direct children
 * are virtualized. The gap refreshes when that element's class, relevant inline
 * style, or width changes, and when the window resizes. Virtual padding changes
 * are ignored so scrolling does not force repeated computed-style reads.
 */
export function createDynamicGap(
  options: Readonly<{
    /** Value used before attachment or when `row-gap` cannot resolve to pixels. Defaults to `0`. */
    fallback?: number;
  }> = {}
): Accessor<number> &
  Readonly<{
    /** Immediately rereads the attached element's computed `row-gap`. */
    refresh: () => void;
    /** Attaches the direct-child layout container whose `row-gap` should be tracked. */
    setElementRef: (element: HTMLElement) => void;
  }> {
  const fallback = nonNegativeGap(options.fallback ?? DEFAULT_GAP);
  const [gap, setGap] = createSignal(fallback, { ownedWrite: true });
  let element: HTMLElement | undefined;
  let stopObserving = (): void => undefined;

  function refresh(): void {
    setGap(element ? readRowGap(element, fallback) : fallback);
  }

  function setElementRef(nextElement: HTMLElement): void {
    if (element === nextElement) {
      refresh();
      return;
    }

    stopObserving();
    element = nextElement;
    setGap(readRowGap(nextElement, fallback));
    stopObserving = observeGapSource(nextElement, refresh);
  }

  onCleanup(() => stopObserving());

  return Object.assign(gap, { refresh, setElementRef });
}

function readRowGap(element: HTMLElement, fallback: number): number {
  if (typeof getComputedStyle === 'undefined') {
    return fallback;
  }

  const value = getComputedStyle(element).rowGap.trim();
  if (value === 'normal') {
    return 0;
  }
  if (!value.endsWith('px')) {
    return fallback;
  }

  return nonNegativeGap(Number.parseFloat(value), fallback);
}

function observeGapSource(element: HTMLElement, refresh: () => void): () => void {
  let inlineStyle = readGapRelevantInlineStyle(element);
  const mutationObserver =
    typeof MutationObserver === 'undefined'
      ? undefined
      : new MutationObserver((records) => {
          const nextInlineStyle = readGapRelevantInlineStyle(element);
          const classChanged = records.some((record) => record.attributeName === 'class');
          const inlineStyleChanged = nextInlineStyle !== inlineStyle;
          inlineStyle = nextInlineStyle;
          if (classChanged || inlineStyleChanged) refresh();
        });
  mutationObserver?.observe(element, {
    attributes: true,
    attributeFilter: ['class', 'style']
  });

  let width = element.getBoundingClientRect().width;
  const resizeObserver =
    typeof ResizeObserver === 'undefined'
      ? undefined
      : new ResizeObserver((entries) => {
          const entry = entries.find((candidate) => candidate.target === element);
          if (!entry || entry.contentRect.width === width) return;
          width = entry.contentRect.width;
          refresh();
        });
  resizeObserver?.observe(element);

  if (typeof window !== 'undefined') window.addEventListener('resize', refresh);
  return () => {
    mutationObserver?.disconnect();
    resizeObserver?.disconnect();
    if (typeof window !== 'undefined') window.removeEventListener('resize', refresh);
  };
}

function readGapRelevantInlineStyle(element: HTMLElement): string {
  return Array.from(element.style)
    .filter((property) => property !== 'padding-top' && property !== 'padding-bottom')
    .map(
      (property) =>
        `${property}:${element.style.getPropertyValue(property)}!${element.style.getPropertyPriority(property)}`
    )
    .join(';');
}

function nonNegativeGap(value: number, fallback = DEFAULT_GAP): number {
  return Number.isFinite(value) ? Math.max(0, value) : fallback;
}

const DEFAULT_GAP = 0;
