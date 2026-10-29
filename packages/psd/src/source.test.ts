import { readFile } from 'node:fs/promises';
import { expect, it } from 'vitest';
import { loadPsd, readPsdMetadataQueries, readPsdSource, writePsd } from './index';
import { loadPsdViewer } from './viewer';

it('exposes imported comp flags and metadata defaults identically in both WASM packages', async () => {
  const bytes = await readFile(
    new URL('../../../apps/psd-viewer/src/features/examples/assets/layer-comps.psd', import.meta.url)
  );
  const metadata = await readPsdMetadataQueries(bytes);
  expect(metadata).toMatchObject({ globalAngle: 30, pixelScaleFactor: 1, fileInfo: {}, refusals: {} });
  expect(metadata.compsList).toEqual([
    {
      ID: 179061778,
      itemIndex: 1,
      title: 'first',
      comment: 'owned comp',
      useVisibility: true,
      usePosition: true,
      useAppearance: true,
      useChildLayerCompState: false
    },
    {
      ID: 179078585,
      itemIndex: 2,
      title: 'second',
      comment: 'owned comp',
      useVisibility: true,
      usePosition: true,
      useAppearance: true,
      useChildLayerCompState: false
    },
    {
      ID: 179095392,
      itemIndex: 3,
      title: 'third',
      comment: 'owned comp',
      useVisibility: true,
      usePosition: true,
      useAppearance: true,
      useChildLayerCompState: false
    }
  ]);
  const viewer = await loadPsdViewer();
  expect(viewer.readPsdMetadataQueries(bytes)).toEqual(metadata);
});

it('preserves a malformed metadata carrier as a refusal while admitting other queries', async () => {
  const bytes = await raster();
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const resources = 26 + 4 + view.getUint32(26);
  const following = resources + 4 + view.getUint32(resources);
  // Resource 1037 with two payload bytes instead of the required signed i32 angle.
  const resource = Uint8Array.of(56, 66, 73, 77, 4, 13, 0, 0, 0, 0, 0, 2, 0, 30);
  const malformed = new Uint8Array(resources + 4 + resource.length + bytes.length - following);
  malformed.set(bytes.subarray(0, resources));
  new DataView(malformed.buffer).setUint32(resources, resource.length);
  malformed.set(resource, resources + 4);
  malformed.set(bytes.subarray(following), resources + 4 + resource.length);

  const metadata = await readPsdMetadataQueries(malformed.buffer);
  expect(metadata).toMatchObject({ compsList: [], globalAngle: null, pixelScaleFactor: 1, fileInfo: {} });
  expect(metadata.refusals.globalAngle).toEqual(expect.any(String));
  expect((await loadPsdViewer()).readPsdMetadataQueries(malformed)).toEqual(metadata);
});

it('exposes absent vector carriers without synthesizing authoring data', async () => {
  const bytes = await raster();
  const source = await readPsdSource(bytes.buffer as ArrayBuffer);
  expect(source.layers).toHaveLength(1);
  expect(source.layers[0]).toMatchObject({ recordIndex: 0, vector: { origin: null, stroke: null, frame: null } });
  expect((await loadPsdViewer()).readPsdSource(bytes)).toEqual(source);
  await expect(readPsdSource(new Uint8Array(40))).rejects.toThrow('not a Photoshop document');
  await expect(readPsdMetadataQueries(new Uint8Array(40))).rejects.toThrow('not a Photoshop document');
});

it('keeps new editor operations typed and preserves source/revision on dependency refusals', async () => {
  const codec = await loadPsd();
  const session = new codec.PsdEditorSession(await raster());
  try {
    const source = session.sourceSnapshot();
    const refused = [
      () => session.repaintSolidFill(0, [2, 3, 4], false),
      () => session.editGeometry({ kind: 'editLiveShape', recordIndex: 0, dx: 1, dy: 0 }, false),
      () => session.applyVisibilityComp(1, false)
    ];
    for (const edit of refused) {
      expect(edit).toThrow();
      expect(session.revision).toBe(0n);
      expect(session.sourceSnapshot()).toEqual(source);
    }
  } finally {
    session.dispose();
  }
});

/** An owned RGB8 raster source with no comp, vector or fill dependencies. */
async function raster() {
  const pixels = Uint8Array.of(1, 2, 3, 255);
  return writePsd(
    {
      width: 1,
      height: 1,
      layers: [
        {
          name: 'Pixel',
          left: 0,
          top: 0,
          width: 1,
          height: 1,
          pixels,
          opacity: 1,
          visible: true,
          blend: 'normal',
          clipping: false,
          transparencyLocked: false
        }
      ]
    },
    pixels
  );
}
