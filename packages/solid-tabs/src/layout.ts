/** Inserts a held tab into the nearest horizontal slot without changing card depth. */
export function reorderTab(order: readonly string[], id: string, x: number, slots: readonly number[]) {
  const from = order.indexOf(id);
  if (from < 0 || !slots.length) return [...order];
  let index = 0;
  for (let i = 1; i < slots.length; i++) {
    if (x > (slots[i - 1]! + slots[i]!) / 2) index = i;
  }
  const rest = order.filter((candidate) => candidate !== id);
  rest.splice(Math.min(index, rest.length), 0, id);
  return rest;
}

/** Keeps expanded slots inside the field, preserving order and room between handles. */
export function fitTabSlots(slots: readonly number[]) {
  const gap = slots.length > 1 ? 1 / (2 * (slots.length - 1)) : 0;
  const fitted: number[] = [];
  slots.forEach((slot, index) => {
    const minimum = index ? fitted[index - 1]! + gap : 0;
    const maximum = 1 - (slots.length - 1 - index) * gap;
    fitted.push(Math.max(minimum, Math.min(maximum, slot)));
  });
  return fitted;
}

/** Places overlapping handles on separate rows while retaining back-to-front sheet order. */
export function tabRows(order: readonly string[], left: (id: string) => number, width: number, height = 6) {
  const rows = new Map<string, number>();
  order.forEach((id, rank) => {
    let row = restingRow(rank) * (height / 6);
    for (const previous of order.slice(0, rank)) {
      const overlap = Math.abs(left(id) - left(previous)) < width;
      row = Math.max(row, rows.get(previous)! + (overlap ? height + 0.2 : height / 5));
    }
    rows.set(id, row);
  });
  return rows;
}

/** A minimum stagger; collisions may require larger separation. */
export function restingRow(rank: number) {
  return [0, 1.6, 6.2, 8.2, 13.4, 15.6, 20.4, 21.8][rank] ?? rank * 3.2;
}
