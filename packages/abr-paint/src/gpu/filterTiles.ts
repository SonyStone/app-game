/** Row-major filter schedule. Release an output only after every destination that needs its
 * original one-pixel halo has captured it. This keeps tile order out of the filter result
 * while retaining roughly two rows of output, rather than the entire brush footprint.
 */
export function* filterTiles(input: Iterable<string>) {
  const keys = [...new Set(input)].sort((a, b) => {
    const [ax, ay] = point(a),
      [bx, by] = point(b);
    return ay! - by! || ax! - bx!;
  });
  const readers = new Map(keys.map((key) => [key, 0]));
  for (const key of keys)
    for (const source of neighbours(key)) if (readers.has(source)) readers.set(source, readers.get(source)! + 1);
  for (const key of keys) {
    const release: string[] = [];
    for (const source of neighbours(key)) {
      const remaining = readers.get(source);
      if (remaining === undefined) continue;
      readers.set(source, remaining - 1);
      if (remaining === 1) release.push(source);
    }
    yield { key, release };
  }
}

function* neighbours(key: string) {
  const [x, y] = point(key);
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) yield `${x! + dx},${y! + dy}`;
}
function point(key: string) {
  return key.split(',').map(Number);
}
