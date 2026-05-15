import { access, type MaybeAccessor } from '@solid-primitives/utils';
import { createEffect, createMemo, createSignal } from 'solid-js';
import { detectLayout, type DetectedLayout } from '../core/detectLayout';

export type CreateDetectLayoutOptions = Parameters<typeof createDetectLayout>[0];
export type DetectLayoutState = ReturnType<typeof createDetectLayout>;

export function createDetectLayout(container: MaybeAccessor<HTMLElement | undefined>) {
  const [detectedLayout, setDetectedLayout] = createSignal<DetectedLayout>({ mode: 'vertical' });

  createEffect(() => {
    const element = access(container);
    if (!element) {
      return;
    }

    const syncDetectedLayout = (): void => {
      setDetectedLayout(detectLayout(element));
    };

    syncDetectedLayout();

    const mutationObserver =
      typeof MutationObserver !== 'undefined'
        ? new MutationObserver(() => {
            syncDetectedLayout();
          })
        : undefined;
    mutationObserver?.observe(element, {
      attributes: true,
      attributeFilter: ['style', 'class']
    });

    const resizeObserver =
      typeof ResizeObserver !== 'undefined'
        ? new ResizeObserver(() => {
            syncDetectedLayout();
          })
        : undefined;
    resizeObserver?.observe(element);

    return () => {
      mutationObserver?.disconnect();
      resizeObserver?.disconnect();
    };
  });

  const detectedColumns = createMemo<number | undefined>(() => {
    const layout = detectedLayout();
    if (layout.mode !== 'grid') {
      return undefined;
    }

    return typeof layout.gridConfig.columns === 'number' ? layout.gridConfig.columns : undefined;
  });

  function updateLayout(element?: HTMLElement): void {
    if (!element) {
      return;
    }

    setDetectedLayout(detectLayout(element));
  }

  return {
    detectedLayout,
    detectedColumns,
    updateLayout
  };
}
