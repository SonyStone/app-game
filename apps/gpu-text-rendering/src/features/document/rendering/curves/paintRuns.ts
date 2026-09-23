/** Only adjacent outlines may be batched: an intervening image must retain its PDF paint order. */
export function paintRuns(instances: ArrayBuffer, first: number, end: number, blends = new ArrayBuffer(0)) {
  const records = new DataView(instances);
  const modes = new Uint8Array(blends);
  const runs: { first: number; count: number; image: number | undefined; blend: number }[] = [];

  for (let index = first; index < end; index++) {
    const image = records.getUint32(index * 80 + 72, true) === 2 ? records.getUint32(index * 80 + 64, true) : undefined;
    const previous = runs.at(-1);
    const blend = modes[index] ?? 0;

    if (previous && previous.image === image && previous.blend === blend) {
      previous.count++;
    } else {
      runs.push({ first: index, count: 1, image, blend });
    }
  }

  return runs;
}
