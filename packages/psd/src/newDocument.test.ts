import { readFile } from 'node:fs/promises';
import { expect, it } from 'vitest';
import {
  loadPsd,
  PsdWriteError,
  readPsd,
  readPsdSource,
  writePsd,
  type PsdDocument,
  type PsdNewDocumentContext
} from './index';

it('forwards complete creation facts, layer identities and unchanged raster operands', async () => {
  const context = await creationContext();
  const layers = [
    {
      name: 'Ink',
      left: 0,
      top: 0,
      width: 1,
      height: 1,
      pixels: new Uint8Array([10, 20, 30, 128]),
      opacity: 1,
      visible: true,
      blend: 'normal' as const,
      clipping: false,
      transparencyLocked: false
    },
    {
      name: 'Hidden empty',
      left: 0,
      top: 0,
      width: 0,
      height: 0,
      pixels: new Uint8Array(),
      opacity: 0.5,
      visible: false,
      blend: 'normal' as const,
      clipping: false,
      transparencyLocked: false
    }
  ];
  const document = { width: 1, height: 1, layers } satisfies PsdDocument;
  const composite = new Uint8Array([10, 20, 30, 128]);
  const before = structuredClone({ document, composite, context });
  const bytes = await writePsd(document, composite, context);
  expect(bytes).toEqual((await loadPsd()).writePsd(document, composite, context));
  expect({ document, composite, context }).toEqual(before);
  const source = await readPsdSource(bytes);
  expect(source.layers.map((layer) => layer.layerId)).toEqual([71, 19]);
  const xmp = new TextDecoder().decode(source.xmp!);
  for (const fact of [
    'created',
    'saved',
    context.creation.when,
    context.save.saveTime,
    context.creation.originalDocumentId,
    context.creation.instanceId,
    context.save.instanceId,
    context.save.documentId,
    'Paint'
  ]) {
    expect(xmp).toContain(fact);
  }
  expect(xmp).not.toContain('Adobe Photoshop');
  const resources = imageResources(bytes);
  expect([...resources.keys()]).toEqual(expect.arrayContaining([1005, 1036, 1039, 1044, 1060, 1069, 1082]));
  expect(new DataView(resources.get(1044)!.buffer).getUint32(0)).toBe(71);
  expect(resources.get(1039)).toEqual(context.profile);
  expect(new DataView(resources.get(1005)!.buffer).getUint32(0)).toBe(72 * 65536);
  expect(new DataView(resources.get(1036)!.buffer).getUint32(0)).toBe(1);
  expect(new TextDecoder().decode(bytes)).toContain('layerTime');
  expect((await readPsd(bytes)).layers).toMatchObject(
    layers.map((layer) => ({ ...layer, opacity: Math.round(layer.opacity * 255) / 255 }))
  );
});

it('leaves two-argument output identical to the codec, with stable IDs and resource 1044 but no XMP', async () => {
  const document = {
    width: 1,
    height: 1,
    layers: [
      {
        name: 'A',
        left: 0,
        top: 0,
        width: 1,
        height: 1,
        pixels: new Uint8Array([1, 2, 3, 255]),
        opacity: 1,
        visible: true,
        blend: 'normal' as const,
        clipping: false,
        transparencyLocked: false
      }
    ]
  };
  const composite = document.layers[0]!.pixels;
  const bytes = await writePsd(document, composite);
  expect(bytes).toEqual((await loadPsd()).writePsd(document, composite));
  expect(bytes).toEqual(await writePsd(document, composite, undefined));
  const source = await readPsdSource(bytes);
  expect(source.layers.map((layer) => layer.layerId)).toEqual([2]);
  expect(source.xmp).toBeNull();
  expect([...imageResources(bytes).keys()]).toEqual([1044]);
});

it('returns typed atomic refusals for missing operands, unknown keys, duplicate IDs and invalid clocks', async () => {
  const context = await creationContext();
  const document = {
    width: 1,
    height: 1,
    layers: [0, 1].map(() => ({
      name: 'A',
      left: 0,
      top: 0,
      width: 0,
      height: 0,
      pixels: new Uint8Array(),
      opacity: 1,
      visible: true,
      blend: 'normal' as const,
      clipping: false,
      transparencyLocked: false
    }))
  };
  const composite = new Uint8Array([0, 0, 0, 0]);
  const good = await writePsd(document, composite, context);
  const { profile: _, ...missing } = context;
  for (const invalid of [
    missing,
    { ...context, unexpected: true },
    { ...context, layerIds: [71, 71] },
    { ...context, layerTimes: [0, NaN] },
    { ...context, layerIds: [71] }
  ]) {
    // Deliberately bypass the static contract to exercise JavaScript callers and malformed host data.
    await expect(writePsd(document, composite, invalid as PsdNewDocumentContext)).rejects.toBeInstanceOf(PsdWriteError);
    await expect(writePsd(document, composite, invalid as PsdNewDocumentContext)).rejects.toMatchObject({
      code: 'InvalidDocument'
    });
  }
  expect(await writePsd(document, composite, context)).toEqual(good);
});

/** Explicit deterministic host operands for codec tests, never product defaults. */
async function creationContext(): Promise<PsdNewDocumentContext> {
  return {
    creation: {
      originalDocumentId: 'xmp.did:11111111-1111-4111-8111-111111111111',
      instanceId: 'xmp.iid:11111111-1111-4111-8111-111111111111',
      when: '2026-10-25T10:00:00+00:00',
      creatorTool: 'Paint'
    },
    save: {
      basename: 'test drawing',
      saveTime: '2026-10-25T11:00:00+00:00',
      exifTime: '2026:10:25 11:00:00',
      instanceId: 'xmp.iid:22222222-2222-4222-8222-222222222222',
      documentId: 'adobe:docid:photoshop:33333333-3333-4333-8333-333333333333',
      softwareAgent: 'Paint',
      linearBlending: false
    },
    resources: {
      writerName: 'Paint',
      readerName: 'Paint',
      mergedComposite: true,
      displayUnit: 1,
      missingResolution: [72 * 65536, 1],
      missingGrid: [32 * 32, 32 * 32],
      legacyGuideColor: [255, 0, 255, 255],
      transparencyName: 'Transparency',
      taggedSrgb: true
    },
    document: {
      compositor: { engine: 'compCore', gpu: 'off', threads: 'off', gpuSupport: 'supported' },
      iccDisplay: '',
      iccView: '',
      newCredentialsEnabled: false
    },
    profile: new Uint8Array(await readFile(new URL('../test/srgb.icc', import.meta.url))),
    layerIds: [71, 19],
    layerTimes: [1792922400, 1792922401],
    globalAngle: 90,
    globalAltitude: 30,
    proofSetupName: 'Working CMYK'
  };
}

/** Reads the writer's image resources independently of the codec facade. */
function imageResources(bytes: Uint8Array): Map<number, Uint8Array> {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let offset = 26 + 4 + view.getUint32(26);
  const end = offset + 4 + view.getUint32(offset);
  offset += 4;
  const result = new Map<number, Uint8Array>();
  while (offset < end) {
    const id = view.getUint16(offset + 4);
    offset += 6;
    offset += (1 + bytes[offset]! + 1) & ~1;
    const size = view.getUint32(offset);
    offset += 4;
    result.set(id, bytes.slice(offset, offset + size));
    offset += size + (size % 2);
  }
  return result;
}
