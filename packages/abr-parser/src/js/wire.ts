/** Private lossless descriptor model, with the same extension representation as the Rust backend. */
export type Id = { FourCc: number[] } | { String: { bytes: Uint8Array } };
export type Unicode = { units: number[] };
export type Class = { name: Unicode; id: Id };
export type ObjectValue = { class: Class; entries: Entry[] };
export type Entry = { key: Id; value: Value };
export type Value =
  | { Boolean: number }
  | { Integer: number }
  | { Unsigned: number }
  | { LargeInteger: bigint }
  | { LargeUnsigned: bigint }
  | { Double: number }
  | { Unit: { unit: number[]; value: number } }
  | { Text: Unicode }
  | { Enumeration: { type_id: Id; value: Id } }
  | { Object: ObjectValue }
  | { GlobalObject: ObjectValue }
  | { Class: Class }
  | { GlobalClass: Class }
  | { List: { values: Value[] } }
  | { Booleans: { values: number[] } }
  | { Integers: { values: number[] } }
  | { UnitFloats: { unit: number[]; values: number[] } }
  | { ObjectArray: { object_count: number; columns: ObjectValue } }
  | { Data: { bytes: Uint8Array } }
  | { Alias: { bytes: Uint8Array } }
  | { Path: { bytes: Uint8Array } }
  | { Reference: { values: unknown[] } };
export type DescriptorInfo = { section: number; key: number[]; descriptor: { version: number; object: ObjectValue } };
export type PlaneInfo = { slot: number; bounds: [number, number, number, number]; depth: number };
export type ResourceInfo = {
  kind: 'sample' | 'pattern';
  section: number;
  index: number;
  id: Uint8Array;
  name?: number[];
  colorMode: number;
  colorChannels?: number;
  planes: PlaneInfo[];
};
export type Snapshot = {
  version: number;
  sampleLayout: number;
  descriptors: DescriptorInfo[];
  resources: ResourceInfo[];
};
export type DecodedPlane = { info: PlaneInfo; raw: boolean; data: Uint8Array };

/** Lossless byte spelling, unlike UTF-8 decoding with replacement. */
export function byteString(bytes: ArrayLike<number>): string {
  let out = '';
  for (let i = 0; i < bytes.length; i++) out += String.fromCharCode(bytes[i] ?? 0);
  return out;
}
export function idText(id: Id): string {
  return byteString('FourCc' in id ? id.FourCc : id.String.bytes);
}
export function unicodeText(value: Unicode): string {
  const end = value.units.at(-1) === 0 ? value.units.length - 1 : value.units.length;
  let text = '';
  for (let i = 0; i < end; i += 4096) text += String.fromCharCode(...value.units.slice(i, Math.min(i + 4096, end)));
  return text.replace(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g, '\uFFFD');
}
export function unicode(text: string): Unicode {
  if (text.length >= 1_000_000) throw new Error('Unicode unit count limit');
  text = text.replace(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g, '\uFFFD');
  return { units: [...Array(text.length).keys()].map((i) => text.charCodeAt(i)).concat(0) };
}
export function identifier(key: string): Id {
  if (!key.length || key.length > 1_000_000 || [...key].some((c) => c.charCodeAt(0) > 255))
    throw new Error('Identifier must be nonempty Latin-1');
  const bytes = Uint8Array.from(key, (c) => c.charCodeAt(0));
  return key.length === 4 && key !== 'flow' ? { FourCc: [...bytes] } : { String: { bytes } };
}
