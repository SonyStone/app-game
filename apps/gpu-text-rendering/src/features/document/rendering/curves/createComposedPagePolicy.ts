import type { SceneFrame } from '../createFrame';

/**
 * Decides per frame which visible pages draw their composed (tile-cached) prefix instead of direct paint.
 *
 * Pages outside `composition.pages` never compose. Required pages always do. Overview-only pages compose
 * in a multi-page overview (more than four visible pages, each at most 512 px tall), or permanently once
 * `budget` has retained them after slow direct draws. The policy owns no resources.
 */
export function createComposedPagePolicy(
  document: { pages: readonly { height: number }[] },
  composition: { pages: ReadonlySet<number>; overview: ReadonlySet<number> },
  budget: { has(page: number): boolean; observe(pages: number[]): void }
) {
  return {
    useComposedPage,
    /** Visible pages that use their composed prefix in `frame`; evaluates the policy once per page. */
    composedPages(frame: SceneFrame) {
      const composed = new Set<number>();

      for (const { index } of frame.visible) {
        if (useComposedPage(index, frame)) {
          composed.add(index);
        }
      }

      return composed;
    },
    /**
     * Samples the GPU cost of optional prefixes that `composed` bypassed this frame, so slow pages can switch
     * to composition. Vector-only diagnostic frames are never sampled.
     */
    observeDirectCost(frame: SceneFrame, composed: ReadonlySet<number>) {
      if (frame.vectorOnly) {
        return;
      }

      budget.observe(
        frame.visible
          .filter(({ index }) => composition.overview.has(index) && !composed.has(index))
          .map(({ index }) => index)
      );
    }
  };

  /** Ordinary image pages use their composed prefix only in a multi-page overview. */
  function useComposedPage(index: number, frame: SceneFrame) {
    if (!composition.pages.has(index)) {
      return false;
    }

    if (!composition.overview.has(index) || budget.has(index)) {
      return true;
    }

    const [, , c, e] = frame.rotation;
    const height = document.pages[index]!.height / document.pages[0]!.height;
    const screenHeight = (Math.hypot(c! * frame.width, e! * frame.height) * frame.mul[1] * height) / 2;
    return frame.visible.length > 4 && screenHeight <= 512;
  }
}
