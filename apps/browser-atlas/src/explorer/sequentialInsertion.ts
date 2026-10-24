/**
 * Plans moving several items, one command at a time, to a single insertion point so they arrive
 * side by side in the given order. Each command needs the indices that hold when it runs, after
 * the earlier moves have shifted siblings; this simulates those shifts.
 *
 * Lists are identified by `key`; items and the target in one list share a key. Indices use the
 * convention of single-item drops: `sourceIndex` is the item's current position, and
 * `targetIndex` is the insertion position counted before the item leaves its list. Returns one
 * position pair per source, plus `nextIndex`, the insertion position after the last moved item,
 * where further imported items continue the run.
 */
export function planSequentialInsertion(
  sources: readonly SequentialInsertionSlot[],
  target: SequentialInsertionSlot
): SequentialInsertionPlan {
  const lists = createLists(sources, target);
  const positions = sources.map((source, sourceNumber) => {
    const sourceList = requireList(lists, source.key);
    const targetList = requireList(lists, target.key);
    const token = sourceToken(sourceNumber);
    const position = {
      sourceIndex: indexOf(sourceList, token),
      targetIndex: indexOf(targetList, TARGET_TOKEN)
    };
    sourceList.splice(sourceList.indexOf(token), 1);
    targetList.splice(targetList.indexOf(TARGET_TOKEN), 0, token);
    return position;
  });

  return { positions, nextIndex: indexOf(requireList(lists, target.key), TARGET_TOKEN) };
}

/** A position inside one ordered list, such as a tab inside a window. */
export type SequentialInsertionSlot = Readonly<{ key: string; index: number }>;

/** Indices for each planned move and the position following the moved run. */
export type SequentialInsertionPlan = Readonly<{
  positions: readonly Readonly<{ sourceIndex: number; targetIndex: number }>[];
  nextIndex: number;
}>;

/**
 * Lays out every referenced list with placeholders for unmoved siblings, each source at its
 * index, and a marker where the moved run is inserted. Sources that report the same index keep
 * their given order.
 */
function createLists(
  sources: readonly SequentialInsertionSlot[],
  target: SequentialInsertionSlot
): Map<string, string[]> {
  const slotsByKey = new Map<string, ListSlot[]>();
  const addSlot = (key: string, slot: ListSlot) => {
    const slots = slotsByKey.get(key) ?? [];
    slots.push(slot);
    slotsByKey.set(key, slots);
  };
  sources.forEach((source, sourceNumber) =>
    addSlot(source.key, { index: source.index, rank: 1, token: sourceToken(sourceNumber) })
  );
  addSlot(target.key, { index: target.index, rank: 0, token: TARGET_TOKEN });

  const lists = new Map<string, string[]>();
  for (const [key, slots] of slotsByKey) {
    const occupied = new Set(slots.filter((slot) => slot.rank === 1).map((slot) => slot.index));
    const length = Math.max(...slots.map((slot) => slot.index + 1));
    for (let index = 0; index < length; index += 1) {
      if (!occupied.has(index)) {
        slots.push({ index, rank: 1, token: `sibling:${index}` });
      }
    }
    const ordered = slots
      .map((slot, order) => ({ ...slot, order }))
      .sort((left, right) => left.index - right.index || left.rank - right.rank || left.order - right.order);
    lists.set(
      key,
      ordered.map((slot) => slot.token)
    );
  }
  return lists;
}

type ListSlot = { index: number; rank: number; token: string };

function indexOf(list: readonly string[], token: string): number {
  return list.slice(0, list.indexOf(token)).filter((candidate) => candidate !== TARGET_TOKEN).length;
}

function requireList(lists: ReadonlyMap<string, string[]>, key: string): string[] {
  const list = lists.get(key);
  if (!list) {
    throw new Error(`Sequential insertion has no list for ${key}.`);
  }
  return list;
}

function sourceToken(sourceNumber: number): string {
  return `source:${sourceNumber}`;
}

const TARGET_TOKEN = 'target';
