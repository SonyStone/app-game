import { writePsd, type PsdNewDocumentContext } from '@app-game/psd';
import { openPsd, type PsdRender, type PsdViewerDocument } from '@app-game/psd/viewer';
import { beforeEach, expect, it, vi } from 'vitest';
import type { Layer } from './document';
import { imageTiles } from './imageTiles';
import { PsdExportCompositeError, writePsdFile } from './psdFile';

vi.mock('@app-game/psd', async (original) => ({
  ...await original<typeof import('@app-game/psd')>(),
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
const dispose = vi.fn();
const close = vi.fn();
const render = vi.fn<PsdViewerDocument['render']>();
const pixels = new Uint8Array([223, 63, 166, 128]);
const image: PsdRender = { width: 1, height: 1, depth: 8, pixels, approximations: [], milliseconds: 0, dispose };

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(writePsd).mockResolvedValueOnce(new Uint8Array([1])).mockResolvedValue(new Uint8Array([2]));
  // Only render and close are used by export; all other document APIs deliberately remain absent.
  vi.mocked(openPsd).mockResolvedValue({ ok: true, value: { render, close } as unknown as PsdViewerDocument });
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
  expect(final![1]).toBe(pixels);
  expect(render).toHaveBeenCalledWith({
    linearBlending: false,
    approximate: false,
    textGamma: 1.45,
    vectorPaths: false,
    typeLayers: false,
    smartObjects: null
  });
  expect(dispose).toHaveBeenCalledOnce();
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
  expect(dispose).not.toHaveBeenCalled();
  expect(writePsd).toHaveBeenCalledOnce();
});

it.each([
  ['Approximation', { approximations: ['unsupported setting'] }],
  ['Dimensions', { width: 2 }],
  ['Dimensions', { height: 2 }]
] as const)('refuses %s and releases both resources', async (code, patch) => {
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
  expect(dispose).toHaveBeenCalledOnce();
  expect(close).toHaveBeenCalledOnce();
  expect(writePsd).toHaveBeenCalledOnce();
});

it('releases both resources if the final serialization throws', async () => {
  vi.mocked(writePsd)
    .mockReset()
    .mockResolvedValueOnce(new Uint8Array([1]))
    .mockRejectedValueOnce(new Error('final write'));
  await expect(writePsdFile([layer], async () => new Uint8Array())).rejects.toThrow('final write');
  expect(dispose).toHaveBeenCalledOnce();
  expect(close).toHaveBeenCalledOnce();
});
