import { Meta, Title } from '@solidjs/meta';
import { createEffect } from 'solid-js';
import tgpu, { RenderFlag, SampledFlag, TgpuTexture } from 'typegpu';
import { builtin, vec2f, vec4f } from 'typegpu/data';
import { ResizeContainer } from '../ui/ResizeContainer';
import { TypeGPUProvider, useTypeGPU } from '../utils/TypeGPU';

export default function WebGPUMultisampling() {
  return (
    <>
      <Title>WebGPU Multisampling</Title>
      <Meta name="description" content="This example demonstrates how to implement multisampling in WebGPU." />
      <div class="flex flex-col place-content-start gap-2 p-2">
        <div class="content">
          <a href="https://webgpufundamentals.org/webgpu/lessons/webgpu-multisampling.html">WebGPU Multisampling</a>
          <p>
            This lesson covers the concept of multisampling in WebGPU, which is a technique used to improve the visual
            quality of rendered images by reducing aliasing artifacts.
          </p>

          <p>The examples are done with using Solid.js and TypeGPU.</p>
        </div>
        <ResizeContainer>
          <TypeGPUProvider class="image-render-pixel aspect-square w-full">
            <App />
          </TypeGPUProvider>
        </ResizeContainer>
      </div>
    </>
  );
}

const shaderCode = {
  vertex: tgpu['~unstable'].vertexFn({
    in: { vertexIndex: builtin.vertexIndex },
    out: { pos: builtin.position }
  })(({ vertexIndex }) => {
    'use gpu';
    const pos = [
      vec2f(0, 0.5), // top center
      vec2f(-0.5, -0.5), // bottom left
      vec2f(0.5, -0.5) // bottom right
    ];

    return { pos: vec4f(pos[vertexIndex], 0, 1) };
  }),

  fragment: tgpu['~unstable'].fragmentFn({
    out: vec4f
  })(() => {
    'use gpu';
    return vec4f(0, 1, 0, 1);
  })
} as const;

function App() {
  const { root, context, presentationFormat, size } = useTypeGPU();

  const pipeline = root['~unstable']
    .withVertex(shaderCode.vertex, {})
    .withFragment(shaderCode.fragment, { format: presentationFormat })
    .withMultisample({ count: 4 })
    .createPipeline();

  let multisampleTexture:
    | (TgpuTexture<{
        size: [number, number];
        format: GPUTextureFormat;
        sampleCount: 4;
      }> &
        SampledFlag &
        RenderFlag)
    | undefined = undefined;

  createEffect(() => {
    size();

    const canvasTexture = context.getCurrentTexture();

    if (
      !multisampleTexture ||
      multisampleTexture.props.size[0] !== canvasTexture.width ||
      multisampleTexture.props.size[1] !== canvasTexture.height
    ) {
      if (multisampleTexture) {
        multisampleTexture.destroy();
      }

      multisampleTexture = root['~unstable']
        .createTexture({
          format: canvasTexture.format,
          dimension: '2d',
          size: [canvasTexture.width, canvasTexture.height],
          sampleCount: 4
        })
        .$usage('sampled', 'render');
    }

    const sampledView = multisampleTexture.createView();

    pipeline
      .withColorAttachment({
        view: sampledView,
        resolveTarget: canvasTexture.createView(),
        clearValue: vec4f(0.3, 0.3, 0.3, 1),
        loadOp: 'clear',
        storeOp: 'store'
      })
      .draw(3);
  });

  return null;
}
