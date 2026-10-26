import { writePsd, type PsdNewDocumentContext } from '@app-game/psd';
import { openPsd, type PsdRegionPixels, type PsdViewerDocument } from '@app-game/psd/viewer';
import { beforeEach, expect, it, vi } from 'vitest';
import type { Layer } from './document';
import { imageTiles } from './imageTiles';
import { PsdExportCompositeError, writePsdFile } from './psdFile';

vi.mock('@app-game/psd', async (original) => ({
  ...(await original<typeof import('@app-game/psd')>()),
  writePsd: vi.fn()
}));
vi.mock('@app-game/psd/viewer', () => ({ openPsd: vi.fn() }));

const layer: Layer = {
  id: 'ink',
  name: 'Ink',
  visible: true,
  opacity: 0.33333,
  blend: 'overlay',
  tiles: imageTiles(new Uint8ClampedArray([223, 79, 41, 128]), 1, 1, 0, 0)
};
const close = vi.fn();
const render = vi.fn<PsdViewerDocument['renderRegion']>();
const pixels = new Uint8Array([223, 63, 166, 128]);
const image: PsdRegionPixels = {
  left: 0, top: 0, width: 1, height: 1, pixels, approximations: [], step: 1,
  strategy: 'window', source: 'layers', exactToLayerRender: true
};

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(writePsd).mockResolvedValueOnce(new Uint8Array([1])).mockResolvedValue(new Uint8Array([2]));
  // Only renderRegion and close are used by export; all other document APIs deliberately remain absent.
  vi.mocked(openPsd).mockResolvedValue({ ok: true, value: { renderRegion: render, close } as unknown as PsdViewerDocument });
  render.mockReturnValue({ ok: true, value: image });
});

it('writes the exact straight pixels with the same document and caller context twice', async () => {
  // The writer is mocked: this sentinel verifies identity without inventing complete creation facts.
  const context = {} as PsdNewDocumentContext;
  const blob = await writePsdFile([layer], async () => new Uint8Array(), undefined, false, context);
  expect(new Uint8Array(await blob.arrayBuffer())).toEqual(new Uint8Array([2]));
  const [first, final] = vi.mocked(writePsd).mock.calls;
  expect(final![0]).toBe(first![0]);
  expect(first![2]).toBe(context);
  expect(final![2]).toBe(context);
  expect(final![1]).toEqual(pixels);
  expect(render).toHaveBeenCalledWith({ left: 0, top: 0, width: 1, height: 1 }, {
    linearBlending: false,
    approximate: false,
    textGamma: 1.45,
    vectorPaths: false,
    typeLayers: false,
    smartObjects: null,
    maxWorkPixels: 1024 * 1024,
    budget: expect.objectContaining({ allocationBytes: 128 * 1024 * 1024 })
  });
  expect(close).toHaveBeenCalledOnce();
});

it('preserves typed opening failure diagnostics', async () => {
  const error = { kind: 'invalid' as const, message: 'cannot open' };
  vi.mocked(openPsd).mockResolvedValue({ ok: false, error });
  await expect(writePsdFile([layer], async () => new Uint8Array())).rejects.toMatchObject({
    name: 'PsdExportCompositeError', code: 'OpenFailed', cause: error
  });
  expect(writePsd).toHaveBeenCalledOnce();
});

it('closes the document when strict rendering fails', async () => {
  render.mockReturnValue({ ok: false, error: { kind: 'unsupported', message: 'unsupported blend' } });
  await expect(writePsdFile([layer], async () => new Uint8Array())).rejects.toMatchObject({ code: 'RenderFailed' });
  expect(close).toHaveBeenCalledOnce();
  expect(writePsd).toHaveBeenCalledOnce();
});

it.each([
  ['Approximation', { approximations: ['unsupported setting'] }],
  ['Dimensions', { width: 2 }],
  ['Dimensions', { height: 2 }],
  ['Dimensions', { left: 1 }],
  ['Dimensions', { top: 1 }],
  ['Dimensions', { step: 2 }],
  ['Dimensions', { pixels: new Uint8Array(3) }],
  ['Approximation', { exactToLayerRender: false }],
  ['Approximation', { source: 'savedComposite' }]
] as const)('refuses %s and closes the document', async (code, patch) => {
  render.mockReturnValue({
    ok: true,
    value: {
      ...image,
      ...patch,
      approximations: 'approximations' in patch ? [...patch.approximations] : []
    }
  });
  const exported = writePsdFile([layer], async () => new Uint8Array());
  await expect(exported).rejects.toBeInstanceOf(PsdExportCompositeError);
  await expect(exported).rejects.toMatchObject({ code });
  expect(close).toHaveBeenCalledOnce();
  expect(writePsd).toHaveBeenCalledOnce();
});

it('closes the document if the final serialization throws', async () => {
  vi.mocked(writePsd)
    .mockReset()
    .mockResolvedValueOnce(new Uint8Array([1]))
    .mockRejectedValueOnce(new Error('final write'));
  await expect(writePsdFile([layer], async () => new Uint8Array())).rejects.toThrow('final write');
  expect(close).toHaveBeenCalledOnce();
});

it('assembles bounded tiles row by row, including both partial canvas edges', async () => {
  const width = 1025;
  const height = 1026;
  render.mockImplementation((rectangle) => {
    const pixels = new Uint8Array(rectangle.width * rectangle.height * 4);
    for (let y = 0; y < rectangle.height; y++) {
      for (let x = 0; x < rectangle.width; x++) {
        pixels.set([(rectangle.left + x) % 251, (rectangle.top + y) % 253, 77, 255], (y * rectangle.width + x) * 4);
      }
    }

    return { ok: true, value: { ...image, ...rectangle, pixels } };
  });
  await writePsdFile([layer], async () => new Uint8Array(), { left: -3, top: 7, width, height });
  expect(render.mock.calls.map(([rectangle]) => rectangle)).toEqual([
    { left: 0, top: 0, width: 1024, height: 1024 },
    { left: 1024, top: 0, width: 1, height: 1024 },
    { left: 0, top: 1024, width: 1024, height: 2 },
    { left: 1024, top: 1024, width: 1, height: 2 }
  ]);
  const composite = vi.mocked(writePsd).mock.calls[1]![1];
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const offset = (y * width + x) * 4;
      if (
        composite[offset] !== x % 251 || composite[offset + 1] !== y % 253 ||
        composite[offset + 2] !== 77 || composite[offset + 3] !== 255
      ) {
        throw new Error(`Incorrect composite pixel at ${x},${y}`);
      }
    }
  }

  expect(close).toHaveBeenCalledOnce();
});

it('closes the document and refuses an approximation in a later tile', async () => {
  render.mockReturnValueOnce({ ok: true, value: { ...image, width: 1024, pixels: new Uint8Array(4096) } });
  render.mockReturnValueOnce({ ok: true, value: { ...image, left: 1024, approximations: ['later tile'] } });
  await expect(writePsdFile([layer], async () => new Uint8Array(), {
    left: 0, top: 0, width: 1025, height: 1
  })).rejects.toMatchObject({ code: 'Approximation', message: 'later tile' });
  expect(close).toHaveBeenCalledOnce();
  expect(writePsd).toHaveBeenCalledOnce();
});

it('refuses an impossible host composite with a typed allocation error', async () => {
  await expect(writePsdFile([], async () => new Uint8Array(), {
    left: 0, top: 0, width: 300000, height: 300000
  })).rejects.toMatchObject({ name: 'PsdExportCompositeError', code: 'AllocationFailed', cause: expect.any(RangeError) });
  expect(openPsd).not.toHaveBeenCalled();
});
