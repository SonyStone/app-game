import type { curveRuns } from './curveRuns';

/** Shader batches of one paint run, from {@link curveRuns}. */
export type CurveBatch = NonNullable<ReturnType<ReturnType<typeof curveRuns>['get']>>[number];

/** Fill shader of one draw; keys match `createCurvePipelines().fills`. */
export type FillKind = 'curve' | 'simple' | 'cached' | 'analytic';

/**
 * Chooses a fill shader for each batch at the frame's coverage scales and merges adjacent batches that
 * share one into ordered draws. Clipped/stroked batches use the general `curve` shader; ordinary fills use
 * the coverage table when its level fits (`cacheScale`), analytic coverage when every outline is at least
 * `exactScale`, and the shared `simple` shader otherwise.
 *
 * Pipeline switches on tiled mobile GPUs can cost more than the shared shader's extra branches, so a run of
 * only ordinary fills needing more than two switches collapses into one `simple` draw.
 * Allocates only the returned spans; paint order is preserved.
 */
export function selectFillBatches(batches: readonly CurveBatch[], cacheScale: number, exactScale: number) {
  let changes = 0;
  let simple = true;
  let previous: FillKind | undefined;

  for (const batch of batches) {
    const kind = fillKind(batch, cacheScale, exactScale);
    changes += Number(previous !== undefined && kind !== previous);
    simple &&= batch.simple;
    previous = kind;
  }

  if (changes > 2 && simple) {
    const count = batches.reduce((sum, batch) => sum + batch.count, 0);
    return [{ kind: 'simple' as FillKind, first: batches[0]!.first, count }];
  }

  const spans: { kind: FillKind; first: number; count: number }[] = [];

  for (const batch of batches) {
    const kind = fillKind(batch, cacheScale, exactScale);
    const last = spans.at(-1);

    if (last?.kind === kind) {
      last.count += batch.count;
    } else {
      spans.push({ kind, first: batch.first, count: batch.count });
    }
  }

  return spans;
}

function fillKind(batch: CurveBatch, cacheScale: number, exactScale: number): FillKind {
  if (!batch.simple) {
    return 'curve';
  }

  if (batch.cacheScale <= cacheScale) {
    return 'cached';
  }

  if (batch.minimumScale >= exactScale) {
    return 'analytic';
  }

  return 'simple';
}
