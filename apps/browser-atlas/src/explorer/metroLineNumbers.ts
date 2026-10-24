/**
 * Keeps the remembered number of every group that still exists and gives each new group the
 * smallest number no current group uses, in document order.
 */
export function assignMetroLineNumbers(
  remembered: Readonly<Record<string, number>>,
  lineStartIds: readonly string[]
): ReadonlyMap<string, number> {
  const numbers = new Map<string, number>();
  const used = new Set<number>();
  for (const id of lineStartIds) {
    const number = remembered[id];
    if (number !== undefined && Number.isInteger(number) && number > 0 && !used.has(number)) {
      numbers.set(id, number);
      used.add(number);
    }
  }

  let next = 1;
  for (const id of lineStartIds) {
    if (numbers.has(id)) {
      continue;
    }

    while (used.has(next)) {
      next += 1;
    }
    numbers.set(id, next);
    used.add(next);
  }
  return numbers;
}

/** Color of a line by its hidden number; numbers past the scheme reuse its colors. */
export function metroLineColor(number: number): string {
  return METRO_LINE_COLORS[(number - 1) % METRO_LINE_COLORS.length]!;
}

/** Lines 1–15 of the Moscow metro scheme. */
const METRO_LINE_COLORS: readonly string[] = [
  '#EF161E',
  '#2DBE2C',
  '#0078BE',
  '#00BFFF',
  '#8D5B2D',
  '#ED9121',
  '#800080',
  '#FFD702',
  '#999999',
  '#99CC00',
  '#82C0C0',
  '#A1B3D4',
  '#9999FF',
  '#FFA8AF',
  '#DE64A1'
];
