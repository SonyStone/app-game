import { onSettled } from 'solid-js';
import { z } from 'zod';
import { maxSpan, newId, partData, placeBlock, type Panel, type Part } from './board';
import { layersKit } from './layersKit';
import { swatchPanelParts } from './swatchPanelParts';

/** Reads parts independently, retaining malformed records behind safe layout fields. */
export const storedPart = z.unknown().transform((record): Part => {
  const parsed = partSchema.safeParse(record);

  if (parsed.success) {
    return { ...parsed.data, span: clampSpan(parsed.data.span), [partData]: { record, invalid: false } };
  }

  const fields = record !== null && typeof record === 'object' ? record : {};
  const cell = cellSchema.safeParse('cell' in fields ? fields.cell : undefined);
  const span = spanSchema.safeParse('span' in fields ? fields.span : undefined);
  const layout = {
    id: 'id' in fields && typeof fields.id === 'string' ? fields.id : newId('missing'),
    kind: 'kind' in fields && typeof fields.kind === 'string' ? fields.kind : 'unknown',
    cell: cell.success ? cell.data : { column: 0, row: 0 },
    span: span.success ? clampSpan(span.data) : { columns: 1, rows: 1 }
  };

  return {
    ...layout,
    [partData]: { record, invalid: true, initial: layout }
  };
});

/** Opaque collection entries are displayed with safe fields and serialized as their original record. */
export const opaqueData = Symbol('opaque stored data');

/**
 * Reads legacy data as version 1 and writes current envelopes without dropping unknown envelope fields.
 * Newer versions are read-only, even if parsing fails. Hard failures are backed up before defaults may replace
 * them. Failed reads/backups disable writes; failed writes can be retried. `onSavingError` reports each failure
 * or refused write so a dismissed notice can be shown again. Initial notices run after the owner settles; write
 * failures are reported synchronously. Edits always remain available in memory.
 */
export function createPartStorage<T>(
  key: string,
  field: 'board' | 'kits',
  fallback: T,
  parse: (data: unknown, version: number) => T,
  onSavingError?: (message: string) => void
) {
  let writable = true;
  let envelope: Record<string, unknown> = {};
  const label = field === 'board' ? 'Board' : 'Kit';
  let message = `${label} changes can't be saved on this device.`;
  const read = (): T => {
    let raw: string | null = null;

    try {
      raw = localStorage.getItem(key);

      if (raw === null) {
        return fallback;
      }

      const data: unknown = JSON.parse(raw);

      if (data !== null && typeof data === 'object' && 'version' in data) {
        const parsed = z.looseObject({ version: z.number().int().min(1) }).parse(data);
        envelope = parsed;
        const version = parsed.version;

        if (version > currentVersion) {
          writable = false;
          message = `${label} changes can't be saved because this data was saved by a newer Paint version. Open it in that version to save changes.`;
        }

        return parse(envelope[field], version);
      }

      return parse(data, 1);
    } catch {
      if (!writable) {
        return fallback;
      }

      try {
        if (raw === null) {
          throw new Error('Storage could not be read');
        }

        backup(key, raw);
      } catch {
        writable = false;
      }

      return fallback;
    }
  };
  const initial = read();

  if (!writable) {
    onSettled(() => {
      onSavingError?.(message);
    });
  }

  return {
    initial,
    /** Stores edits with opaque records intact; reports failures without discarding in-memory edits. */
    write(value: T) {
      if (!writable) {
        onSavingError?.(message);
        return;
      }

      try {
        localStorage.setItem(
          key,
          JSON.stringify({ ...envelope, version: currentVersion, [field]: value }, preserveRecord)
        );
      } catch {
        onSavingError?.(message);
      }
    }
  };
}

/** Migrates complete panel layouts, so inline replacements use the same block push rules as an edit. */
export function migrateParts(parts: Part[], version: number) {
  let current = parts;
  const owned: OwnedPanel[] = [];
  for (const migration of migrations) {
    if (version >= migration.version) {
      continue;
    }

    for (const candidate of [...current]) {
      const part = current.find((part) => part.id === candidate.id)!;
      if (part[partData]?.invalid) {
        continue;
      }

      const result = migration.run(part);
      owned.push(...result.owned);
      current = result.block
        ? placeBlock(
            current.filter((other) => other.id !== part.id),
            result.block,
            part.cell
          )
        : current.map((other) => (other.id === part.id ? result.part : other));
    }
  }

  return { parts: current, owned };
}

/** Migration output shared by board panels and kit-owned panels. */
type OwnedPanel = Pick<Panel, 'owner' | 'parts' | 'window' | 'offset'> & { owner: string };

/** Backs up each distinct raw value once, without overwriting an earlier backup from the same millisecond. */
function backup(key: string, raw: string) {
  const prefix = `${key}.broken-`;

  for (let index = 0; index < localStorage.length; index += 1) {
    const existing = localStorage.key(index);

    if (existing?.startsWith(prefix) && localStorage.getItem(existing) === raw) {
      return;
    }
  }

  const base = `${prefix}${Date.now()}`;
  let name = base;

  for (let suffix = 1; localStorage.getItem(name) !== null; suffix += 1) {
    name = `${base}-${suffix}`;
  }

  localStorage.setItem(name, raw);
}

const currentVersion = 3;

/** Window state is additive; unknown fields survive reads and subsequent edits. */
export const storedWindow = z.looseObject({
  name: z.string(),
  collapsed: z.literal(true).optional(),
  open: z.literal(true).optional(),
  placed: z.literal(true).optional()
});

const cellSchema = z.object({ column: z.number().int(), row: z.number().int() });
const spanSchema = z.object({ columns: z.number().int().min(1), rows: z.number().int().min(1) });
const partSchema = z.looseObject({
  id: z.string(),
  kind: z.string(),
  cell: cellSchema,
  span: spanSchema,
  looks: z.record(z.string(), z.string()).optional().catch(undefined)
});

function clampSpan(span: Part['span']) {
  return { columns: Math.min(maxSpan, span.columns), rows: Math.min(maxSpan, span.rows) };
}

/** Keeps opaque records intact while carrying deliberate identity and layout edits across reloads. */
function preserveRecord(_key: string, value: unknown): unknown {
  if (value && typeof value === 'object' && opaqueData in value) {
    return value[opaqueData];
  }

  const part = value as Part | null;

  if (!part || typeof part !== 'object' || !part[partData]) {
    return value;
  }

  const stored = part[partData]!;
  const record = stored.record;

  if (!stored.invalid) {
    return { ...(record as object), ...part };
  }

  if (record === null || typeof record !== 'object' || Array.isArray(record)) {
    return record;
  }

  return {
    ...record,
    ...(('id' in record && typeof record.id === 'string') || part.id !== stored.initial?.id ? { id: part.id } : {}),
    ...(('cell' in record && cellSchema.safeParse(record.cell).success) ||
    part.cell.column !== stored.initial?.cell.column ||
    part.cell.row !== stored.initial?.cell.row
      ? { cell: part.cell }
      : {}),
    ...(('span' in record && spanSchema.safeParse(record.span).success) ||
    part.span.columns !== stored.initial?.span.columns ||
    part.span.rows !== stored.initial?.span.rows
      ? { span: part.span }
      : {})
  };
}

/** Ordered migrations apply equally to board plates, kit parts, and kit-owned plates. */
const migrations: { version: number; run: (part: Part) => { part: Part; owned: OwnedPanel[]; block?: Part[] } }[] = [
  {
    version: 2,
    run(part: Part) {
      if (part.kind !== 'color') {
        return { part, owned: [] };
      }

      const wheel = Object.values(part.looks ?? {}).some((look) => wheelIds.has(look)) || part.span.columns >= 5;
      if (wheel) {
        const looks = Object.fromEntries(Object.entries(part.looks ?? {}).filter(([, look]) => wheelIds.has(look)));
        return {
          part: { ...part, kind: 'color:wheel', looks: Object.keys(looks).length > 0 ? looks : undefined },
          owned: []
        };
      }

      return {
        part: { ...part, kind: 'color:swatch', looks: undefined },
        owned: [
          { owner: part.id, parts: swatchPanelParts.map((child) => ({ ...child, id: `${part.id}-${child.id}` })) }
        ]
      };
    }
  },
  {
    version: 3,
    run(part: Part) {
      if (part.kind !== 'action:layers') {
        return { part, owned: [] };
      }

      const children = layersKit.parts.map((child) => ({ ...child, id: `${part.id}-${child.id}` }));
      const look = part.looks?.[`${part.span.columns}x${part.span.rows}`];
      const inline = look === 'panel' || (!look && part.span.columns >= 7 && part.span.rows >= 8);
      if (inline) {
        // The first replacement retains the old identity and unknown persisted fields.
        children[0] = { ...part, ...children[0]!, id: part.id };
        return { part, owned: [], block: children };
      }

      return {
        part: { ...part, looks: undefined },
        owned: [{ owner: part.id, parts: children, window: { name: layersKit.name } }]
      };
    }
  }
];

const wheelIds = new Set(['disc', 'triangle', 'wheel', 'coolorus']);
