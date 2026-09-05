import { describe, expect, it } from 'vitest';
import { CanvasSpy } from './canvasSpy';

describe('canvas patch ownership', () => {
  it('restores getContext when disposed and permits a fresh installation', () => {
    const original = HTMLCanvasElement.prototype.getContext;
    const spy = new CanvasSpy();
    expect(HTMLCanvasElement.prototype.getContext).not.toBe(original);
    spy.dispose();
    expect(HTMLCanvasElement.prototype.getContext).toBe(original);
    const replacement = new CanvasSpy();
    replacement.dispose();
    expect(HTMLCanvasElement.prototype.getContext).toBe(original);
  });

  it('preserves a wrapper installed later by the page', () => {
    const original = HTMLCanvasElement.prototype.getContext;
    const spy = new CanvasSpy();
    const later = original.bind(HTMLCanvasElement.prototype);
    try {
      HTMLCanvasElement.prototype.getContext = later;
      spy.dispose();
      expect(HTMLCanvasElement.prototype.getContext).toBe(later);
    } finally {
      HTMLCanvasElement.prototype.getContext = original;
    }
  });
});
