import { layoutPages } from '../../layoutPages';
import { buildPaintBounds } from './paintBounds';
import { paintRuns } from './paintRuns';
import { paintTree } from './paintTree';
import { planPageComposition } from './planPageComposition';
import { prepareCurveBins } from './prepareCurveBins';

/**
 * Builds transferable paint plans and lookup buffers without importing GPU runtime code.
 * Never throws for an empty document: it has no page placements to prepare.
 */
export function buildCurvePreparation(
  document: Parameters<typeof prepareCurveBins>[0] & {
    pages: { beginVertex: number; endVertex: number; width: number; height: number }[];
    blends: ArrayBuffer;
    groups: ArrayBuffer;
    maskTransfers: ArrayBuffer;
  }
) {
  const runs = document.pages.map((page) =>
    paintRuns(document.instances, page.beginVertex / 6, page.endVertex / 6, document.blends)
  );
  const trees = paintTree(document.instances, document.blends, document.groups, document.pages, document.maskTransfers);
  const composition = planPageComposition(
    document.instances,
    trees,
    document.pages.map((page) => (page.width * page.height) / (document.pages[0]!.width * document.pages[0]!.height)),
    document.clips
  );
  // Layout rejects only a page-less document, whose preparation is empty. Renderer
  // preparation compares these placements with the live layout and rebuilds on mismatch.
  const pages = layoutPages(document.pages, 2).unwrapOr([]);
  const spatial = buildPaintBounds(document.instances, pages);
  return {
    runs,
    trees,
    composition,
    indexed: prepareCurveBins(document),
    spatial,
    placements: pages.map(({ x, y }) => ({ x, y }))
  };
}
