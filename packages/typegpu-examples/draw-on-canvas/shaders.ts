import tgpu from 'typegpu';
import * as d from 'typegpu/data';
import * as std from 'typegpu/std';

export const shaders = () => {
  const layout = tgpu.bindGroupLayout({
    transform: { uniform: d.mat3x3f },
    resolution: { uniform: d.vec2f },
    texture: { texture: d.texture2d() },
    sampler: { sampler: 'filtering' }
  });

  const vertex = tgpu['~unstable'].vertexFn({
    in: { vertexIndex: d.builtin.vertexIndex },
    out: { pos: d.builtin.position, texcoord: d.vec2f }
  })(({ vertexIndex }) => {
    'use gpu';
    const pos = [
      // 1st triangle
      d.vec2f(0, 0), // center
      d.vec2f(100, 0), // right, center
      d.vec2f(0, 100), // center, top

      // 2nd triangle
      d.vec2f(0, 100), // center, top
      d.vec2f(100, 0), // right, center
      d.vec2f(100, 100) // right, top
    ];

    const xy = pos[vertexIndex];
    const flip = d.vec2f(1, -1);

    const position = std.mul(layout.$.transform, d.vec3f(xy, 1.0)).xy;
    const zeroToOne = std.div(position, layout.$.resolution);
    const zeroToTwo = std.mul(zeroToOne, 2);
    const flippedClipSpace = std.sub(zeroToTwo, 1);
    const clipSpace = std.mul(flippedClipSpace, d.vec2f(1, -1));

    return {
      pos: d.vec4f(clipSpace, 0.0, 1.0),
      texcoord: std.mul(xy, flip)
    };
  });

  const fragment = tgpu['~unstable'].fragmentFn({
    in: { pos: d.builtin.position, texcoord: d.vec2f },
    out: d.vec4f
  })(({ texcoord }) => {
    'use gpu';

    return std.textureSample(layout.$.texture, layout.$.sampler, texcoord);
  });

  return { vertex, fragment, bindGroupLayout: layout };
};
