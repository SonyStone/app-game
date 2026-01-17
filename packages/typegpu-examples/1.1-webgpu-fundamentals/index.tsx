import { Meta, Title } from '@solidjs/meta';
import { createEffect } from 'solid-js';
import tgpu from 'typegpu';
import { builtin, vec2f, vec4f } from 'typegpu/data';
import { TypeGPUProvider, useTypeGPU } from '../utils/TypeGPU';

export default function WebGPUFundamentals() {
  return (
    <>
      <Title>WebGPU Fundamentals</Title>
      <Meta
        name="description"
        content="This example shows how to upload uniform data every frame to render a rotating object."
      />
      <div id="fail">
        <div class="content">
          <a href="https://webgpufundamentals.org/webgpu/lessons/webgpu-fundamentals.html">WebGPU Fundamentals</a>
          <p>Learn the basics of WebGPU and how to use it effectively.</p>

          <p>The examples are done with using Solid.js and TypeGPU.</p>
        </div>
      </div>
      <TypeGPUProvider class="max-w-600px aspect-square w-full">
        <App />
      </TypeGPUProvider>
    </>
  );
}

/**
 * Vertex shader that outputs a triangle.
 * ```wgsl
 * @vertex fn vs(
 *   @builtin(vertex_index) vertexIndex : u32
 * ) -> @builtin(position) vec4f {
 *   let pos = array(
 *     vec2f( 0.0,  0.5),  // top center
 *     vec2f(-0.5, -0.5),  // bottom left
 *     vec2f( 0.5, -0.5)   // bottom right
 *   );
 *
 *   return vec4f(pos[vertexIndex], 0.0, 1.0);
 * }
 * ```
 */
const vertex = tgpu['~unstable'].vertexFn({
  in: { vertexIndex: builtin.vertexIndex },
  out: { pos: builtin.position }
})(({ vertexIndex }) => {
  'use gpu';
  const pos = [vec2f(0, 0.5), vec2f(-0.5, -0.5), vec2f(0.5, -0.5)];

  return { pos: vec4f(pos[vertexIndex], 0, 1) };
});

/**
 * Fragment shader that outputs a green color.
 * ```wgsl
 * @fragment fn fs() -> @location(0) vec4f {
 *   return vec4f(0.0, 1.0, 0.0, 1.0); // green
 * }
 * ```
 */
const fragment = tgpu['~unstable'].fragmentFn({
  out: vec4f
})(() => {
  'use gpu';
  return vec4f(0, 1, 0, 1);
});

function App() {
  const { root, context, presentationFormat, size } = useTypeGPU();

  const pipeline = root['~unstable']
    .withVertex(vertex, {})
    .withFragment(fragment, { format: presentationFormat })
    .createPipeline();

  createEffect(() => {
    size();
    pipeline
      .withColorAttachment({
        view: context.getCurrentTexture().createView(),
        clearValue: vec4f(0, 0, 0, 1),
        loadOp: 'clear',
        storeOp: 'store'
      })
      .draw(3);
  });

  return null;
}
