import { describe, expect, it } from 'vitest';
import { attributeInfluencesPosition } from './meshCapture';

describe('mesh position attribute detection', () => {
  it('follows simple shader assignments into gl_Position', () => {
    const source = `
      in vec3 a;
      in vec3 b;
      void main() {
        vec3 localPosition = a;
        vec3 normalDirection = b;
        vec4 transformed = vec4(localPosition, 1.0);
        gl_Position = projection * transformed;
      }
    `;

    expect(attributeInfluencesPosition('a', source)).toBe(true);
    expect(attributeInfluencesPosition('b', source)).toBe(false);
  });
});
