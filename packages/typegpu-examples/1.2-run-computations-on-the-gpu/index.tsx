import { Meta, Title } from '@solidjs/meta';
import { createEffect, createResource } from 'solid-js';
import tgpu from 'typegpu';
import * as d from 'typegpu/data';
import { TypeGPUProvider, useTypeGPU } from '../utils/TypeGPU';

export default function WebGPUFundamentals() {
  return (
    <>
      <Title>Run computations on the GPU</Title>
      <Meta
        name="description"
        content="This example shows how to upload uniform data every frame to render a rotating object."
      />
      <div id="fail">
        <div class="content">
          <a href="https://webgpufundamentals.org/webgpu/lessons/webgpu-fundamentals.html#a-run-computations-on-the-gpu">
            Run computations on the GPU
          </a>
        </div>
      </div>
      <TypeGPUProvider class="max-w-600px aspect-square w-full">
        <App />
      </TypeGPUProvider>
    </>
  );
}

function App() {
  const { root } = useTypeGPU();

  const dataBuffer = root.createBuffer(d.arrayOf(d.f32, 4)).$usage('storage');
  const dataStorage = dataBuffer.as('mutable');

  /**
   * Vertex shader that outputs a triangle.
   * ```wgsl
   * @group(0) @binding(0) var<storage, read_write> data: array<f32>;
   *
   * @compute @workgroup_size(1) fn computeSomething(
   *   @builtin(global_invocation_id) id: vec3u
   * ) {
   *   let i = id.x;
   *   data[i] = data[i] * 2.0;
   * }
   * ```
   */
  const computeSomething = tgpu['~unstable'].computeFn({
    in: { id: d.builtin.globalInvocationId },
    workgroupSize: [1]
  }) /* wgsl */ `{
      let i = in.id.x;
      data[i] = data[i] * 2.0;
      }`.$uses({
    data: dataStorage
  });

  const pipeline = root['~unstable'].withCompute(computeSomething).createPipeline();

  const input = [1, 2, 3, 4];
  const [data] = createResource(input, async (input) => {
    dataBuffer.write(input);
    pipeline.dispatchWorkgroups(input.length);

    return await dataBuffer.read();
  });

  createEffect(() => {
    console.log('Data after compute shader: ', data());
  });

  (async () => {
    const pointsMutable = root.createMutable(d.arrayOf(d.vec2i, 1000));

    console.log('Points before compute shader: ', (await pointsMutable.read()).flat());

    const pipeline = root['~unstable'].createGuardedComputePipeline((x) => {
      'use gpu';
      // Access and modify the fixed buffer directly
      pointsMutable.$[x] = d.vec2i(50, 50);
    });

    pipeline.dispatchThreads(100);

    console.log('Points after compute shader: ', (await pointsMutable.read()).flat());
  })();

  return (
    <>
      <h2>Input Data</h2>
      <pre>{JSON.stringify(input, null, 2)}</pre>
      <h2>Output Data</h2>
      <pre>{JSON.stringify(data(), null, 2)}</pre>
    </>
  );
}
