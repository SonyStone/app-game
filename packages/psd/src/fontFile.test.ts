import { expect, it } from 'vitest';
import { fontMetadata } from '../test/fontMetadata';
import { fontFileFaces } from './fontFile';

it('reads original collection indices and PostScript identities from TTC and OTC headers', () => {
  const bytes = fontMetadata(['RegularPS', 'BoldPS', 'LightPS'], true);
  expect(fontFileFaces(bytes)).toEqual([
    { name: 'RegularPS', faceIndex: 0, format: 'TrueType' },
    { name: 'BoldPS', faceIndex: 1, format: 'TrueType' },
    { name: 'LightPS', faceIndex: 2, format: 'TrueType' }
  ]);
  const otf = fontMetadata(['CffPS']);
  new DataView(otf.buffer).setUint32(0, 0x4f54544f);
  expect(fontFileFaces(otf)).toEqual([{ name: 'CffPS', faceIndex: 0, format: 'CFF' }]);
});

it('reads standalone files and subarrays without assuming an underlying-buffer origin', () => {
  const bytes = fontMetadata(['StandalonePS']);
  const padded = new Uint8Array(bytes.length + 20);
  padded.set(bytes, 13);
  expect(fontFileFaces(padded.subarray(13, 13 + bytes.length))).toEqual([
    { name: 'StandalonePS', faceIndex: 0, format: 'TrueType' }
  ]);
});

it('rejects truncated directories, invalid name ranges and unreadable identities', () => {
  expect(() => fontFileFaces(new Uint8Array(8))).toThrow();
  const collection = fontMetadata(['OnePS'], true);
  new DataView(collection.buffer).setUint32(8, 0xffffffff);
  expect(() => fontFileFaces(collection)).toThrow('invalid font collection directory');
  const bytes = fontMetadata(['OnePS']);
  new DataView(bytes.buffer).setUint16(28 + 16, 0xffff);
  expect(() => fontFileFaces(bytes)).toThrow('invalid PostScript name range');
  expect(() => fontFileFaces(fontMetadata(['bad name']))).toThrow('no readable PostScript name');
});
