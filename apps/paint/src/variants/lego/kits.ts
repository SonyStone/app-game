import { z } from 'zod';
import { createImmediateSignal } from '../../shared/createImmediateSignal';
import { newId, partsBounds, type Board, type Panel, type Part } from './board';
import { createPartStorage, migratePart, opaqueData, storedPart } from './partStorage';
import { swatchPanelParts } from './swatchPanelParts';

/**
 * Kits: panels kept to be used again. A kit is a set of parts as they lay on a panel, with the panels of the swatches
 * among them; dropped on the drawing it becomes a panel of its own, dropped on a panel its parts join it as one block
 * (see `placeBlock`), and each part stays a part of its own, to move, size or put away. The box offers the ready kits
 * and the ones the user saved.
 */
export type Kit = {
  id: string;
  name: string;
  /** The parts, their cells counted from the kit's top-left at (0, 0). */
  parts: Part[];
  /**
   * The panels of swatches among the parts, by the owner's id in the kit, with where each lies from its swatch if
   * the user placed it; owners may lie in other owned panels.
   */
  owned: { owner: string; parts: Part[]; offset?: { column: number; row: number } }[];
};

/** The kits on this device, ready ones first. `onSavingError` reports refused or failed local saves. */
export function createKits(onSavingError?: (message: string) => void) {
  const storage = createPartStorage('paint.lego.kits', 'kits', [], read, onSavingError);
  const [saved, setSaved, latest] = createImmediateSignal<Kit[]>(storage.initial);
  const store = (next: Kit[]) => {
    setSaved(next);
    storage.write(next);
  };

  return {
    /** Local save availability and the result of the last save attempt. */
    saving: storage.saving,
    /** Every kit, the ready ones first. */
    kits: () => [...readyKits, ...saved()],
    /** The kit, ready or the user's, of just these `parts` laid out the same way, if there is one; see `sameLayout`. */
    findSame(parts: readonly Part[]) {
      const layout = sameLayout(parts);
      return [...readyKits, ...saved()].find((kit) => sameLayout(kit.parts) === layout);
    },
    /** Whether kit `id` is the user's, which they may delete. */
    isSaved: (id: string) => saved().some((kit) => kit.id === id),
    /** Keeps `panel` of `board`, with the panels of its swatches, as a kit named `name`. */
    save(board: Board, panel: Panel, name: string) {
      store([...latest(), kitOf(board, panel, name)]);
    },
    remove(id: string) {
      store(latest().filter((kit) => kit.id !== id));
    },
    rename(id: string, name: string) {
      store(latest().map((kit) => (kit.id === id ? { ...kit, name } : kit)));
    },
    /** `name`, or with the first number after it that no kit of the user's has. */
    uniqueName(name: string) {
      const names = new Set(latest().map((kit) => kit.name));
      let unique = name;
      for (let number = 2; names.has(unique); number += 1) {
        unique = `${name} ${number}`;
      }

      return unique;
    }
  };
}

/**
 * A fresh copy of `kit` to place: every part gets a new id, so a kit can be placed again and again, with the owned
 * panels, ready to join a board, re-pointed at the new owners. Cells stay as in the kit.
 */
export function unpackKit(kit: Pick<Kit, 'parts' | 'owned'>) {
  const ids = new Map<string, string>();
  const renew = (parts: readonly Part[]) =>
    parts.map((part) => {
      const id = newId('part');
      ids.set(part.id, id);
      return { ...part, id };
    });
  const parts = renew(kit.parts);
  const owned = kit.owned.map((entry) => ({ ...entry, parts: renew(entry.parts) }));
  const panels: Panel[] = owned.flatMap((entry) => {
    const owner = ids.get(entry.owner);
    return owner ? [{ id: newId('panel'), at: { x: 0, y: 0 }, owner, parts: entry.parts, offset: entry.offset }] : [];
  });

  return { parts, panels };
}

/**
 * `parts` as a key that two sets of parts share when they are the same kinds and looks in the same sizes, laid out
 * the same way whatever their ids or where they lie.
 */
export function sameLayout(parts: readonly Part[]) {
  return fromOrigin(parts)
    .map((part) => {
      const looks = Object.entries(part.looks ?? {}).sort(([a], [b]) => a.localeCompare(b));
      return `${part.kind}@${part.cell.column},${part.cell.row}:${part.span.columns}x${part.span.rows}${JSON.stringify(looks)}`;
    })
    .sort()
    .join('|');
}

/** `panel` of `board` as a kit, its cells counted from its top-left, with the panels its swatches own, nested too. */
export function kitOf(board: Board, panel: Panel, name: string): Kit {
  const owned: Kit['owned'] = [];
  const collect = (parts: readonly Part[]) => {
    for (const part of parts) {
      const own = board.panels.find((candidate) => candidate.owner === part.id);
      if (own && !owned.some((entry) => entry.owner === part.id)) {
        owned.push({ owner: part.id, parts: own.parts, offset: own.offset });
        collect(own.parts);
      }
    }
  };
  collect(panel.parts);

  return { id: newId('kit'), name, parts: fromOrigin(panel.parts), owned };
}

/** `parts` moved so that their bounds start at cell (0, 0). */
function fromOrigin(parts: readonly Part[]) {
  const bounds = partsBounds(parts);
  return parts.map((part) => ({
    ...part,
    cell: { column: part.cell.column - bounds.column, row: part.cell.row - bounds.row }
  }));
}

/** A part for the ready kits, with the look chosen at its own size when given. */
const part = (id: string, kind: string, column: number, row: number, columns: number, rows: number, look?: string) => ({
  id,
  kind,
  cell: { column, row },
  span: { columns, rows },
  looks: look ? { [`${columns}x${rows}`]: look } : undefined
});

/**
 * The ready kits, each one of the library's color panels taken apart: Procreate's Colors (the pair, the Classic
 * square and sliders, history and palette), the OKLCH wheel (disk, lightness, harmony, gamut mask), the Desktop
 * color panel (pair and hex, the triangle, H/S/V numbers, history), and the panel a new swatch opens.
 */
const readyKits: Kit[] = [
  { id: 'ready:swatch-panel', name: 'Color panel', parts: swatchPanelParts, owned: [] },
  {
    id: 'ready:procreate-colors',
    name: 'Procreate Colors',
    parts: [
      part('pair', 'color:pair', 0, 0, 2, 1),
      part('hex', 'color:hex', 2, 0, 3, 1),
      part('square', 'color:wheel', 0, 1, 5, 4, 'square'),
      part('hue', 'value:hue', 0, 5, 5, 1),
      part('saturation', 'value:saturation', 0, 6, 5, 1),
      part('brightness', 'value:brightness', 0, 7, 5, 1),
      part('history', 'color:history', 0, 8, 5, 1),
      part('palette', 'color:palette', 0, 9, 5, 2),
      part('mixing', 'action:mixing', 0, 11, 5, 1)
    ],
    owned: []
  },
  {
    id: 'ready:oklch-wheel',
    name: 'OKLCH wheel',
    parts: [
      part('disk', 'color:wheel', 0, 0, 5, 5, 'wheel'),
      part('lightness', 'value:lightness', 0, 5, 5, 1),
      part('harmony', 'color:harmony', 0, 6, 5, 1),
      part('mask', 'color:mask', 0, 7, 5, 1)
    ],
    owned: []
  },
  {
    id: 'ready:desktop-color',
    name: 'Desktop color',
    parts: [
      part('pair', 'color:pair', 0, 0, 4, 1),
      part('hex', 'color:hex', 4, 0, 2, 1),
      part('triangle', 'color:wheel', 0, 1, 6, 6, 'triangle'),
      part('hue', 'value:hue', 0, 7, 2, 1, 'number'),
      part('saturation', 'value:saturation', 2, 7, 2, 1, 'number'),
      part('brightness', 'value:brightness', 4, 7, 2, 1, 'number'),
      part('history', 'color:history', 0, 8, 6, 1)
    ],
    owned: []
  }
];

const kitSchema = z.looseObject({
  id: z.string(),
  name: z.string(),
  parts: z.array(storedPart),
  owned: z.array(
    z.looseObject({
      owner: z.string(),
      parts: z.array(storedPart),
      offset: z.looseObject({ column: z.number().int(), row: z.number().int() }).optional()
    })
  )
});

/** Migrates every kit and its owned panels with the same part migrations as the board. */
function read(data: unknown, version: number): Kit[] {
  return z
    .array(z.unknown())
    .parse(data)
    .map((record) => {
      const parsed = kitSchema.safeParse(record);

      if (!parsed.success) {
        const fields = record !== null && typeof record === 'object' ? record : {};

        return {
          id: 'id' in fields && typeof fields.id === 'string' ? fields.id : newId('missing-kit'),
          name: 'name' in fields && typeof fields.name === 'string' ? fields.name : 'Missing kit',
          parts: [],
          owned: [],
          [opaqueData]: record
        };
      }

      const kit = parsed.data;
      const added: Kit['owned'] = [];
      const migrate = (parts: Part[]) =>
        parts.map((part) => {
          const result = migratePart(part, version);
          added.push(...result.owned);
          return result.part;
        });
      const parts = migrate(kit.parts);
      const owned = kit.owned.map((entry) => ({ ...entry, parts: migrate(entry.parts) }));

      return { ...kit, parts, owned: [...owned, ...added] };
    });
}
