import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import * as js from '../src/js/abr-js-runtime';
import * as wasm from '../wasm/dist/index.js';
await wasm.initAbr(readFileSync(new URL('../wasm/pkg/photoshop_abr_wasm_bg.wasm', import.meta.url)));
const fixtures = resolve(import.meta.dirname, 'fixtures/researched');

describe('interchangeable implementations', () => {
  for (const name of readdirSync(resolve(fixtures, 'containers')).filter((n) => n.endsWith('.abr')))
    it(name, () => {
      const bytes = readFileSync(resolve(fixtures, 'containers', name)),
        a = js.parseAbr(bytes),
        b = wasm.parseAbr(bytes);
      expect(a).toEqual(b);
      expect(js.writeAbr(structuredClone(b))).toEqual(new Uint8Array(bytes));
      expect(wasm.writeAbr(structuredClone(a))).toEqual(new Uint8Array(bytes));
      for (const resource of a.resources) {
        const x = js.resourceSource(a, resource),
          y = wasm.resourceSource(b, resource);
        expect(x).toEqual(y);
        expect(x.bytes.buffer.byteLength).toBe(x.bytes.length);
        let expected;
        try {
          expected = wasm.decodeResource(y);
        } catch {
          expect(() => js.decodeResource(x)).toThrow();
          continue;
        }
        expect(js.decodeResource(x)).toEqual(expected);
      }
      if (a.brushes[0]?.tip?.hardness !== undefined) {
        a.brushes[0].tip.hardness = js.percent(43);
        b.brushes[0]!.tip!.hardness = wasm.percent(43);
        const x = js.writeAbr(a),
          y = wasm.writeAbr(b);
        expect(x).toEqual(y);
        expect(wasm.parseAbr(x)).toEqual(js.parseAbr(y));
      }
    });
  for (const name of readdirSync(resolve(fixtures, 'descriptors')).filter((n) => n.endsWith('.input.bin')))
    it(name, () => {
      const data = readFileSync(resolve(fixtures, 'descriptors', name)),
        head = Buffer.alloc(16);
      head.writeUInt16BE(6);
      head.writeUInt16BE(2, 2);
      head.write('8BIMdesc', 4);
      head.writeUInt32BE(data.length, 12);
      const bytes = Buffer.concat([head, data, Buffer.alloc((4 - (data.length % 4)) % 4)]);
      expect(js.parseAbr(bytes)).toEqual(wasm.parseAbr(bytes));
      expect(js.writeAbr(wasm.parseAbr(bytes))).toEqual(new Uint8Array(bytes));
    });
  it('canonical computed authoring and composed duplicates are identical', () => {
    const input = [
      {
        name: 'New',
        tip: {
          kind: 'computed' as const,
          diameter: js.pixels(32),
          hardness: js.percent(45),
          roundness: js.percent(75),
          angle: js.degrees(-13),
          spacing: js.percent(25),
          spacingEnabled: true
        }
      }
    ];
    const a = js.createAbr(input),
      b = wasm.createAbr(input);
    expect(a).toEqual(b);
    const composition = {
      sources: [a.source],
      brushes: [
        { source: 0, preset: a.brushes[0]! },
        { source: 0, preset: a.brushes[0]! }
      ],
      hierarchy: [
        { kind: 'group' as const, name: 'Set' },
        { kind: 'preset' as const },
        { kind: 'preset' as const },
        { kind: 'groupEnd' as const }
      ]
    };
    expect(js.composeAbr(composition)).toEqual(wasm.composeAbr(composition));
  });
});

it('has identical library diagnostics and plane decoding, including zero image budget', () => {
  const bytes = readFileSync(resolve(fixtures, 'containers/samples2-depth-32.abr'));
  expect(js.readLibrary(bytes, 0)).toEqual(wasm.readLibrary(bytes, 0));
  const a = js.parseAbr(bytes),
    b = wasm.parseAbr(bytes);
  for (const resource of a.resources) {
    expect(js.sampleBytes(a, resource)).toEqual(wasm.sampleBytes(b, resource));
    for (const plane of resource.planes)
      expect(js.readPlane(a, resource, plane.slot)).toEqual(wasm.readPlane(b, resource, plane.slot));
    expect(js.readSamplePlane(js.sampleBytes(a, resource), a.sampleLayout)).toEqual(
      wasm.readSamplePlane(wasm.sampleBytes(b, resource), b.sampleLayout)
    );
  }
});

it('authors new fields and replaces classes with identical canonical ordering', () => {
  const source = js.parseAbr(readFileSync(new URL('../files/Basic_3.abr', import.meta.url)));
  source.brushes[0]!.sizeDynamics = {
    kind: 'dynamics',
    jitter: js.percent(20),
    minimum: js.percent(10),
    fadeSteps: 25,
    control: 2
  };
  source.brushes[0]!.count = 3;
  source.brushes[0]!.toolOptions = {
    kind: 'BrTl',
    flow: js.percent(44),
    foregroundColor: { kind: 'RGBC', red: 4, blue: 2, green: 6 }
  };
  expect(js.writeAbr(source)).toEqual(wasm.writeAbr(source));
  const preset = structuredClone(source.brushes[0]!);
  preset.tip!.kind = 'sampled';
  preset.tip!.sampleId = 'Missing sample';
  const composition = { sources: [source.source], brushes: [{ source: 0, preset }], hierarchy: [] };
  expect(js.composeAbr(composition)).toEqual(wasm.composeAbr(composition));
});

it('rejects the same unsupported public edits', () => {
  const original = js.parseAbr(readFileSync(new URL('../files/Basic_3.abr', import.meta.url)));
  const edits: ((document: typeof original) => void)[] = [
    (d) => {
      d.brushes.reverse();
    },
    (d) => {
      d.brushes[0]!.tip!.hardness = js.percent(101);
    },
    (d) => {
      Object.assign(d.brushes[0]!, { name: undefined });
    },
    (d) => {
      Object.assign(d.brushes[0]!, { unexpected: 3 });
    },
    (d) => {
      d.brushes[0]!.tip!.kind = 'sampled';
    },
    (d) => {
      Object.assign(d, { resources: [] });
      d.brushes.push(d.brushes[0]!);
    },
    (d) => {
      Object.assign(d.brushes[0]!, { name: new Date() });
    },
    (d) => {
      Object.assign(d.brushes[0]!, { tip: d.brushes[0] });
    }
  ];
  for (const edit of edits) {
    const d = structuredClone(original);
    edit(d);
    expect(() => js.writeAbr(d)).toThrow();
    expect(() => wasm.writeAbr(d)).toThrow();
  }
  for (const n of [-1, NaN, Infinity, 0.5, 4294967296]) {
    expect(() => js.readLibrary(original.source.bytes, n)).toThrow();
    expect(() => wasm.readLibrary(original.source.bytes, n)).toThrow();
  }
});

it('agrees on bounded, deterministic corruptions of container and descriptor framing', () => {
  for (const name of ['samples2-m8l1.abr', 'samples2-depth-32.abr', 'run2-major-11.abr', 'patterns1-indexed-0.abr']) {
    const source = readFileSync(resolve(fixtures, 'containers', name));
    for (let index = 0; index < Math.min(128, source.length); index++) {
      const bytes = new Uint8Array(source);
      bytes[index] ^= 128;
      let expected;
      try {
        expected = wasm.parseAbr(bytes);
      } catch {
        expect(() => js.parseAbr(bytes), `${name} @${index}`).toThrow();
        continue;
      }
      expect(js.parseAbr(bytes), `${name} @${index}`).toEqual(expected);
      expect(js.writeAbr(expected)).toEqual(bytes);
    }
  }
});

it('detaches source and unknown payloads from the caller input', () => {
  const data = readFileSync(resolve(fixtures, 'descriptors/tdta.input.bin')),
    head = Buffer.alloc(16);
  head.writeUInt16BE(6);
  head.writeUInt16BE(2, 2);
  head.write('8BIMdesc', 4);
  head.writeUInt32BE(data.length, 12);
  const bytes = Buffer.concat([head, data, Buffer.alloc((4 - (data.length % 4)) % 4)]),
    doc = js.parseAbr(bytes),
    original = structuredClone(doc);
  bytes.fill(0);
  expect(doc).toEqual(original);
  // A changed source also cannot mutate the separate inspection projection.
  const extensions = structuredClone(doc.extensions);
  doc.source.bytes.fill(0);
  expect(doc.extensions).toEqual(extensions);
});

it('decodes PackBits repeats and mixed raw/packed 16384-row strips identically', () => {
  const scalar = (size: number, n: number) => {
    const b = Buffer.alloc(size);
    if (size === 2) b.writeUInt16BE(n);
    else b.writeInt32BE(n);
    return b;
  };
  const sample = (depth: number, width: number, height: number, payload: Uint8Array) =>
    Buffer.concat([
      Buffer.from([1, 120]),
      Buffer.alloc(8),
      scalar(2, depth),
      scalar(4, 0),
      scalar(4, 0),
      scalar(4, height),
      scalar(4, width),
      scalar(2, depth),
      payload
    ]);
  const repeated = sample(8, 128, 1, Buffer.from([1, 0, 2, 129, 200]));
  const raw = Buffer.alloc(16384 * 2);
  for (let i = 0; i < raw.length; i += 2) raw.writeUInt16BE(32768, i);
  const mixed = sample(16, 1, 16385, Buffer.concat([Buffer.from([0]), raw, Buffer.from([1, 0, 3, 1, 0, 64])]));
  for (const bytes of [repeated, mixed]) {
    expect(js.readSamplePlane(bytes, 1)).toEqual(wasm.readSamplePlane(bytes, 1));
    const source = { kind: 'sample' as const, layout: 1, bytes };
    expect(js.decodeResource(source)).toEqual(wasm.decodeResource(source));
  }
  expect([...js.decodeResource({ kind: 'sample', layout: 1, bytes: repeated }).data]).toEqual(Array(128).fill(200));
  expect(js.decodeResource({ kind: 'sample', layout: 1, bytes: mixed }).data.at(-1)).toBe(128);
  const damaged = repeated.slice(0, -1);
  expect(() => js.readSamplePlane(damaged, 1)).toThrow();
  expect(() => wasm.readSamplePlane(damaged, 1)).toThrow();
});

it('matches authored text normalization and bounded Unicode counts', () => {
  const doc = js.parseAbr(readFileSync(new URL('../files/Basic_3.abr', import.meta.url)));
  doc.brushes[0]!.name = 'Unicode \ud800 \udc00 \ud83d\udd8c';
  expect(js.writeAbr(doc)).toEqual(wasm.writeAbr(doc));
  doc.brushes[0]!.name = 'x'.repeat(1_000_000);
  expect(() => js.writeAbr(doc)).toThrow();
  expect(() => wasm.writeAbr(doc)).toThrow();
});

it('matches the descriptor recursion boundary for a final empty list', () => {
  const u32 = (n: number) => {
    const b = Buffer.alloc(4);
    b.writeUInt32BE(n);
    return b;
  };
  const file = (levels: number) => {
    const descriptor = Buffer.concat([
      u32(16),
      u32(0),
      u32(0),
      Buffer.from('null'),
      u32(1),
      u32(0),
      Buffer.from('deep'),
      ...Array.from({ length: levels }, (_, i) => Buffer.concat([Buffer.from('VlLs'), u32(i === levels - 1 ? 0 : 1)]))
    ]);
    const head = Buffer.alloc(16);
    head.writeUInt16BE(6);
    head.writeUInt16BE(2, 2);
    head.write('8BIMdesc', 4);
    head.writeUInt32BE(descriptor.length, 12);
    return Buffer.concat([head, descriptor]);
  };
  expect(js.parseAbr(file(64))).toEqual(wasm.parseAbr(file(64)));
  expect(() => js.parseAbr(file(65))).toThrow();
  expect(() => wasm.parseAbr(file(65))).toThrow();
});
