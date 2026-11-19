import { findNodeAtLocation, parseTree, type Node, type ParseError } from 'jsonc-parser';
import { z } from 'zod';

/** Frozen version-one defaults. Absent colour hints use the host colours. Optional effects are disabled. */
export const versionOneDefaults = Object.freeze({
  placement: Object.freeze({ law: 'paint-distance-v1', spacing: 0.12 }),
  size: 32,
  flow: 1,
  opacity: 1,
  mixing: 'linear',
  smoothing: 'none',
  normal: 1,
  smooth: 10,
  stabilizer: 6,
  catchUp: true,
  angleDeg: 0,
  roundness: 1
} as const);

const name = z.string().min(1);
const pointer = z.string().regex(/^\/(?:[^~]|~[01])*$/);
const unit = z.number().min(0).max(1);
const point = z.tuple([z.number(), z.number()]);
const table = <T extends z.ZodType>(item: T) => z.record(name, item);
const tip = z.looseObject({
  kind: name,
  hardness: unit.optional(),
  roundness: unit.optional(),
  angleDeg: z.number().optional(),
  resource: name.optional()
});
const binding = z.looseObject({
  target: pointer,
  input: name,
  domain: point.refine(([a, b]) => a < b, 'Expected increasing domain'),
  curve: z
    .array(point)
    .min(2)
    .refine((points) => points.every(([x], i) => !i || x > points[i - 1]![0]), 'Expected increasing curve x'),
  op: name
});
const endpoint = z
  .looseObject({
    target: pointer,
    px: z.number().nonnegative().optional(),
    fraction: unit.optional(),
    endpointMultiplier: unit
  })
  .refine((end) => (end.px === undefined) !== (end.fraction === undefined), 'Expected px or fraction');
// These JSON payloads are opaque. Even a valid number outside IEEE-754 range stays in the source.
const payload = z.unknown().refine((value) => value !== undefined, 'Expected a JSON value');
const extension = z.looseObject({ value: payload, impact: name, resources: z.array(name).optional() });
const resource = z
  .looseObject({
    format: name,
    width: z.number().int().min(1).max(8192),
    height: z.number().int().min(1).max(8192),
    sha256: z.string().regex(/^[a-f0-9]{64}$/)
  })
  .refine(
    (ref) => ref.format !== 'r8' || ref.width * ref.height <= 32 * 1024 * 1024,
    'Decoded r8 image exceeds 32 MiB'
  );
const definition = z.looseObject({
  tool: name,
  tips: table(tip),
  sequence: z.looseObject({ order: name, tips: z.array(name).min(1) }),
  placement: z.looseObject({ law: name, spacing: z.number().positive(), overlap: name.optional() }).optional(),
  size: z.number().positive().optional(),
  transfer: z.looseObject({ flow: unit.optional(), opacity: unit.optional() }).optional(),
  dynamics: z.array(binding).optional(),
  texture: z
    .looseObject({
      resource: name,
      /** A false switch keeps the saved texture available for later edits. Defaults to true. */
      enabled: z.boolean().optional(),
      frame: name.optional(),
      scale: z.number().positive().optional(),
      depth: unit.optional(),
      blend: name.optional()
    })
    .optional(),
  dual: z
    .looseObject({
      tip: name,
      /** A false switch retains the entire secondary tip without applying it. Defaults to true. */
      enabled: z.boolean().optional(),
      size: z.number().positive().optional(),
      spacing: z.number().positive().optional(),
      blend: name.optional()
    })
    .optional(),
  stroke: z
    .looseObject({
      smoothing: name.optional(),
      normal: z.number().int().min(0).max(49).optional(),
      smooth: z.number().int().min(0).max(49).optional(),
      stabilizer: z.number().int().min(0).max(22).optional(),
      catchUp: z.boolean().optional(),
      taper: z.looseObject({ start: endpoint.optional(), end: endpoint.optional() }).optional()
    })
    .optional(),
  mixing: name.optional(),
  /** Colors the brush carries; a preset without them paints with the host's. */
  color: z.looseObject({ foreground: z.string().optional(), background: z.string().optional() }).optional(),
  /** Suggestions that never change the intended pixels, such as a preview size. */
  renderHints: z.looseObject({}).optional(),
  extensions: z
    .record(
      z
        .string()
        .regex(/^[a-zA-Z0-9_-]+(?:\.[a-zA-Z0-9_-]+)+\.v[0-9]+$/, 'Expected a namespaced versioned extension id'),
      extension
    )
    .optional()
});

/** Version-one document view. JSON text remains authoritative for edits and serialization. */
export const brushSchema = z
  .looseObject({
    id: name,
    name,
    derivedFrom: name.optional(),
    apply: z.array(pointer).optional(),
    definition,
    origin: z
      .looseObject({
        format: name,
        presetKey: name,
        importer: name,
        mappings: z.array(
          z.looseObject({
            field: name,
            value: payload,
            target: pointer,
            outcome: name,
            fallbackTarget: pointer.optional(),
            reason: name.optional()
          })
        )
      })
      .optional(),
    resources: table(resource).optional()
  })
  .superRefine((doc, ctx) => {
    const d = doc.definition;
    function issue(path: string[], message: string) {
      ctx.addIssue({ code: 'custom', path, message });
    }
    for (const key of [...d.sequence.tips, ...(d.dual ? [d.dual.tip] : [])]) {
      if (!Object.hasOwn(d.tips, key)) {
        issue(['definition', 'tips', key], 'Unresolved tip');
      }
    }
    function alias(key: string | undefined, path: string[]) {
      if (!key || !Object.hasOwn(doc.resources ?? {}, key)) {
        issue(path, 'Unresolved resource alias: ' + key);
      }
    }
    for (const [key, t] of Object.entries(d.tips)) {
      if (t.kind === 'sampled') {
        alias(t.resource, ['definition', 'tips', key, 'resource']);
      } else if (['ellipse', 'round'].includes(t.kind) && t.hardness === undefined) {
        issue(['definition', 'tips', key, 'hardness'], 'Expected hardness');
      }
    }
    if (d.texture) {
      alias(d.texture.resource, ['definition', 'texture', 'resource']);
    }
    for (const [key, ext] of Object.entries(d.extensions ?? {})) {
      for (const ref of ext.resources ?? []) {
        alias(ref, ['definition', 'extensions', key, 'resources']);
      }
    }
  });

/** Validated typed view of a brush, including extensible sections. */
export type BrushDocument = z.infer<typeof brushSchema>;

const version = z.tuple([z.number().int().nonnegative(), z.number().int().nonnegative()]);
export const envelopeSchema = z.looseObject({ format: z.literal('paintbrush'), version, minReader: version });
export const manifestSchema = envelopeSchema.extend({
  id: name.optional(),
  name: name.optional(),
  brushes: z
    .array(
      z.looseObject({
        file: z.string().regex(/^brushes\/[A-Za-z0-9_-][A-Za-z0-9._-]*\.json$/),
        folder: name.optional()
      })
    )
    .min(1)
    .max(1024)
});

/** Strict JSON, including unique decoded object keys. Preserve original text alongside this view. */
export function parseDocument<T extends z.ZodType>(source: string, schema: T): z.output<T> {
  tree(source);
  return schema.parse(JSON.parse(source));
}

/** Replaces or inserts a value at a JSON Pointer without serializing any untouched sibling. */
export function patch(source: string, path: string, value: unknown): string {
  if (!pointer.safeParse(path).success) {
    throw new Error('Invalid JSON pointer: ' + path);
  }
  const keys = path
    .slice(1)
    .split('/')
    .map((key) => key.replace(/~1/g, '/').replace(/~0/g, '~'));
  const replacement = JSON.stringify(value, (_key, item) => {
    if (typeof item === 'number' && !Number.isFinite(item)) {
      throw new Error('Expected a finite replacement number');
    }
    return item;
  });
  if (replacement === undefined) {
    throw new Error('Expected a JSON replacement value');
  }
  let node = tree(source);
  for (const [index, key] of keys.entries()) {
    const child = findNodeAtLocation(node, [node.type === 'array' && /^(0|[1-9]\d*)$/.test(key) ? Number(key) : key]);
    if (!child && index === keys.length - 1 && node.type === 'object') {
      const end = node.offset + node.length - 1;
      return (
        source.slice(0, end) +
        (node.children?.length ? ',' : '') +
        JSON.stringify(key) +
        ':' +
        replacement +
        source.slice(end)
      );
    }
    if (!child) {
      throw new Error('Unresolved patch path: ' + path);
    }
    node = child;
  }
  return source.slice(0, node.offset) + replacement + source.slice(node.offset + node.length);
}

function tree(source: string) {
  const errors: ParseError[] = [];
  const root = parseTree(source, errors, { disallowComments: true, allowTrailingComma: false });
  if (!root || errors.length) {
    throw new Error('Invalid JSON at offset ' + (errors[0]?.offset ?? 0));
  }
  function visit(node: Node) {
    if (node.type === 'object') {
      const keys = new Set<string>();
      for (const property of node.children ?? []) {
        const key = property.children![0]!.value as string;
        if (keys.has(key)) {
          throw new Error('Duplicate JSON key: ' + key);
        }
        keys.add(key);
        visit(property.children![1]!);
      }
    } else if (node.type === 'array') {
      node.children?.forEach(visit);
    }
  }
  visit(root);
  return root;
}

/** Keeps a single manifest entry, including the exact spellings of its unknown fields. */
export function singleManifest(source: string) {
  const root = tree(source);
  const list = findNodeAtLocation(root, ['brushes'])!;
  return (index: number) => {
    const item = list.children![index]!;
    return (
      source.slice(0, list.offset) +
      '[' +
      source.slice(item.offset, item.offset + item.length) +
      ']' +
      source.slice(list.offset + list.length)
    );
  };
}

/** Rebuilds a list using source slices for retained items. New items are serialized once. */
export function patchList(source: string, path: string[], items: readonly ({ keep: number } | { add: unknown })[]) {
  const list = findNodeAtLocation(tree(source), path);
  if (list?.type !== 'array') {
    throw new Error('Expected an array at ' + path.join('/'));
  }
  const values = items.map((item) => {
    if ('add' in item) {
      return JSON.stringify(item.add);
    }
    const node = list.children?.[item.keep];
    if (!node) {
      throw new Error('Missing array item: ' + item.keep);
    }
    return source.slice(node.offset, node.offset + node.length);
  });
  return source.slice(0, list.offset) + '[' + values.join(',') + ']' + source.slice(list.offset + list.length);
}
