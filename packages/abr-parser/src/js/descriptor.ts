import { Reader, Writer } from './binary.js';
import { byteString, type Class, type Id, type ObjectValue, type Unicode, type Value } from './wire.js';

/** Reads the complete 22-tag version-16 grammar while retaining exact scalar bytes. */
export function readDescriptor(bytes: Uint8Array): { version: number; object: ObjectValue } {
  const r = new Reader(bytes);
  const version = r.u32();
  if (version !== 16) throw new Error('Unsupported descriptor version');
  const object = readObject(r, 0);
  r.end();
  return { version, object };
}
/** Recomputes only framing; untouched scalar NaN payloads and original ID encodings survive. */
export function writeDescriptor(object: ObjectValue): Uint8Array {
  const w = new Writer();
  w.u32(16);
  writeObject(w, object, 0);
  return w.finish();
}
/** Exact code units, including malformed UTF-16 and terminal NULs. */
export function readUnicode(r: Reader): Unicode {
  return { units: Array.from({ length: r.count() }, () => r.u16()) };
}
function readId(r: Reader): Id {
  const n = r.u32();
  if (n > 1_000_000) throw new Error('Identifier limit');
  return n ? { String: { bytes: r.take(n) } } : { FourCc: [...r.take(4)] };
}
function readClass(r: Reader): Class {
  return { name: readUnicode(r), id: readId(r) };
}
function readObject(r: Reader, depth: number): ObjectValue {
  limit(depth);
  const cls = readClass(r);
  const entries = Array.from({ length: r.count() }, () => ({ key: readId(r), value: readValue(r, depth) }));
  return { class: cls, entries };
}
function readValue(r: Reader, depth: number): Value {
  limit(depth);
  const start = r.at,
    tag = byteString(r.take(4));
  let value: Value;
  switch (tag) {
    case 'bool':
      value = { Boolean: r.u8() };
      break;
    case 'long':
      value = { Integer: r.i32() };
      break;
    case 'magn':
      value = { Unsigned: r.u32() };
      break;
    case 'comp':
      value = { LargeInteger: r.i64() };
      break;
    case 'ucom':
      value = { LargeUnsigned: r.u64() };
      break;
    case 'doub':
      value = { Double: r.f64() };
      break;
    case 'UntF':
      value = { Unit: { unit: [...r.take(4)], value: r.f64() } };
      break;
    case 'TEXT':
      value = { Text: readUnicode(r) };
      break;
    case 'enum':
      value = { Enumeration: { type_id: readId(r), value: readId(r) } };
      break;
    case 'Objc':
      value = { Object: readObject(r, depth + 1) };
      break;
    case 'GlbO':
      value = { GlobalObject: readObject(r, depth + 1) };
      break;
    case 'type':
      value = { Class: readClass(r) };
      break;
    case 'GlbC':
      value = { GlobalClass: readClass(r) };
      break;
    case 'VlLs':
      value = { List: { values: Array.from({ length: r.count() }, () => readValue(r, depth + 1)) } };
      break;
    case 'BlAr':
      value = { Booleans: { values: [...r.take(r.count())] } };
      break;
    case 'InAr':
      value = { Integers: { values: Array.from({ length: r.count() }, () => r.i32()) } };
      break;
    case 'UnFl':
      value = { UnitFloats: { unit: [...r.take(4)], values: Array.from({ length: r.count() }, () => r.f64()) } };
      break;
    case 'ObAr':
      value = { ObjectArray: { object_count: r.u32(), columns: readObject(r, depth + 1) } };
      break;
    case 'tdta':
      value = { Data: { bytes: r.blob() } };
      break;
    case 'alis':
      value = { Alias: { bytes: r.blob() } };
      break;
    case 'Pth ':
      value = { Path: { bytes: r.blob() } };
      break;
    case 'obj ':
      value = { Reference: { values: Array.from({ length: r.count() }, () => readReference(r)) } };
      break;
    default:
      throw new Error(`Unsupported descriptor tag ${tag}`);
  }
  if (!['Objc', 'GlbO', 'VlLs', 'ObAr'].includes(tag)) rawValues.set(value, r.bytes.subarray(start, r.at));
  return value;
}
function readReference(r: Reader): unknown {
  const tag = byteString(r.take(4)),
    cls = readClass(r);
  switch (tag) {
    case 'Clss':
      return { Class: { class: cls } };
    case 'Enmr':
      return { Enumerated: { class: cls, value: { type_id: readId(r), value: readId(r) } } };
    case 'Idnt':
      return { Identifier: { class: cls, value: r.u32() } };
    case 'indx':
      return { Index: { class: cls, value: r.i32() } };
    case 'name':
      return { Name: { class: cls, value: readUnicode(r) } };
    case 'prop':
      return { Property: { class: cls, value: readId(r) } };
    case 'rele':
      return { Relative: { class: cls, value: r.i32() } };
    default:
      throw new Error(`Unknown reference ${tag}`);
  }
}
function writeUnicode(w: Writer, v: Unicode): void {
  countLimit(v.units.length);
  w.u32(v.units.length);
  for (const n of v.units) w.u16(n);
}
function writeId(w: Writer, v: Id): void {
  if ('FourCc' in v) {
    w.u32(0);
    w.bytes(Uint8Array.from(v.FourCc));
  } else {
    if (!v.String.bytes.length) throw new Error('Empty string identifier');
    countLimit(v.String.bytes.length);
    w.blob(v.String.bytes);
  }
}
function writeClass(w: Writer, v: Class): void {
  writeUnicode(w, v.name);
  writeId(w, v.id);
}
function writeObject(w: Writer, v: ObjectValue, depth: number): void {
  limit(depth);
  writeClass(w, v.class);
  countLimit(v.entries.length);
  w.u32(v.entries.length);
  for (const e of v.entries) {
    writeId(w, e.key);
    writeValue(w, e.value, depth);
  }
}
function writeValue(w: Writer, v: Value, depth: number): void {
  limit(depth);
  const raw = rawValues.get(v);
  if (raw) {
    w.bytes(raw);
    return;
  }
  const emit = (tag: string, fn: () => void) => {
    w.text(tag);
    fn();
  };
  if ('Object' in v) return emit('Objc', () => writeObject(w, v.Object, depth + 1));
  if ('GlobalObject' in v) return emit('GlbO', () => writeObject(w, v.GlobalObject, depth + 1));
  if ('List' in v)
    return emit('VlLs', () => {
      countLimit(v.List.values.length);
      w.u32(v.List.values.length);
      v.List.values.forEach((x) => writeValue(w, x, depth + 1));
    });
  if ('ObjectArray' in v)
    return emit('ObAr', () => {
      w.u32(v.ObjectArray.object_count);
      writeObject(w, v.ObjectArray.columns, depth + 1);
    });
  if ('Boolean' in v) return emit('bool', () => w.u8(v.Boolean));
  if ('Integer' in v) return emit('long', () => w.i32(v.Integer));
  if ('Unsigned' in v) return emit('magn', () => w.u32(v.Unsigned));
  if ('LargeInteger' in v) return emit('comp', () => w.i64(v.LargeInteger));
  if ('LargeUnsigned' in v) return emit('ucom', () => w.u64(v.LargeUnsigned));
  if ('Double' in v) return emit('doub', () => w.f64(v.Double));
  if ('Unit' in v)
    return emit('UntF', () => {
      w.bytes(Uint8Array.from(v.Unit.unit));
      w.f64(v.Unit.value);
    });
  if ('Text' in v) return emit('TEXT', () => writeUnicode(w, v.Text));
  if ('Enumeration' in v)
    return emit('enum', () => {
      writeId(w, v.Enumeration.type_id);
      writeId(w, v.Enumeration.value);
    });
  if ('Data' in v) return emit('tdta', () => w.blob(v.Data.bytes));
  throw new Error('Cannot construct an unsupported descriptor value');
}
function limit(depth: number): void {
  if (depth >= 64) throw new Error('Descriptor recursion limit');
}
const rawValues = new WeakMap<Value, Uint8Array>();

function countLimit(count: number): void {
  if (count > 1_000_000) throw new Error('Element count limit');
}
