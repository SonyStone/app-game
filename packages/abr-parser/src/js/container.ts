import { Reader, Writer } from './binary.js';
import { readDescriptor, writeDescriptor } from './descriptor.js';
import { planeInfo, readPattern, readSample, type EncodedResource } from './images.js';
import { byteString, type ObjectValue, type Snapshot } from './wire.js';

/** Sections retain their original bytes; descriptors are rebuilt only when explicitly edited. */
export interface Section {
  signature: string;
  key: string;
  payload: Uint8Array;
  padding: Uint8Array;
  object?: ObjectValue;
  resources?: EncodedResource[];
  changed?: boolean;
}
export interface Container {
  version: number;
  sampleLayout: number;
  sections: Section[];
  trailing: Uint8Array;
}
/** Bounded 6..11 framing. Major 11 uses u64 outer lengths, inner records stay u32. */
export function readContainer(bytes: Uint8Array): Container {
  const r = new Reader(bytes),
    version = r.u16(),
    sampleLayout = r.u16();
  if (version < 6 || version > 11 || ![1, 2].includes(sampleLayout)) throw new Error('Unsupported ABR header');
  const sections: Section[] = [];
  while (r.remaining >= 12) {
    if (sections.length >= 1_000_000) throw new Error('Section count limit');
    const signature = byteString(r.take(4)),
      key = byteString(r.take(4));
    const n = version === 11 ? r.u64() : BigInt(r.u32());
    if (n > BigInt(version === 11 ? Number.MAX_SAFE_INTEGER : 2147483647)) throw new Error('Section length limit');
    const payload = r.take(Number(n)),
      padding = r.take(Math.min(pad(payload.length), r.remaining));
    const section: Section = { signature, key, payload, padding };
    if (signature === '8BIM') {
      if (key === 'desc' || key === 'phry') section.object = readDescriptor(payload).object;
      else if (key === 'samp' || key === 'patt') {
        const records = new Reader(payload),
          resources: EncodedResource[] = [];
        while (records.remaining) {
          if (resources.length >= 1_000_000) throw new Error('Record count limit');
          const data = records.take(records.u32());
          resources.push(key === 'samp' ? readSample(data, sampleLayout) : readPattern(data));
          records.take(Math.min(pad(data.length), records.remaining));
        }
        section.resources = resources;
      }
    }
    sections.push(section);
  }
  return { version, sampleLayout, sections, trailing: r.take(r.remaining) };
}
/** Produces the same descriptor/resource index as the researched native implementation. */
export function snapshot(file: Container): Snapshot {
  return {
    version: file.version,
    sampleLayout: file.sampleLayout,
    descriptors: file.sections.flatMap((s, section) =>
      s.object
        ? [{ section, key: [...s.key].map((c) => c.charCodeAt(0)), descriptor: { version: 16, object: s.object } }]
        : []
    ),
    resources: file.sections.flatMap((s, section) =>
      (s.resources ?? []).map((r, index) => ({
        kind: s.key === 'samp' ? ('sample' as const) : ('pattern' as const),
        section,
        index,
        id: Uint8Array.from(r.id, (c) => c.charCodeAt(0)),
        colorMode: r.colorMode,
        planes: planeInfo(r.planes),
        ...(r.name === undefined
          ? {}
          : { name: [...Array(r.name.length).keys()].map((i) => r.name!.charCodeAt(i)).concat(0) }),
        ...(r.colorChannels === undefined ? {} : { colorChannels: r.colorChannels })
      }))
    )
  };
}
/** Writes changed descriptors while retaining unchanged payloads, padding and tails. */
export function writeContainer(file: Container): Uint8Array {
  const w = new Writer();
  w.u16(file.version);
  w.u16(file.sampleLayout);
  for (const s of file.sections) {
    const payload = s.changed && s.object ? writeDescriptor(s.object) : s.payload;
    w.text(s.signature);
    w.text(s.key);
    if (file.version === 11) w.u64(BigInt(payload.length));
    else w.u32(payload.length);
    w.bytes(payload);
    w.bytes(s.changed && s.padding.length !== pad(payload.length) ? new Uint8Array(pad(payload.length)) : s.padding);
  }
  w.bytes(file.trailing);
  return w.finish();
}
/** New descriptor sections use canonical padding; old sections retain their encoding. */
export function descriptorSection(key: string, object: ObjectValue): Section {
  const payload = writeDescriptor(object);
  return { signature: '8BIM', key, object, payload, padding: new Uint8Array(pad(payload.length)) };
}
function pad(n: number): number {
  return (4 - (n % 4)) % 4;
}
