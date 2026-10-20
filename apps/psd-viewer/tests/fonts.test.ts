import type { PsdFontLibrary } from '@app-game/psd/viewer';
import { expect, it, vi } from 'vitest';
import { fontMetadata } from '../../../packages/psd/test/fontMetadata';
import { addFontFile } from '../src/features/fonts/addFontFile';
import { importedTextStatus } from '../src/features/fonts/importedTextStatus';
import type { RenderedPixels } from '../src/features/psd-worker';

it('registers every original TTC face and validates each returned PostScript identity', () => {
  const bytes = fontMetadata(['RegularPS', 'BoldPS', 'LightPS'], true).buffer as ArrayBuffer;
  const library = fakeLibrary(['RegularPS', 'BoldPS', 'LightPS']);
  const added = addFontFile(library, bytes, 'chosen.ttc');
  expect(added).toMatchObject({
    ok: true,
    value: [
      { name: 'RegularPS', faceIndex: 0, active: true, raster: false },
      { name: 'BoldPS', faceIndex: 1, active: true, raster: false },
      { name: 'LightPS', faceIndex: 2, active: true, raster: false }
    ]
  });
  expect(library.addActiveFace.mock.calls).toEqual([
    [bytes, 0, 'chosen.ttc'],
    [bytes, 1, 'chosen.ttc'],
    [bytes, 2, 'chosen.ttc']
  ]);
  expect(library.add).not.toHaveBeenCalled();
  expect(addFontFile(fakeLibrary(['WrongPS']), bytes, 'chosen.ttc')).toMatchObject({
    ok: false,
    error: { message: 'font identity mismatch: expected RegularPS, received WrongPS' }
  });
});

it('keeps standalone raster support and reports unsupported import validation', () => {
  const bytes = fontMetadata(['CffPS']).buffer as ArrayBuffer;
  new DataView(bytes).setUint32(0, 0x4f54544f);
  const library = fakeLibrary(['CffPS']);
  library.addActiveFace.mockReturnValue({
    ok: false,
    error: { kind: 'unsupported', message: 'CFF validation unsupported' }
  });
  library.add.mockReturnValue({ ok: true, value: { name: 'CffPS', format: 'CFF', size: bytes.byteLength } });
  expect(addFontFile(library, bytes, 'chosen.otf')).toMatchObject({
    ok: true,
    value: [{ name: 'CffPS', active: false, raster: true, validationError: 'CFF validation unsupported' }]
  });
});

it('uses current approximation reports and abstains for hidden layers, unknown visibility and saved previews', () => {
  const layer = { index: 1, name: 'Title', fonts: ['RegularPS'], visible: true };
  const image: RenderedPixels = {
    width: 1,
    height: 1,
    depth: 8,
    pixels: new Uint8Array(4),
    render: 1,
    milliseconds: 0,
    approximations: []
  };
  expect(importedTextStatus(layer, undefined, true).kind).toBe('unrendered');
  expect(importedTextStatus(layer, { ok: true, value: image }, true).kind).toBe('unrendered');
  expect(importedTextStatus(layer, { ok: true, value: image }, true, true).kind).toBe('path');
  expect(importedTextStatus(layer, { ok: true, value: image }, false, true).kind).toBe('unrendered');
  expect(importedTextStatus(layer, { ok: true, value: image }, undefined, true).kind).toBe('unrendered');
  const reason = '“Title”: imported text layout unresolved';
  expect(importedTextStatus(layer, { ok: true, value: { ...image, approximations: [reason] } }, true)).toMatchObject({
    kind: 'approximate',
    reason
  });
  const preview: RenderedPixels = {
    ...image,
    window: { left: 0, top: 0, step: 1, strategy: 'streamed', source: 'savedComposite', exactToLayerRender: false }
  };
  expect(importedTextStatus(layer, { ok: true, value: preview }, true, true).kind).toBe('unrendered');
});

/** A font library spy that makes the host's identity and byte/index/provenance checks observable. */
function fakeLibrary(names: string[]) {
  return {
    addActiveFace: vi.fn<PsdFontLibrary['addActiveFace']>((_bytes, index) => ({ ok: true, value: names[index]! })),
    add: vi.fn<PsdFontLibrary['add']>(),
    fonts: vi.fn<PsdFontLibrary['fonts']>(),
    setHyphenationDictionary: vi.fn<PsdFontLibrary['setHyphenationDictionary']>(),
    free: vi.fn<PsdFontLibrary['free']>()
  };
}
