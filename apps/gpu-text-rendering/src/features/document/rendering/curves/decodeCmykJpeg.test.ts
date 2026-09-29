import { describe, expect, it } from 'vitest';
import { jpegComponents, stripJpegExif } from './decodeCmykJpeg';

describe('JPEG header markers', () => {
  const soi = [0xff, 0xd8];
  const exif = segment(0xe1, [...ascii('Exif'), 0, 0, 0x4d, 0x4d, 0, 0x2a]);
  const xmp = segment(0xe1, ascii('http://ns.adobe.com/xap/1.0/\0'));
  const jfif = segment(0xe0, [...ascii('JFIF'), 0, 1, 2, 0, 0, 1, 0, 1, 0, 0]);
  const sof = segment(0xc0, [8, 0, 2, 0, 3, 4, 1, 0x11, 0, 2, 0x11, 0, 3, 0x11, 0, 4, 0x11, 0]);
  const scan = [0xff, 0xda, 0, 2, 0xff, 0xe1, 0, 8, ...ascii('Exif'), 0, 0, 0xff, 0xd9];

  it('removes only APP1 Exif segments and keeps entropy-coded data verbatim', () => {
    const source = bytes(soi, jfif, exif, xmp, sof, scan);
    const stripped = stripJpegExif(source);
    expect(values(stripped)).toEqual(values(bytes(soi, jfif, xmp, sof, scan)));
    expect(jpegComponents(stripped)).toBe(4);
  });

  it('removes Exif segments whose pad byte is 0xFF', () => {
    const padded = segment(0xe1, [...ascii('Exif'), 0, 0xff, 1, 2]);
    expect(values(stripJpegExif(bytes(soi, padded, sof, scan)))).toEqual(values(bytes(soi, sof, scan)));
  });

  it('returns the original buffer when there is no Exif segment', () => {
    const source = bytes(soi, jfif, xmp, sof, scan);
    expect(stripJpegExif(source)).toBe(source);
  });

  it('keeps bytes after a malformed segment unchanged', () => {
    const truncated = [0xff, 0xe2, 0xff, 0xff, 1, 2];
    expect(values(stripJpegExif(bytes(soi, exif, truncated)))).toEqual(values(bytes(soi, truncated)));
    const unwalkable = bytes(soi, truncated, exif);
    expect(stripJpegExif(unwalkable)).toBe(unwalkable);
  });

  it('reads component counts from the frame header', () => {
    expect(jpegComponents(bytes(soi, exif, sof, scan))).toBe(4);
    expect(jpegComponents(bytes(soi, scan))).toBeUndefined();
  });
});

function segment(marker: number, payload: number[]) {
  const length = payload.length + 2;
  return [0xff, marker, length >> 8, length & 255, ...payload];
}

function ascii(text: string) {
  return [...text].map((character) => character.charCodeAt(0));
}

function bytes(...parts: number[][]) {
  return new Uint8Array(parts.flat()).buffer;
}

function values(buffer: ArrayBuffer) {
  return [...new Uint8Array(buffer)];
}
