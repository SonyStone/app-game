import type { PaintNode } from './paintTree';

/**
 * Chooses composed caching per page, keeping ordinary foreground direct.
 * The cached prefix includes the backdrop: extracting arbitrary non-isolated groups
 * would change PDF blending. Nested groups and soft masks remain indivisible.
 * Repeated images and analytic clipping prepare an overview-only
 * prefix. The renderer bypasses that prefix at reading/magnified scales unless GPU cost requires it.
 * Dense fills and clip chains that exceed the small-outline coverage-table limit are cached even
 * in documents without transparency groups. Their ordinary suffix stays direct.
 */
export function planPageComposition(
  instances: ArrayBuffer,
  trees: PaintNode[][],
  pageAreas?: readonly number[],
  clips = new ArrayBuffer(0)
) {
  const records = new DataView(instances);
  const clipRecords = new DataView(clips);
  const denseClips = new Uint8Array(clips.byteLength / 80 + 1);
  for (let index = 0; index < clips.byteLength / 80; index++) {
    denseClips[index + 1] = Number(
      clipRecords.getUint32(index * 80 + 68, true) > 512 ||
        denseClips[clipRecords.getUint32(index * 80 + 76, true)] === 1
    );
  }
  const pages = new Set<number>();
  // Subset of pages whose cache is optional at overview scales, not a permanent raster path.
  const overview = new Set<number>();
  const compositeDocument = trees.some((nodes) => compositeCost(nodes) >= 8);
  const images = new Map<number, Set<number>>();
  const cached: PaintNode[][] = [];
  const direct: PaintNode[][] = [];

  for (const [page, nodes] of trees.entries()) {
    const densePath = (index: number) =>
      denseOutline(records, index) || denseClips[records.getUint32(index * 80 + 24, true)] === 1;
    const dense = containsOutline(nodes, densePath);
    const cost = compositeCost(nodes);
    const expensive = cost >= 8 || dense;
    const largePath = (index: number) => costlyOutline(records, index, pageAreas?.[page] ?? 1);
    const cachedPath = (index: number) =>
      densePath(index) || largePath(index) || records.getUint32(index * 80 + 24, true) !== 0;
    const overviewOnly =
      !expensive &&
      (imageCount(nodes) >= 8 ||
        containsOutline(nodes, cachedPath) ||
        (compositeDocument && containsImage(nodes)));
    const boundary =
      nodes.findLastIndex(
        (node) =>
          'children' in node || node.blend !== 0 || node.image !== undefined || containsOutline([node], cachedPath)
      ) + 1;
    const prefix = nodes.slice(0, boundary);
    const foreground = nodes.slice(boundary);
    const last = prefix.at(-1);

    // A paint run can contain both a large illustration and small text. Keep the
    // ordinary suffix live even when they share one original GPU batch.
    if ((overviewOnly || dense) && last && !('children' in last) && last.image === undefined && last.blend === 0) {
      let end = last.first + last.count;
      const retained = cachedPath;
      while (end > last.first && !retained(end - 1)) {
        end--;
      }
      if (end < last.first + last.count) {
        prefix[prefix.length - 1] = { ...last, count: end - last.first };
        foreground.unshift({ ...last, first: end, count: last.first + last.count - end });
      }
    }

    if ((!expensive && !overviewOnly) || boundary === 0 || containsHairline(prefix, records)) {
      cached.push([]);
      direct.push(nodes);
      continue;
    }

    pages.add(page);
    if (overviewOnly) {
      overview.add(page);
    }
    cached.push(prefix);
    direct.push(foreground);
    images.set(page, imageResources(prefix));
  }

  return { pages, overview, cached, direct, images };
}

function containsImage(nodes: PaintNode[]): boolean {
  return nodes.some((node) => ('children' in node ? containsImage(node.children) : node.image !== undefined));
}

/** Repeated raster swatches can be cheap individually yet dominate an entire book's overview. */
function imageCount(nodes: PaintNode[]): number {
  return nodes.reduce(
    (count, node) =>
      count + ('children' in node ? imageCount(node.children) : node.image === undefined ? 0 : node.count),
    0
  );
}

/** Dense fills bypass the small-outline area tables and can dominate a minified frame. */
function denseOutline(records: DataView, index: number) {
  return records.getUint32(index * 80 + 72, true) <= 1 && records.getUint32(index * 80 + 68, true) > 512;
}

function containsOutline(nodes: PaintNode[], costly: (index: number) => boolean): boolean {
  return nodes.some((node) => {
    if ('children' in node) {
      return containsOutline(node.children, costly);
    }
    for (let index = node.first; index < node.first + node.count; index++) {
      if (costly(index)) {
        return true;
      }
    }
    return false;
  });
}

/** Large curve fills cost per covered pixel; ordinary body glyphs stay far below this area. */
function costlyOutline(records: DataView, index: number, pageArea: number) {
  const offset = index * 80;
  if (records.getUint32(offset + 72, true) > 1 || records.getUint32(offset + 68, true) < 16) {
    return false;
  }
  const area = Math.abs(
    records.getFloat32(offset, true) * records.getFloat32(offset + 12, true) -
      records.getFloat32(offset + 4, true) * records.getFloat32(offset + 8, true)
  );
  return area >= pageArea * 0.02;
}

function compositeCost(nodes: PaintNode[]): number {
  return nodes.reduce(
    (cost, node) => cost + ('children' in node ? 3 + compositeCost(node.children) : Number(node.blend !== 0)),
    0
  );
}

/** Hairlines inside the cached prefix need screen-space evaluation at every zoom. */
function containsHairline(nodes: PaintNode[], records: DataView): boolean {
  return nodes.some((node) => {
    if ('children' in node) {
      return containsHairline(node.children, records);
    }

    for (let index = node.first; index < node.first + node.count; index++) {
      if (records.getUint32(index * 80 + 72, true) >= 3) {
        return true;
      }
    }

    return false;
  });
}

/** Only uploads used by the cached prefix may invalidate its composed tiles. */
function imageResources(nodes: PaintNode[], result = new Set<number>()): Set<number> {
  for (const node of nodes) {
    if ('children' in node) {
      imageResources(node.children, result);
    } else if (node.image !== undefined) {
      result.add(node.image);
    }
  }

  return result;
}
