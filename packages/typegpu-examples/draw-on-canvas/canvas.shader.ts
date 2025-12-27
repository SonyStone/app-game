import tgpu, { TgpuRoot, TgpuTextureView } from 'typegpu';
import * as d from 'typegpu/data';
import * as std from 'typegpu/std';

export function createCanvasShader() {
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
      d.vec2f(1, 0), // right, center
      d.vec2f(0, 1), // center, top

      // 2nd triangle
      d.vec2f(0, 1), // center, top
      d.vec2f(1, 0), // right, center
      d.vec2f(1, 1) // right, top
    ];

    const xy = pos[vertexIndex];

    const position = std.mul(layout.$.transform, d.vec3f(xy, 1.0)).xy;
    const zeroToOne = std.div(position, layout.$.resolution);
    const zeroToTwo = std.mul(zeroToOne, 2);
    const flippedClipSpace = std.sub(zeroToTwo, 1);
    const clipSpace = std.mul(flippedClipSpace, d.vec2f(1, -1));

    return {
      pos: d.vec4f(clipSpace, 0.0, 1.0),
      texcoord: xy
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
}

export function createCanvasPipeline({
  root,
  presentationFormat,
  textureView
}: {
  root: TgpuRoot;
  presentationFormat: GPUTextureFormat;
  textureView: TgpuTextureView<d.WgslTexture2d<d.F32 | d.U32 | d.I32>>;
}) {
  const { vertex, fragment, bindGroupLayout } = createCanvasShader();

  const transform = root.createUniform(d.mat3x3f, d.mat3x3f(1, 0, 0, 0, 1, 0, 0, 0, 1));
  const resolution = root.createUniform(d.vec2f, d.vec2f());

  const pipeline = root['~unstable']
    .withVertex(vertex, {})
    .withFragment(fragment, { format: presentationFormat })
    .createPipeline();

  const bindGroup = root.createBindGroup(bindGroupLayout, {
    transform: transform.buffer,
    resolution: resolution.buffer,
    texture: textureView,
    sampler: root['~unstable'].createSampler({})
  });

  function render(target: GPUTextureView) {
    root['~unstable'].beginRenderPass(
      {
        colorAttachments: [
          {
            view: target,
            clearValue: d.vec4f(0, 0, 0, 1),
            loadOp: 'clear',
            storeOp: 'store'
          }
        ]
      },
      (pass) => {
        pass.setPipeline(pipeline);
        pass.setBindGroup(bindGroupLayout, bindGroup);
        pass.draw(6);
      }
    );
  }

  return { render, transform, resolution };
}
