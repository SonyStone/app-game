import { z } from 'zod';
import { maxSpan, newId, partData, type Part } from './board';
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
  return {
    id: 'id' in fields && typeof fields.id === 'string' ? fields.id : newId('missing'),
    kind: 'kind' in fields && typeof fields.kind === 'string' ? fields.kind : 'unknown',
    cell: cell.success ? cell.data : { column: 0, row: 0 },
    span: span.success ? clampSpan(span.data) : { columns: 1, rows: 1 },
    [partData]: { record, invalid: true }
  };
});

/**
 * Reads legacy data as version 1 and writes versioned envelopes. A hard failure is backed up before defaults
 * may replace it. If the backup cannot be written, edits remain in memory without overwriting the damaged data.
 */
export function createPartStorage<T>(
  key: string,
  field: 'board' | 'kits',
  fallback: T,
  parse: (data: unknown, version: number) => T
) {
  let writable = true;
  let version = 2;
  const read = (): T => {
    let raw: string | null = null;
    try {
      raw = localStorage.getItem(key);
      if (raw === null) {
        return fallback;
      }

      const data: unknown = JSON.parse(raw);
      if (data !== null && typeof data === 'object' && 'version' in data) {
        const envelope = z.looseObject({ version: z.number().int().min(1) }).parse(data);
        version = Math.max(2, envelope.version);
        return parse(envelope[field], envelope.version);
      }

      return parse(data, 1);
    } catch {
      if (raw !== null) {
        try {
          localStorage.setItem(`${key}.broken-${Date.now()}`, raw);
        } catch {
          writable = false;
        }
      } else {
        writable = false;
      }

      return fallback;
    }
  };
  const initial = read();
  return {
    initial,
    /** Stores edits, preserving unknown fields and opaque part records. Storage failures leave edits in memory. */
    write(value: T) {
      if (!writable) {
        return;
      }

      try {
        localStorage.setItem(key, JSON.stringify({ version, [field]: value }, preservePart));
      } catch {
        // The caller's in-memory state still applies.
      }
    }
  };
}

/** Applies the shared part migrations, returning any panels the migrated part owns. */
export function migratePart(part: Part, version: number) {
  let current = part;
  const owned: { owner: string; parts: Part[] }[] = [];
  if (!part[partData]?.invalid) {
    for (const migration of migrations) {
      if (version < migration.version) {
        const result = migration.run(current);
        current = result.part;
        owned.push(...result.owned);
      }
    }
  }

  return { part: current, owned };
}

const cellSchema = z.object({ column: z.number().int(), row: z.number().int() });
const spanSchema = z.object({ columns: z.number().int().min(1), rows: z.number().int().min(1) });
const partSchema = z.looseObject({
  id: z.string(),
  kind: z.string(),
  cell: cellSchema,
  span: spanSchema,
  looks: z.record(z.string(), z.string()).optional()
});

function clampSpan(span: Part['span']) {
  return { columns: Math.min(maxSpan, span.columns), rows: Math.min(maxSpan, span.rows) };
}

/** Keeps malformed fields verbatim; valid identity and layout fields can still be moved or copied. */
function preservePart(_key: string, value: unknown): unknown {
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
    ...('id' in record && typeof record.id === 'string' ? { id: part.id } : {}),
    ...('cell' in record && cellSchema.safeParse(record.cell).success ? { cell: part.cell } : {}),
    ...('span' in record && spanSchema.safeParse(record.span).success ? { span: part.span } : {})
  };
}

/** Version 2 split the old color tile into a picker or a swatch with its own default panel. */
const migrations = [
  {
    version: 2,
    run(part: Part): { part: Part; owned: { owner: string; parts: Part[] }[] } {
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
  }
];

const wheelIds = new Set(['disc', 'triangle', 'wheel', 'coolorus']);
