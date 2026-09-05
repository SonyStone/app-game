import { describe, expect, it } from 'vitest';
import { forcePixelsOpaque } from './textureCapture';

describe('material texture pixel preservation', () => {
  it('keeps RGB while replacing unused alpha', () => {
    const pixels = new Uint8ClampedArray([214, 51, 99, 0, 8, 34, 144, 127]);

    forcePixelsOpaque(pixels);

    expect([...pixels]).toEqual([214, 51, 99, 255, 8, 34, 144, 255]);
  });
});
