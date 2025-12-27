import tgpu, { TgpuRoot } from 'typegpu';
import * as d from 'typegpu/data';
import * as std from 'typegpu/std';

export function createBrushShader() {
  const layout = tgpu.bindGroupLayout({
    color: { uniform: d.vec3f }
  });

  const vertex = tgpu['~unstable'].vertexFn({
    in: {
      uv: d.vec2f,
      position: d.vec2f
    },
    out: { vUv: d.vec2f, pos: d.builtin.position }
  })(({ uv, position }) => {
    'use gpu';
    return {
      vUv: uv,
      pos: d.vec4f(position, 0, 1)
    };
  });

  const fragment = tgpu['~unstable'].fragmentFn({
    in: { vUv: d.vec2f },
    out: d.vec4f
  })(({ vUv }) => {
    'use gpu';

    const mouse = d.vec2f(0.5, 0.5);
    const cursor = std.sub(vUv, mouse);
    const fallof = std.smoothstep(0.5, 0, std.length(cursor));

    const brushColor = d.vec4f(layout.$.color, 1.0);
    const brush = std.mix(d.vec4f(brushColor.xyz, 0), brushColor, fallof);

    return brush;
  });

  return { vertex, fragment, layout };
}

export function createBrushPipeline({
  root,
  presentationFormat
}: {
  root: TgpuRoot;
  presentationFormat: GPUTextureFormat;
}) {
  const { vertex, fragment, layout } = createBrushShader();

  const vertexShema = d.arrayOf(
    d.struct({
      position: d.vec2f,
      uv: d.vec2f
    })
  );

  const vertexLayout = tgpu.vertexLayout(vertexShema, 'vertex');

  const pipeline = root['~unstable']
    .withVertex(vertex, {
      uv: vertexLayout.attrib.uv,
      position: vertexLayout.attrib.position
    })
    .withFragment(fragment, { format: presentationFormat })
    .createPipeline();

  const color = root.createUniform(d.vec3f, d.vec3f(1, 0, 0));
  const bindGroup = root.createBindGroup(layout, {
    color: color.buffer
  });

  const vertexBuffer = root
    .createBuffer(vertexShema(6), [
      { position: d.vec2f(-1, -1), uv: d.vec2f(0, 0) },
      { position: d.vec2f(1, -1), uv: d.vec2f(1, 0) },
      { position: d.vec2f(-1, 1), uv: d.vec2f(0, 1) },
      { position: d.vec2f(-1, 1), uv: d.vec2f(0, 1) },
      { position: d.vec2f(1, -1), uv: d.vec2f(1, 0) },
      { position: d.vec2f(1, 1), uv: d.vec2f(1, 1) }
    ])
    .$usage('vertex');

  const indexBuffer = root.createBuffer(d.arrayOf(d.u32)(6), [0, 1, 2, 3, 4, 5]).$usage('index');

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
        pass.setBindGroup(layout, bindGroup);
        pass.setVertexBuffer(vertexLayout, vertexBuffer);
        pass.setIndexBuffer(indexBuffer, 'uint32');
        pass.drawIndexed(6);
      }
    );
  }

  return { render, color };
}
