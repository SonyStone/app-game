import tgpu from 'typegpu';
import * as d from 'typegpu/data';
import * as std from 'typegpu/std';

export function createBrushStrokeShaders() {
  const layout = tgpu.bindGroupLayout({
    uProjectionMatrix: { uniform: d.mat3x3f },
    uWorldTransformMatrix: { uniform: d.mat3x3f },
    brushTexture: { texture: d.texture2d() },
    brushSampler: { sampler: 'filtering' }
  });

  const vertex = tgpu['~unstable'].vertexFn({
    in: {
      uv: d.vec2f,
      position: d.vec2f,
      size: d.f32,
      offset: d.vec2f,
      opacity: d.f32
    },
    out: { vUv: d.vec2f, vOpacity: d.f32, vPosition: d.vec2f }
  })(({ uv, position, size, offset, opacity }) => {
    'use gpu';

    const modelMatrix = d.mat3x3f(1, 0, 0, 0, 1, 0, 0, 0, 1);
    const modelViewProjectionMatrix = std.mul(
      std.mul(layout.$.uProjectionMatrix, layout.$.uWorldTransformMatrix),
      modelMatrix
    );

    const coord = std.add(std.mul(std.div(position, 25), size), offset);

    return {
      vUv: uv,
      vOpacity: opacity,
      vPosition: coord,
      pos: d.vec4f(std.mul(modelViewProjectionMatrix, d.vec3f(coord, 1)).xy, 0, 1)
    };
  });

  const fragment = tgpu['~unstable'].fragmentFn({
    in: { vUv: d.vec2f, vOpacity: d.f32, vPosition: d.vec2f },
    out: d.vec4f
  })(({ vUv, vOpacity }) => {
    'use gpu';

    const colorBrush = std.textureSample(layout.$.brushTexture, layout.$.brushSampler, vUv);
    colorBrush.z = colorBrush.z * vOpacity;

    return colorBrush;
  });

  return { vertex, fragment, layout };
}
