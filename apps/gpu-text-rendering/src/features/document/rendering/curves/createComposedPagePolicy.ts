import type { SceneFrame } from '../createFrame';

/**
 * Decides per frame which visible pages draw their composed (tile-cached) prefix instead of direct paint.
 *
 * Pages outside `composition.pages` never compose. Required pages always do. Overview-only pages compose
 * in a multi-page overview (more than four visible pages, each at most 512 px tall), or permanently once
 * `budget` has retained them after slow direct draws. The policy owns no resources.
 *
 * Independently, pages in `composition.wholePages` can draw complete whole-page tiles, foreground included, in the
 * same multi-page overview; see {@link overviewTilePages} and {@link enterWholePages}.
 */
export function createComposedPagePolicy(
  document: { pages: readonly { height: number }[] },
  composition: { pages: ReadonlySet<number>; overview: ReadonlySet<number>; wholePages?: ReadonlySet<number> },
  budget: { has(page: number): boolean; observe(pages: number[]): void }
) {
  return {
    useComposedPage,
    /**
     * Visible pages that want whole-page overview tiles in `frame`: a multi-page overview of pages at most
     * {@link overviewPageHeight} px tall. Pages already `drawn` from them stay until
     * {@link overviewHysteresis} times that height, so zooming near the threshold does not toggle raster and vector.
     */
    overviewTilePages(frame: SceneFrame, drawn: ReadonlySet<number>) {
      const pages = new Set<number>();

      if (frame.vectorOnly || frame.visible.length <= 4 || !composition.wholePages) {
        return pages;
      }

      for (const { index } of frame.visible) {
        const limit = overviewPageHeight * (drawn.has(index) ? overviewHysteresis : 1);

        if (composition.wholePages.has(index) && pageScreenHeight(index, frame) <= limit) {
          pages.add(index);
        }
      }

      return pages;
    },
    /**
     * Updates the pages a view draws from whole-page tiles. Pages no longer wanted leave at once. A wanted page enters
     * once `covered` reports its tiles cover the view, like an ordinary refinement step, so it never flashes blurry.
     * With `early`, for devices too slow to draw pages directly, it enters as soon as its pinned whole-page fallback
     * exists (`based`) and sharpens as its detail tiles fade in.
     */
    enterWholePages(
      drawn: Set<number>,
      wanted: ReadonlySet<number>,
      {
        covered,
        based,
        early
      }: { covered: (page: number) => boolean; based: (page: number) => boolean; early: boolean }
    ) {
      for (const page of drawn) {
        if (!wanted.has(page)) {
          drawn.delete(page);
        }
      }

      for (const page of wanted) {
        if (!drawn.has(page) && (covered(page) || (early && based(page)))) {
          drawn.add(page);
        }
      }
    },
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
     * Updates a view's `drawn` composed pages from this frame's `wanted` ones. Pages no longer wanted leave at once.
     * Up to {@link maxWaitingPages} optional pages, in `wanted` order, enter only once `covered` reports that their
     * tiles cover the view and keep drawing directly until then: switching on the pinned whole-page fallback would
     * briefly show blocky image tails and soft text. Other pages enter immediately, which bounds direct drawing
     * during fast zooms across many pages, where each page is small on screen.
     */
    enterComposedPages(drawn: Set<number>, wanted: ReadonlySet<number>, covered: (page: number) => boolean) {
      for (const page of drawn) {
        if (!wanted.has(page)) {
          drawn.delete(page);
        }
      }

      let waiting = 0;

      for (const page of wanted) {
        if (drawn.has(page)) {
          continue;
        }

        if (!composition.overview.has(page) || covered(page) || waiting >= maxWaitingPages) {
          drawn.add(page);
        } else {
          waiting++;
        }
      }
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

    return frame.visible.length > 4 && pageScreenHeight(index, frame) <= overviewPageHeight;
  }

  /** The page's projected height in physical pixels, including rotation. */
  function pageScreenHeight(index: number, frame: SceneFrame) {
    const [, , c, e] = frame.rotation;
    const height = document.pages[index]!.height / document.pages[0]!.height;
    return (Math.hypot(c! * frame.width, e! * frame.height) * frame.mul[1] * height) / 2;
  }
}

/** Tallest page, in physical pixels, that a multi-page overview draws from cached tiles. */
const overviewPageHeight = 512;
/** Pages already drawn from whole-page tiles keep them up to this multiple of {@link overviewPageHeight}. */
const overviewHysteresis = 1.25;

/** Optional pages a view may keep drawing directly while their composed tiles refine; the policy's reading scale. */
const maxWaitingPages = 4;
