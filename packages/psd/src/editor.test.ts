import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { expect, it } from 'vitest';
import {
  openPsdEditor,
  readPsd,
  type PsdExactRasterTreeEdit,
  type PsdPreparedSave,
  type PsdReopenSaveContext,
  type PsdReopenSaveWriters,
  type PsdSaveResourceContext
} from './index';
import { openPsd } from './viewer';

it('replays the measured same-target batch and keeps frozen saves independent of gamma and session lifetime', async () => {
  const session = value(await openPsdEditor(await fixture('flat-rgb8')));
  const before = value(session.sourceSnapshot());
  const commands = [
    { kind: 'rename', layerId: 4, name: 'renamed' },
    { kind: 'opacity', layerId: 4, opacity: 173 },
    { kind: 'fill', layerId: 4, fill: 173 }
  ] satisfies PsdExactRasterTreeEdit[];
  try {
    expect(session.inspect()).toMatchObject({ ok: false, error: { code: 'Dependency' } });
    expect(value(session.inspectSource()).layers).toHaveLength(3);
    expect(session.editRasterTreeExact(commands, context('flat-rgb8', 4, 1792812792.068197))).toEqual({
      ok: true,
      value: { revision: 1n, created: [], diagnostics: [] }
    });
    const encoded = value(session.prepareSave(false));
    const linear = value(session.prepareSave(true));
    session.dispose();
    session.dispose();
    const bytes = collect(encoded);
    expect(collect(linear)).toEqual(bytes);
    // Research b05b8f3345, E-structure-2/admissions.json, flatmulti-multi-g0 candidate.
    expect(sha256(bytes)).toBe('a8d1a3d76593fd6b1f56c2c6940194dbc48387bcc8ca0791e44f0e3e9641083d');
    const reopened = await readPsd(bytes);
    expect(reopened.layers.at(-1)).toMatchObject({ name: 'renamed' });
    expect(before.revision).toBe(0n);
    expect(session.prepareSave()).toMatchObject({ ok: false, error: { code: 'Disposed' } });
    expect(() => encoded.nextChunk(64)).toThrow('disposed');
  } finally {
    session.dispose();
  }
});

it.each([
  {
    command: { kind: 'delete', layerId: 4 },
    sha: 'b7e2068a8a15a9aba3db6260dd95faabca43717da585b54c191b4382a2609155'
  },
  {
    command: { kind: 'move', layerId: 4, index: 0 },
    sha: '07dbe264d0ed28cafa659bad8e7fd0bc20752d4cc43852fbad5f16648ad43dde'
  }
] satisfies { command: PsdExactRasterTreeEdit; sha: string }[])(
  'replays measured $command.kind without inventing target edit times',
  async ({ command, sha }) => {
    const session = value(await openPsdEditor(new Uint8Array(await fixture('flat-rgb8')).buffer));
    try {
      value(session.editRasterTreeExact([command], context('flat-rgb8')));
      // Research b05b8f3345, E-structure/admissions.json, flat-delete-top and flat-reorder-bottom.
      expect(sha256(collect(value(session.prepareSave())))).toBe(sha);
    } finally {
      session.dispose();
    }
  }
);

it('allocates a raster identity above physical group-end IDs and replays the measured group insertion', async () => {
  const session = value(await openPsdEditor(await fixture('groups')));
  try {
    const process = value(session.inspectProcess());
    expect(process.layers.some((layer) => layer.layerId === 6)).toBe(true);
    const outcome = session.editRasterTreeExact(
      [
        {
          kind: 'insertRaster',
          parent: 5,
          index: 2,
          raster: {
            name: 'added',
            left: 0,
            top: 0,
            width: 8,
            height: 8,
            pixels: Uint8Array.from(Array(64).fill([0, 0, 0, 255]).flat())
          }
        }
      ],
      context('groups', 7, 1792796839.74983)
    );
    expect(value(outcome)).toEqual({ revision: 1n, created: [7], diagnostics: [] });
    // Research b05b8f3345, E-structure/admissions.json, groups-add candidate.
    expect(sha256(collect(value(session.prepareSave())))).toBe(
      '3d4e5bc6cd204cdc5d87a44ba2bcec70a11ea089b6f7f13f980db210ef058293'
    );
    expect(value(session.inspectProcess()).layers.some((layer) => layer.layerId === 7)).toBe(true);
  } finally {
    session.dispose();
  }
});

it('requires preview operands for native RGB16 and replays the measured rename with the original sRGB profile', async () => {
  const session = value(await openPsdEditor(await fixture('rgb16')));
  try {
    const before = value(session.sourceSnapshot());
    const command = [{ kind: 'renameProcessLayer', layerId: 4, name: 'renamed' }] satisfies PsdExactRasterTreeEdit[];
    const saveContext = context('rgb16', 4, 1792812273.466764);
    expect(session.editRasterTreeExact(command, saveContext)).toMatchObject({
      ok: false,
      error: { code: 'Dependency' }
    });
    expect(value(session.sourceSnapshot())).toEqual(before);
    expect(value(session.inspectProcess())).toMatchObject({ mode: 3, depth: 16 });
    value(
      session.editRasterTreeExact(command, {
        ...saveContext,
        preview: {
          srgbProfile: new Uint8Array(await readFile(new URL('../test/srgb.icc', import.meta.url))),
          intent: 'relativeColorimetric',
          blackPointCompensation: true,
          dither: false,
          ocio: false
        }
      })
    );
    // Research b05b8f3345, E-structure-2/admissions.json, rgb16-rename-g0 candidate.
    expect(sha256(collect(value(session.prepareSave())))).toBe(
      'b6e3d539e4a600e279bc45389b07eacf667645627925f334691c6315c7dee372'
    );
  } finally {
    session.dispose();
  }
});

it('replaces independent mask samples at unchanged bounds and preserves the measured save', async () => {
  const bytes = await fixture('masks');
  const document = value(await openPsd(bytes));
  const session = value(await openPsdEditor(bytes));
  try {
    const mask = value(document.layerPixels(2)).masks[0]!;
    const samples = mask.values.slice();
    for (let y = 4; y < 20; y++) {
      for (let x = 12; x < 20; x++) {
        samples[(y - mask.top) * mask.width + x - mask.left] = 128;
      }
    }

    value(
      session.editRasterTreeExact(
        [
          {
            kind: 'setMask',
            layerId: 4,
            mask: {
              left: mask.left,
              top: mask.top,
              width: mask.width,
              height: mask.height,
              samples,
              defaultColor: mask.defaultColor,
              disabled: false
            }
          }
        ],
        context('masks', 4, 1792812796.299641)
      )
    );
    // Research b05b8f3345, E-structure-2/admissions.json, masks-mask-paint-g0 candidate.
    expect(sha256(collect(value(session.prepareSave())))).toBe(
      '0acc9134d4c58850e425c56405297856f937f4dac5327ab732842a322e83ce2a'
    );
  } finally {
    document.close();
    session.dispose();
  }
});

it('preserves bytes and revision on absent context, invalid times, unsupported structure and File Info refusals', async () => {
  const bytes = await fixture('flat-rgb8');
  const session = value(await openPsdEditor(bytes));
  try {
    const before = value(session.sourceSnapshot());
    const commands = [{ kind: 'rename', layerId: 4, name: 'renamed' }] satisfies PsdExactRasterTreeEdit[];
    const refused = [
      () => session.editRasterTreeExact(commands),
      () => session.editRasterTreeExact([{ kind: 'insertGroup', index: 0, name: 'unverified' }], context('flat-rgb8')),
      () => session.editStateMetadata([{ kind: 'fileInfoTitle', title: 'unverified' }]),
      () => session.editStateMetadata([{ kind: 'fileInfoCopyright', status: 'publicDomain' }])
    ];
    for (const edit of refused) {
      expect(edit()).toMatchObject({
        ok: false,
        error: {
          code: 'Dependency',
          propertyPath: expect.any(String),
          capability: expect.any(String)
        }
      });
      expect(value(session.sourceSnapshot())).toEqual(before);
      expect(collect(value(session.prepareSave()))).toEqual(new Uint8Array(bytes));
    }

    expect(session.editRasterTreeExact(commands, context('flat-rgb8'))).toMatchObject({
      ok: false,
      error: { code: 'Invalid' }
    });
    expect(session.editRasterTreeExact(commands, context('flat-rgb8', 4, NaN))).toMatchObject({
      ok: false,
      error: { code: 'Invalid' }
    });
    expect(value(session.sourceSnapshot())).toEqual(before);
    expect(session.editRasterTreeExact([])).toEqual({
      ok: true,
      value: { revision: 0n, created: [], diagnostics: [] }
    });
  } finally {
    session.dispose();
  }
});

it('requires both grouping clocks before allocating the measured header and hidden end identities', async () => {
  const session = value(await openPsdEditor(await fixture('grouping')));
  try {
    const before = value(session.sourceSnapshot());
    const command = [
      { kind: 'groupSelectedLayers', layerIds: [4], name: 'Group 1', expanded: true }
    ] satisfies PsdExactRasterTreeEdit[];
    const saveContext = context('depth0', 5, 1792816939.000644);
    expect(session.editRasterTreeExact(command, saveContext)).toMatchObject({ ok: false, error: { code: 'Invalid' } });
    expect(value(session.sourceSnapshot())).toEqual(before);
    const outcome = value(
      session.editRasterTreeExact(command, {
        ...saveContext,
        layerTimes: [...saveContext.layerTimes, { layerId: 6, time: 1792816939.000662 }]
      })
    );
    expect(outcome).toEqual({ revision: 1n, created: [5], diagnostics: [] });
    // Research 3ad38efe09, E-structure-3/admissions.json, d0-target-group-retry.
    expect(sha256(collect(value(session.prepareSave())))).toBe(
      '3cabde93be8c123d5de3791ffd65e588230c8c65194977e8feb1c6479e105c77'
    );
  } finally {
    session.dispose();
  }
});

it('carries untouched type under v2 with actual host writers, working profile, gamma and captured font inventory', async () => {
  const source = await fixture('carried-type');
  const session = value(await openPsdEditor(source));
  try {
    const before = value(session.sourceSnapshot());
    const profile = new Uint8Array(await readFile(new URL('../test/editor/working-srgb.icc', import.meta.url)));
    const fonts: string[] = JSON.parse(
      await readFile(new URL('../test/editor/active-fonts.json', import.meta.url), 'utf8')
    );
    const saveContext = {
      ...context('document', 3, 1792855634.299563),
      contract: 'photoshop26.reopen-equivalent/v2-carried-type',
      writers: writers(),
      typeRendering: { textGamma: 1.45, availableFonts: fonts },
      preview: {
        srgbProfile: new Uint8Array(await readFile(new URL('../test/srgb.icc', import.meta.url))),
        sourceWorkingProfile: profile,
        intent: 'relativeColorimetric',
        blackPointCompensation: true,
        dither: false,
        ocio: false
      }
    } satisfies PsdReopenSaveContext;
    const command = [{ kind: 'rename', layerId: 1, name: 'renamed' }] satisfies PsdExactRasterTreeEdit[];
    const missingFont = session.editRasterTreeExact(command, {
      ...saveContext,
      typeRendering: {
        ...saveContext.typeRendering,
        availableFonts: fonts.filter((name) => name !== 'MyriadPro-Regular')
      }
    });
    expect(missingFont).toMatchObject({ ok: false, error: { code: 'Dependency', cause: expect.any(Error) } });
    expect(value(session.sourceSnapshot())).toEqual(before);
    expect(collect(value(session.prepareSave()))).toEqual(new Uint8Array(source));
    expect(value(session.editRasterTreeExact(command, saveContext))).toEqual({
      revision: 1n,
      created: [3],
      diagnostics: []
    });
    // Research 3ad38efe09, E-type-carry/admissions.json, v2-100 candidate, including untouched type carriers.
    const saved = collect(value(session.prepareSave()));
    expect(sha256(saved)).toBe('91bdad4723380b16b6257aa625702fe4901b29b820fcbd01fb59cb9eb7bf257a');
    expect(session.editRasterTreeExact(command, saveContext)).toMatchObject({
      ok: false,
      error: { code: 'Dependency' }
    });
    expect(collect(value(session.prepareSave()))).toEqual(saved);
  } finally {
    session.dispose();
  }
});

it('keeps prepared writer candidates separate from preservation saves and retains partial dependencies and refusal causes', async () => {
  const source = await fixture('flat-rgb8');
  const session = value(await openPsdEditor(source));
  try {
    const before = value(session.sourceSnapshot());
    const save = context('flat-rgb8').save;
    const resources = value(
      session.preparePhotoshop26ResourceCandidate({
        ...writers().resources,
        basename: save.basename,
        softwareAgent: save.softwareAgent,
        exifTime: save.exifTime,
        taggedSrgb: true
      } satisfies PsdSaveResourceContext)
    );
    expect(resources.revision).toBe(0n);
    expect(resources.bytes).toBeInstanceOf(Uint8Array);
    expect(resources.dependencies.length).toBeGreaterThan(0);
    expect(resources.dependencies).toEqual(
      expect.arrayContaining([expect.objectContaining({ resourceId: expect.any(Number), reason: expect.any(String) })])
    );
    const refused = session.preparePhotoshop26Save(save);
    expect(refused).toMatchObject({
      ok: false,
      error: {
        code: 'Dependency',
        propertyPath: 'save.thumbnail.adobe-jpeg',
        capability: expect.any(String),
        cause: expect.any(Error)
      }
    });
    expect(session.preparePhotoshop26ShapeCacheCandidate(4)).toMatchObject({
      ok: false,
      error: { code: 'Container', cause: expect.any(Error) }
    });
    expect(session.preparePhotoshop26LayerRecordCandidate(-1)).toMatchObject({ ok: false, error: { code: 'Invalid' } });
    expect(session.prepareReopenCandidate(save, [])).toMatchObject({
      ok: false,
      error: { code: 'Invalid', message: expect.stringContaining('requires an edit') }
    });
    const xmp = value(session.preparePhotoshop26XmpCandidate(save));
    const layer = value(session.preparePhotoshop26LayerRecordCandidate(0));
    const paths = value(session.preparePhotoshop26EmptyPathsCandidate());
    expect(value(session.sourceSnapshot())).toEqual(before);
    expect(collect(value(session.prepareSave()))).toEqual(new Uint8Array(source));
    session.dispose();
    for (const prepared of [xmp, layer, paths]) {
      expect(prepared.revision).toBe(0n);
      const bytes = collect(prepared);
      if (prepared === xmp) {
        expect(new TextDecoder().decode(bytes)).toContain(save.instanceId);
      }

      expect((await readPsd(bytes)).layers).toHaveLength(3);
      expect(() => prepared.nextChunk(64)).toThrow('disposed');
    }
    expect(
      session.preparePhotoshop26ResourceCandidate({
        ...writers().resources,
        basename: save.basename,
        softwareAgent: save.softwareAgent,
        exifTime: save.exifTime
      })
    ).toMatchObject({ ok: false, error: { code: 'Disposed' } });
  } finally {
    session.dispose();
  }
});

it('writes File Info publicDomain with explicit native lifecycle values and refuses unsupported transitions atomically', async () => {
  const session = value(await openPsdEditor(await fixture('metadata')));
  try {
    const saveContext = {
      modifiedAt: '2026-10-23T13:02:35+02:00',
      instanceId: 'xmp.iid:291b8039-d1cf-4ef2-ab5f-1029db97e2d2',
      documentId: 'adobe:docid:photoshop:c5c3a156-3dc2-8943-aef8-379a84cb0b04'
    };
    value(session.editStateMetadata([{ kind: 'fileInfoCopyright', status: 'publicDomain', saveContext }]));
    const bytes = collect(value(session.prepareSave()));
    // Research b05b8f3345, E-metadata/copyright-candidate.psd, complete metadata and retained source bytes.
    expect(sha256(bytes)).toBe('bda6fe34c369ab697c7133f53f9de7926798137c9029aa33554bb7db4b0e6bd7');
    const before = value(session.sourceSnapshot());
    expect(
      session.editStateMetadata([
        { kind: 'printCaption', enabled: true },
        { kind: 'fileInfoCopyright', status: 'copyrightedWork', saveContext }
      ])
    ).toMatchObject({ ok: false, error: { code: 'Dependency' } });
    expect(value(session.sourceSnapshot())).toEqual(before);
    expect(collect(value(session.prepareSave()))).toEqual(bytes);
  } finally {
    session.dispose();
  }
});

/** Owned Photoshop 26 controls from E-structure/E-metadata at b05b8f3345 and E-structure-3/E-type-carry at 3ad38efe09. */
function fixture(name: string) {
  return readFile(new URL(`../test/editor/${name}.psd`, import.meta.url));
}

/** Explicit research save operands; no host clock, random identities or inferred gamma. */
function context(basename: string, layerId?: number, time = 1): PsdReopenSaveContext {
  return {
    contract: 'photoshop26.reopen-equivalent/v1',
    save: {
      basename,
      saveTime: '2026-10-24T00:00:00+02:00',
      exifTime: '2026:10:24 00:00:00',
      instanceId: 'xmp.iid:00000000-0000-0000-0000-000000000001',
      documentId: 'adobe:docid:photoshop:00000000-0000-0000-0000-000000000002',
      softwareAgent: 'Adobe Photoshop 26.0 (Macintosh)',
      linearBlending: false
    },
    layerTimes: layerId === undefined ? [] : [{ layerId, time }]
  };
}

/** Actual captured host state from research E-type-carry v2-100, with no inferred application defaults. */
function writers(): PsdReopenSaveWriters {
  return {
    proofSetupName: 'Proof Setup',
    resources: {
      writerName: 'Adobe Photoshop',
      readerName: 'Adobe Photoshop 2025',
      mergedComposite: true,
      displayUnit: 1,
      missingResolution: [4718592, 1],
      missingGrid: [576, 576],
      legacyGuideColor: [0, 74, 255, 255],
      transparencyName: 'Transparency',
      taggedSrgb: false
    },
    document: {
      compositor: { engine: 'compCoreGPU', gpu: 'feature', threads: 'feature', gpuSupport: 'supported' },
      iccDisplay: '',
      iccView: '',
      newCredentialsEnabled: false
    }
  };
}

function value<T>(result: { ok: true; value: T } | { ok: false; error: unknown }): T {
  expect(result.ok, JSON.stringify(result.ok ? undefined : result.error)).toBe(true);
  if (!result.ok) {
    throw new Error('Expected a successful operation');
  }

  return result.value;
}

/** Consumes bounded chunks and releases the frozen resource even when reading fails. */
function collect(save: PsdPreparedSave): Uint8Array {
  try {
    const chunks: Uint8Array[] = [];
    for (let chunk; (chunk = save.nextChunk(4096)); ) {
      chunks.push(chunk);
    }

    return new Uint8Array(Buffer.concat(chunks));
  } finally {
    save.dispose();
    save.dispose();
  }
}

function sha256(bytes: Uint8Array) {
  return createHash('sha256').update(bytes).digest('hex');
}
