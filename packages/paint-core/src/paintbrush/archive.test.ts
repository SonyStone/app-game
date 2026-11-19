import { readFileSync } from 'node:fs';
import { zipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { patchArchive, readArchive, writeArchive } from './archive';
import { assetId, decodePng, encodePng } from './asset';
import { brushSchema, parseDocument, patch } from './document';
import { compatibility } from './compatibility';
import { readZip } from './zip';

const fixtures = ['soft-round', 'grain-nib', 'lettering'].map((key) =>
  readFileSync(new URL('../../tests/paintbrush/' + key + '.json', import.meta.url), 'utf8')
);
const files = fixtures.map((_, i) => 'brushes/b' + i + '.json');
const manifest = { format: 'paintbrush', version: [1, 0], minReader: [1, 0], brushes: files.map((file) => ({ file })) };

async function assets() {
  const entries = new Map<string, Uint8Array>();
  for (const pixels of [
    [0, 255, 128, 0],
    [255, 64, 64, 255],
    [0, 128, 128, 0]
  ]) {
    const image = { width: 2, height: 2, pixels: Uint8Array.from(pixels) };
    entries.set('assets/' + (await assetId(image)) + '.png', encodePng(image));
  }
  return entries;
}

it('loads all three examples and stores shared decoded images once', async () => {
  const entries = await assets();
  const shared = JSON.parse(fixtures[1]!).resources;
  const docs = fixtures.map((text, i) => (i === 1 ? text : patch(text, '/resources', shared)));
  const bytes = writeArchive(JSON.stringify(manifest), new Map(files.map((f, i) => [f, docs[i]!])), entries);
  const archive = await readArchive(bytes);
  expect(archive.status).toBe('editable');
  if (archive.status === 'editable') {
    expect(archive.assets.size).toBe(3);
    expect(archive.files.size).toBe(7);
    expect(archive.brushes.map((b) => b.view.name)).toEqual(['Soft round', 'Grain nib', 'Alternating lettering pen']);
  }
});

function single(text = fixtures[0]!, header = manifest, entries = new Map<string, Uint8Array>()) {
  return writeArchive(
    JSON.stringify({ ...header, brushes: [{ file: files[0] }] }),
    new Map([[files[0]!, text]]),
    entries
  );
}

it('retains unknown data and exact numeric tokens through an address edit', async () => {
  let source = fixtures[0]!.replace('"hardness": 0.65', '"private": 900719925474099312345, "hardness": 0.65');
  source = patch(source, '/definition/placement/law', 'future');
  source = patch(source, '/definition/extensions', { 'future.data.v1': { impact: 'metadata', value: [true] } });
  const saved = single(
    patch(source, '/definition/tips/round/hardness', 1),
    { ...manifest, ...{ unknown: 'retained' } },
    new Map([['private/data', Uint8Array.of(7)]])
  );
  const first = await readArchive(saved);
  const edited = await patchArchive(first, files[0]!, '/name', 'Renamed');
  const archive = await readArchive(edited.write());
  if (archive.status !== 'editable') {
    throw new Error(archive.reason);
  }
  expect(archive.manifest.unknown).toBe('retained');
  expect(archive.files.get('private/data')).toEqual(Uint8Array.of(7));
  expect(archive.brushes[0]!.text).toContain('900719925474099312345');
  expect(archive.brushes[0]!.text).toContain('future.data.v1');
  expect(compatibility(archive.brushes[0]!.view).status).toBe('approximate');
});

it('retains opaque archives verbatim and identifies unknown tools', async () => {
  const bytes = single('{}', { ...manifest, minReader: [1, 1] });
  const archive = await readArchive(bytes);
  expect(archive.status).toBe('unavailable');
  expect(archive.write()).toEqual(bytes);
  expect(compatibility(parseDocument(patch(fixtures[0]!, '/definition/tool', 'shovel'), brushSchema)).status).toBe(
    'unavailable'
  );
});

it('rejects duplicate JSON keys even when escaped', async () => {
  await expect(readArchive(single('{"a":1,"\\u0061":2}'))).rejects.toThrow(/Duplicate JSON key/);
});

it('checks missing assets and decoded digests', async () => {
  await expect(readArchive(single(fixtures[1]))).rejects.toThrow(/missing asset/);
  const entries = await assets();
  const [a, b] = [...entries.keys()];
  entries.set(a!, entries.get(b!)!);
  await expect(readArchive(single(fixtures[1], manifest, entries))).rejects.toThrow(/digest mismatch/);
});

describe('ZIP boundaries', () => {
  it('rejects traversing names and repeated names', async () => {
    await expect(readZip(zipSync({ '../file': Uint8Array.of(0) }))).rejects.toThrow(/Unsafe/);
    const bytes = zipSync({ a: Uint8Array.of(1), b: Uint8Array.of(2) }, { level: 0 });
    // Both names are single bytes and the payload contains neither ASCII letter.
    bytes.forEach((v, i) => {
      if (v === 98) {
        bytes[i] = 97;
      }
    });
    await expect(readZip(bytes)).rejects.toThrow(/duplicate/);
  });
  it('bounds declared and actual deflate output', async () => {
    const bytes = zipSync({ 'brushes/b.json': new Uint8Array(1048577) });
    await expect(readZip(bytes)).rejects.toThrow(/size limit/);
    const view = new DataView(bytes.buffer);
    const directory = view.getUint32(bytes.length - 6, true);
    view.setUint32(22, 10, true);
    view.setUint32(directory + 24, 10, true);
    await expect(readZip(bytes)).rejects.toThrow(/Expanded size/);
  });
});

it('accepts independently encoded grayscale and rejects color PNGs', async () => {
  const path = (name: string) =>
    new Uint8Array(readFileSync(new URL('../../tests/paintbrush/' + name, import.meta.url)));
  const image = await decodePng(path('filtered.png'));
  expect(image.pixels).toEqual(Uint8Array.from({ length: 20 }, (_, i) => i * 9));
  expect(await assetId(await decodePng(encodePng(image)))).toBe(await assetId(image));
  await expect(decodePng(path('rgb.png'))).rejects.toThrow(/8-bit grayscale/);
});

it('rejects an encrypted entry, multiple disks, and excess entry counts in preflight', async () => {
  const fresh = () => zipSync({ a: Uint8Array.of(1) });
  for (const [field, value, message] of [
    ['flag', 1, /Encrypted/],
    ['disk', 1, /multi-disk/],
    ['count', 8193, /entry count/]
  ] as const) {
    const bytes = fresh();
    const view = new DataView(bytes.buffer);
    const end = bytes.length - 22;
    if (field === 'flag') {
      view.setUint16(view.getUint32(end + 16, true) + 8, value, true);
    } else if (field === 'disk') {
      view.setUint16(end + 4, value, true);
    } else {
      view.setUint16(end + 8, value, true);
      view.setUint16(end + 10, value, true);
    }
    await expect(readZip(bytes)).rejects.toThrow(message);
  }
});

it('reports a missing essential image by brush when importing a set', async () => {
  const data = writeArchive(JSON.stringify(manifest), new Map(files.map((file, i) => [file, fixtures[i]!])));
  const archive = await readArchive(data, { reportMissingAssets: true });
  expect(archive.brushes?.map((b) => b.compatibility.status)).toEqual(['supported', 'unavailable', 'approximate']);
});

it('validates alias references, increasing knots and decoded image limits', () => {
  const text = fixtures[1]!;
  for (const [path, value, message] of [
    ['/definition/dual/tip', 'absent', /Unresolved tip/],
    ['/definition/texture/resource', 'absent', /Unresolved resource/],
    [
      '/definition/extensions',
      { 'future.mask.v1': { value: true, impact: 'metadata', resources: ['absent'] } },
      /Unresolved resource/
    ],
    [
      '/definition/dynamics/0/curve',
      [
        [1, 1],
        [0, 0]
      ],
      /increasing curve/
    ],
    ['/resources/grain/width', 8193, /8192/]
  ] as const) {
    expect(() => parseDocument(patch(text, path, value), brushSchema)).toThrow(message);
  }
});
