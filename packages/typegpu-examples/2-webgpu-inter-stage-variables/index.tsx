import { Resizable, ResizableHandle, ResizablePanel } from '@app-game/components/ui/resizable';
import { Meta, Title } from '@solidjs/meta';
import { createEffect, createSignal, JSX } from 'solid-js';
import tgpu from 'typegpu';
import * as d from 'typegpu/data';
import * as std from 'typegpu/std';
import { TypeGPUProvider, useTypeGPU } from '../utils/TypeGPU';

type Examples = 'threeColors' | 'checkerboard';

export default function WebGPUInterStageVariables() {
  const [selectedExample, setSelectedExample] = createSignal<Examples>('checkerboard');
  return (
    <>
      <Title>WebGPU Inter-stage Variables</Title>
      <Meta name="description" content="" />
      <div class="flex flex-col place-content-start gap-2 p-2">
        <a href="https://webgpufundamentals.org/webgpu/lessons/webgpu-inter-stage-variables">
          WebGPU Inter-stage Variables
        </a>
        <select
          class="place-self-start border bg-blue-100 p-1"
          value={selectedExample()}
          onInput={(e) => setSelectedExample(e.currentTarget.value as Examples)}
        >
          <option value="threeColors">Three Colors</option>
          <option value="checkerboard">Checkerboard</option>
        </select>
        <ResizeContainer>
          <TypeGPUProvider class="aspect-square w-full">
            <App selectedExample={selectedExample()} />
          </TypeGPUProvider>
        </ResizeContainer>
      </div>
    </>
  );
}

function ResizeContainer(props: { children: JSX.Element }) {
  return (
    <Resizable class="flex-1 overflow-hidden border-0">
      <ResizablePanel class="flex w-0 flex-grow flex-col overflow-hidden border-0" initialSize={0.3} minSize={0.1}>
        {props.children}
      </ResizablePanel>
      <ResizableHandle withHandle orientation="vertical" class="border-0 bg-inherit hover:bg-blue-400" />
      <ResizablePanel initialSize={0.7} />
    </Resizable>
  );
}

const threeColors = (() => {
  const OurVertexShaderOutput = { pos: d.builtin.position, color: d.location(0, d.vec4f) } as const;

  const vertex = tgpu['~unstable'].vertexFn({
    in: { vertexIndex: d.builtin.vertexIndex },
    out: OurVertexShaderOutput
  })(({ vertexIndex }) => {
    'use gpu';
    const pos = [d.vec2f(0, 0.5), d.vec2f(-0.5, -0.5), d.vec2f(0.5, -0.5)];
    const color = [
      d.vec4f(1, 0, 0, 1), // red
      d.vec4f(0, 1, 0, 1), // green
      d.vec4f(0, 0, 1, 1) // blue
    ];

    return { pos: d.vec4f(pos[vertexIndex], 0, 1), color: color[vertexIndex] };
  });

  const fragment = tgpu['~unstable'].fragmentFn({
    in: OurVertexShaderOutput,
    out: d.vec4f
  })(({ color }) => {
    'use gpu';
    return color;
  });

  return { vertex, fragment };
})();

const checkerboard = (() => {
  const OurVertexShaderOutput = { pos: d.builtin.position } as const;

  const vertex = tgpu['~unstable'].vertexFn({
    in: { vertexIndex: d.builtin.vertexIndex },
    out: OurVertexShaderOutput
  })(({ vertexIndex }) => {
    'use gpu';
    const pos = [d.vec2f(0, 0.5), d.vec2f(-0.5, -0.5), d.vec2f(0.5, -0.5)];

    return { pos: d.vec4f(pos[vertexIndex], 0, 1) };
  });

  // With WGSL string
  const fragment1 = tgpu['~unstable'].fragmentFn({
    in: OurVertexShaderOutput,
    out: d.vec4f
  }) /* wgsl */ `{
    let red = vec4f(1, 0, 0, 1);
    let cyan = vec4f(0, 1, 1, 1);

    let grid = vec2u(in.pos.xy) / 8;
    let checker = (grid.x + grid.y) % 2 == 1;

    return select(red, cyan, checker);
  }`;

  // With TypeGPU functions and std
  const fragment2 = tgpu['~unstable'].fragmentFn({
    in: OurVertexShaderOutput,
    out: d.vec4f
  })(({ pos }) => {
    'use gpu';
    const red = d.vec4f(1, 0, 0, 1);
    const cyan = d.vec4f(0, 1, 1, 1);
    const grid = std.div(d.vec2u(pos.xy), 8);
    const checker = (grid.x + grid.y) % 2 == 1;
    return std.select(red, cyan, checker);
  });

  return { vertex, fragment1, fragment2 };
})();

function App(props: { selectedExample: Examples }) {
  const { root, context, presentationFormat, size } = useTypeGPU();

  const pipelineThreeColors = root['~unstable']
    .withVertex(threeColors.vertex, {})
    .withFragment(threeColors.fragment, { format: presentationFormat })
    .createPipeline();

  const pipelineCheckerboard = root['~unstable']
    .withVertex(checkerboard.vertex, {})
    .withFragment(checkerboard.fragment2, { format: presentationFormat })
    .createPipeline();

  const options = {
    threeColors: pipelineThreeColors,
    checkerboard: pipelineCheckerboard
  } as const;

  createEffect(() => {
    size();

    const pipeline = options[props.selectedExample];

    pipeline
      .withColorAttachment({
        view: context.getCurrentTexture().createView(),
        clearValue: d.vec4f(0, 0, 0, 1),
        loadOp: 'clear',
        storeOp: 'store'
      })
      .draw(3);
  });

  return null;
}
