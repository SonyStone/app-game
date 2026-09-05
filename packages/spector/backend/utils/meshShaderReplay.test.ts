import { describe, expect, it } from 'vitest';
import {
  findClipTransformInverse,
  findViewTransformInverse,
  transformClipPositions,
  transformPositions
} from './meshShaderReplay';

describe('mesh vertex shader replay coordinates', () => {
  it('selects and inverts a projection matrix that feeds gl_Position', () => {
    const projection = [2, 0, 0, 0, 0, 3, 0, 0, 0, 0, -1, -1, 0, 0, -2, 0];
    const inverse = findClipTransformInverse(
      'void main() { vec4 projected = projection * vec4(position, 1.0); gl_Position = projected; }',
      [{ name: 'projection', type: 'FLOAT_MAT4', value: projection }]
    );

    expect(inverse?.name).toBe('projection');
    expect(transformClipPositions(new Float32Array([2, 6, 3, 5]), inverse?.value)).toEqual([1, 2, -5]);
  });

  it('falls back to normalized device coordinates without an inverse transform', () => {
    expect(transformClipPositions(new Float32Array([2, 4, 6, 2]))).toEqual([1, 2, 3]);
  });

  it('rejects object-specific MVP matrices when shared view space is required', () => {
    const mvp = [2, 0, 0, 0, 0, 3, 0, 0, 0, 0, -1, -1, 0, 0, -2, 0];

    expect(
      findClipTransformInverse(
        'void main() { gl_Position = mvp * position; }',
        [{ name: 'modelViewProjection', type: 'FLOAT_MAT4', value: mvp }],
        'shared-view'
      )
    ).toBeUndefined();
  });

  it('accepts a camera projection matrix for shared view space', () => {
    const projection = [2, 0, 0, 0, 0, 3, 0, 0, 0, 0, -1, -1, 0, 0, -2, 0];

    expect(
      findClipTransformInverse(
        'void main() { gl_Position = projection * viewPosition; }',
        [{ name: 'projection', type: 'FLOAT_MAT4', value: projection }],
        'shared-view'
      )?.name
    ).toBe('projection');
  });

  it('derives inverse view from separate model and model-view matrices', () => {
    const model = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 10, 0, 0, 1];
    const modelView = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 7, -2, -4, 1];
    const inverse = findViewTransformInverse([
      { name: 'uModelMatrix', type: 'FLOAT_MAT4', value: model },
      { name: 'uModelViewMatrix', type: 'FLOAT_MAT4', value: modelView }
    ]);

    expect(inverse?.name).toBe('uModelMatrix * inverse(uModelViewMatrix)');
    expect(transformPositions([-3, -2, -4], inverse!.value)).toEqual([0, 0, 0]);
  });
});
