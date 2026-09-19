import type { Extension, ReadableObject } from '../types.js';
import { classNames, schema, type FieldRule } from './schema.js';
import {
  byteString,
  idText,
  identifier,
  unicode,
  unicodeText,
  type Entry,
  type ObjectValue,
  type Value
} from './wire.js';

/** A readable projection plus an exact source-entry mapping implicit in the original object. */
export function projectObject(object: ObjectValue, context: string): ReadableObject {
  const output: ReadableObject & Record<string, unknown> = { kind: className(idText(object.class.id)) };
  const extensions: Extension[] = [];
  const counts = new Map<string, number>();
  for (const entry of object.entries) counts.set(idText(entry.key), (counts.get(idText(entry.key)) ?? 0) + 1);
  for (const entry of object.entries) {
    const key = idText(entry.key),
      rules = contextRules(context);
    const rule = Object.hasOwn(rules, key) ? rules[key] : undefined;
    let reason = !rule ? 'unknown-key' : counts.get(key) !== 1 ? 'ambiguous-key' : undefined;
    if (!reason && rule) {
      const projected = projectValue(entry.value, rule, childContext(context, key));
      if (projected !== unsupported) {
        output[rule.name] = projected;
        continue;
      }
      reason = 'unexpected-type-or-unit';
    }
    extensions.push({
      key: { kind: 'FourCc' in entry.key ? 'fourCC' : 'string', value: key },
      value: copyPortable(entry.value),
      reason: reason ?? 'unmapped'
    });
  }

  // All fields come from the generated schema; kind is assigned above, never from input keys.
  return extensions.length ? { ...output, extensions } : output;
}

/** Applies supported edits to a fresh object, leaving the source and unknown bytes untouched. */
export function applyObject(
  object: ObjectValue,
  edited: unknown,
  context: string,
  reconstruct = false,
  depth = 0
): ObjectValue {
  if (depth > 60) throw new Error('Readable object nesting limit');
  const input = record(edited);
  let source = object;
  if (reconstruct && input.kind !== className(idText(object.class.id))) {
    const parent = context.slice(0, context.lastIndexOf('.')),
      key = context.slice(context.lastIndexOf('.') + 1);
    const rule = contextRules(context.includes('.') ? parent : '')[key];
    const classes = rule?.classes.filter((c) => className(c) === input.kind) ?? [];
    if (classes.length !== 1) throw new Error('Unsupported replacement class');
    source = { ...object, class: { ...object.class, id: identifier(classes[0]!) } };
  }
  const baseline = record(projectObject(source, context));
  if (!equal(input.kind, baseline.kind)) throw new Error('Changing kind is unsupported');
  if (!equal(input.extensions, baseline.extensions)) throw new Error('Preserved extensions are read-only');
  const available = new Map(Object.values(contextRules(context)).map((rule) => [rule.name, rule]));
  for (const key of Object.keys(input)) {
    if (['kind', 'extensions'].includes(key) || (depth === 0 && key === 'sourceId')) continue;
    if (!available.has(key)) throw new Error(`Unknown readable field ${context}.${key}`);
    if (input[key] === undefined) throw new Error('Explicit undefined is unsupported; delete the field');
  }
  const entries = [...source.entries],
    removed = new Set<number>();
  for (const [name, rule] of available) {
    const old = Object.hasOwn(baseline, name),
      next = Object.hasOwn(input, name);
    if (old === next && equal(input[name], baseline[name])) continue;
    const i = source.entries.findIndex((e) => idText(e.key) === rule.key);
    if (!old && i >= 0) throw new Error(`Cannot edit ambiguous or nonconforming ${name}`);
    if (!next) {
      if (i >= 0) removed.add(i);
      continue;
    }
    if (i < 0) {
      entries.push(createEntry(rule, input[name], context, depth));
      continue;
    }
    const entry = source.entries[i]!,
      value = entry.value;
    const updated: Value =
      'Object' in value
        ? { Object: applyObject(value.Object, input[name], childContext(context, rule.key), reconstruct, depth + 1) }
        : 'GlobalObject' in value
          ? {
              GlobalObject: applyObject(
                value.GlobalObject,
                input[name],
                childContext(context, rule.key),
                reconstruct,
                depth + 1
              )
            }
          : encodeValue(input[name], value, rule);
    entries[i] = { ...entry, value: updated };
  }
  return { ...source, entries: entries.filter((_, i) => !removed.has(i)) };
}

/** Structural equality for portable values, retaining signed zero and BigInt semantics. */
export function equal(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (a instanceof Uint8Array && b instanceof Uint8Array) return a.length === b.length && a.every((v, i) => v === b[i]);
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
      if (Object.hasOwn(a, i) !== Object.hasOwn(b, i) || !equal(a[i], b[i])) return false;
    }
    return true;
  }
  if (a && b && typeof a === 'object' && typeof b === 'object') {
    const x = record(a),
      y = record(b),
      keys = Object.keys(x);
    return keys.length === Object.keys(y).length && keys.every((k) => Object.hasOwn(y, k) && equal(x[k], y[k]));
  }
  return false;
}

export function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value) || ArrayBuffer.isView(value))
    throw new TypeError('Expected a plain object');
  return value as Record<string, unknown>;
}
function required<T>(value: T | undefined): T {
  if (value === undefined) throw new Error('Missing mapped entry');
  return value;
}
function childContext(context: string, key: string): string {
  return context ? `${context}.${key}` : key;
}
const unsupported = Symbol('unsupported');
const tags: Record<string, string> = {
  Boolean: 'bool',
  Integer: 'long',
  Unsigned: 'magn',
  LargeInteger: 'comp',
  LargeUnsigned: 'ucom',
  Double: 'doub',
  Unit: 'UntF',
  Text: 'TEXT',
  Enumeration: 'enum',
  Object: 'Objc',
  GlobalObject: 'GlbO',
  Class: 'type',
  GlobalClass: 'GlbC',
  List: 'VlLs',
  Data: 'tdta',
  Alias: 'alis',
  Path: 'Pth ',
  ObjectArray: 'ObAr',
  Booleans: 'BlAr',
  Integers: 'InAr',
  UnitFloats: 'UnFl',
  Reference: 'obj '
};
function projectValue(value: Value, rule: FieldRule, context: string): unknown {
  const variant = Object.keys(value)[0];
  if (!variant || !rule.types.includes(tags[variant] ?? '')) return unsupported;
  if ('Object' in value) return projectObject(value.Object, context);
  if ('GlobalObject' in value) return projectObject(value.GlobalObject, context);
  if ('Unit' in value)
    return rule.units.includes(byteString(value.Unit.unit)) && Number.isFinite(value.Unit.value)
      ? value.Unit.value
      : unsupported;
  if ('Text' in value) return unicodeText(value.Text);
  if ('Boolean' in value) return value.Boolean !== 0;
  if ('Integer' in value) return value.Integer;
  if ('Unsigned' in value) return value.Unsigned;
  if ('Double' in value) return value.Double;
  if ('LargeInteger' in value) return value.LargeInteger;
  if ('LargeUnsigned' in value) return value.LargeUnsigned;
  if ('Enumeration' in value)
    return { domain: idText(value.Enumeration.type_id), value: idText(value.Enumeration.value) };
  if ('Data' in value) return value.Data.bytes.slice();
  return unsupported;
}
function encodeValue(input: unknown, original: Value, rule: FieldRule): Value {
  if ('Boolean' in original) {
    if (typeof input !== 'boolean') throw new TypeError(`${rule.name} must be boolean`);
    return { Boolean: Number(input) };
  }
  if ('Text' in original) {
    if (typeof input !== 'string') throw new TypeError(`${rule.name} must be a string`);
    return { Text: unicode(input) };
  }
  if ('Unit' in original || 'Double' in original || 'Integer' in original || 'Unsigned' in original) {
    const n = numeric(input, rule);
    if ('Unit' in original) return { Unit: { ...original.Unit, value: n } };
    if ('Double' in original) return { Double: n };
    if (!Number.isInteger(n)) throw new RangeError(`${rule.name} requires an integer`);
    if ('Integer' in original) {
      if (n < -2147483648 || n > 2147483647) throw new RangeError('i32 overflow');
      return { Integer: n };
    }
    if (n < 0 || n > 4294967295) throw new RangeError('u32 overflow');
    return { Unsigned: n };
  }
  if ('LargeInteger' in original || 'LargeUnsigned' in original) {
    if (typeof input !== 'bigint') throw new TypeError('64-bit value requires BigInt');
    const signed = 'LargeInteger' in original;
    if (input < (signed ? -(1n << 63n) : 0n) || input >= (signed ? 1n << 63n : 1n << 64n))
      throw new RangeError('64-bit integer overflow');
    return 'LargeInteger' in original ? { LargeInteger: input } : { LargeUnsigned: input };
  }
  if ('Enumeration' in original) {
    const v = record(input);
    if (
      Object.keys(v).some((k) => k !== 'domain' && k !== 'value') ||
      v.domain !== idText(original.Enumeration.type_id) ||
      typeof v.value !== 'string'
    )
      throw new TypeError('Enumeration domain must remain unchanged');
    if (!v.value.length || [...v.value].some((c) => c.charCodeAt(0) > 255))
      throw new TypeError('Enumeration identifiers must contain nonempty byte characters');
    const previous = original.Enumeration.value;
    if ('FourCc' in previous && v.value.length !== 4) throw new Error('FourCC enumeration requires four bytes');
    const bytes = Uint8Array.from(v.value, (c) => c.charCodeAt(0));
    return {
      Enumeration: {
        type_id: original.Enumeration.type_id,
        value: 'FourCc' in previous ? { FourCc: [...bytes] } : { String: { bytes } }
      }
    };
  }
  if ('Data' in original) {
    if (!(input instanceof Uint8Array)) throw new TypeError(`${rule.name} requires Uint8Array`);
    return { Data: { bytes: input } };
  }
  throw new Error(`Unsupported readable edit for ${rule.name}`);
}
function numeric(input: unknown, rule: FieldRule): number {
  if (typeof input !== 'number' || !Number.isFinite(input))
    throw new TypeError(`${rule.name} requires a finite number`);
  const ranges: Record<string, [number, number]> = {
    hardness: [0, 100],
    roundness: [0, 100],
    diameter: [1, 5000],
    spacing: [1, 1000]
  };
  const range = ranges[rule.name];
  if (range && (input < range[0] || input > range[1]))
    throw new RangeError(`${rule.name} outside ${range[0]}..${range[1]}`);
  return input;
}
function createEntry(rule: FieldRule, input: unknown, context: string, depth: number): Entry {
  if (depth > 60) throw new Error('Nesting limit');
  const canonical =
    ['', 'dualBrush'].includes(context) && rule.key === 'Cnt '
      ? 'long'
      : (context === 'toolOptions' && ['wetness', 'dryness', 'mix'].includes(rule.key)) ||
          (['toolOptions.FrgC', 'toolOptions.BckC'].includes(context) && ['Rd  ', 'Grn ', 'Bl  '].includes(rule.key))
        ? 'doub'
        : undefined;
  if (!canonical && rule.types.length !== 1) throw new Error(`New ${rule.name} needs an explicit wire type`);
  let original: Value;
  switch (canonical ?? rule.types[0]) {
    case 'enum': {
      const v = record(input);
      if (Object.keys(v).length !== 2 || typeof v.domain !== 'string' || typeof v.value !== 'string')
        throw new Error('Enumeration requires domain and value');
      original = { Enumeration: { type_id: identifier(v.domain), value: identifier(v.value) } };
      break;
    }
    case 'bool':
      original = { Boolean: 0 };
      break;
    case 'long':
      original = { Integer: 0 };
      break;
    case 'doub':
      original = { Double: 0 };
      break;
    case 'TEXT':
      original = { Text: unicode('') };
      break;
    case 'tdta':
      original = { Data: { bytes: new Uint8Array() } };
      break;
    case 'UntF': {
      if (rule.units.length !== 1) throw new Error('Ambiguous unit for a new field');
      original = { Unit: { unit: [...required(rule.units[0])].map((c) => c.charCodeAt(0)), value: 0 } };
      break;
    }
    case 'Objc': {
      const edited = record(input);
      const classes = rule.classes.filter((c) => className(c) === edited.kind);
      if (classes.length !== 1) throw new Error('Unsupported class for a new object');
      const object: ObjectValue = { class: { name: unicode(''), id: identifier(required(classes[0])) }, entries: [] };
      const child = childContext(context, rule.key),
        childRules = Object.values(contextRules(child));
      if (edited.extensions !== undefined) throw new Error('New objects cannot invent source extensions');
      for (const name of Object.keys(edited).sort()) {
        if (name === 'kind') continue;
        const r = childRules.find((r) => r.name === name);
        if (!r) throw new Error(`Unknown field in new object: ${name}`);
        object.entries.push(createEntry(r, edited[name], child, depth + 1));
      }
      if (required(classes[0]) === 'brVr' && (!Object.hasOwn(edited, 'control') || !Object.hasOwn(edited, 'fadeSteps')))
        throw new Error('Dynamics requires control and fadeSteps');
      return { key: identifier(rule.key), value: { Object: object } };
    }
    default:
      throw new Error(`Cannot infer a new ${rule.name}`);
  }
  return { key: identifier(rule.key), value: encodeValue(input, original, rule) };
}

function contextRules(context: string): Readonly<Record<string, FieldRule>> {
  return Object.hasOwn(schema, context) ? (schema[context] ?? {}) : {};
}
function className(id: string): string {
  return Object.hasOwn(classNames, id) ? (classNames[id] ?? id) : id;
}

/** Copies only exposed extension payloads, so they cannot alias input or source bytes. */
export function copyPortable<T>(value: T): T {
  if (value instanceof Uint8Array) return value.slice() as T;
  if (Array.isArray(value)) return value.map(copyPortable) as T;
  if (value && typeof value === 'object')
    return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, copyPortable(child)])) as T;
  return value;
}
