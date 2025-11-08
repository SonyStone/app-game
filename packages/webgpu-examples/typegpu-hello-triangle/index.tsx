import createRAF from '@solid-primitives/raf';
import { Show, untrack } from 'solid-js';
import tgpu from 'typegpu';
import { builtin, vec2f, vec4f } from 'typegpu/data';
import { TGPURootProvider, useTGPURoot } from '../utils/TGPURootProvider';

export default function HelloTriangle() {
  return (
    <Show when={navigator.gpu} fallback={<div>WebGPU not supported</div>}>
      <TGPURootProvider>
        <App />
      </TGPURootProvider>
    </Show>
  );
}

const triangleVert = tgpu['~unstable'].vertexFn({
  in: { vertexIndex: builtin.vertexIndex },
  out: { pos: builtin.position }
})(({ vertexIndex }) => {
  'use gpu';
  const pos = [vec2f(0, 0.5), vec2f(-0.5, -0.5), vec2f(0.5, -0.5)];

  return { pos: vec4f(pos[vertexIndex], 0, 1) };
});

const redFrag = tgpu['~unstable'].fragmentFn({
  out: vec4f
})(() => {
  'use gpu';
  return vec4f(1, 0, 0, 1);
});

const blueFrag = tgpu['~unstable'].fragmentFn({
  out: vec4f
})(() => {
  'use gpu';
  return vec4f(0, 0, 1, 1);
});

function App() {
  if (!navigator.gpu) {
    return <div>WebGPU not supported</div>;
  }

  const root = useTGPURoot();
  const canvas = (<canvas class="max-w-600px aspect-square w-full" />) as HTMLCanvasElement;
  const context = canvas.getContext('webgpu') as GPUCanvasContext;
  const presentationFormat = navigator.gpu.getPreferredCanvasFormat();
  context.configure({
    device: root.device,
    format: presentationFormat,
    alphaMode: 'premultiplied'
  });

  const redPipeline = root['~unstable']
    .withVertex(triangleVert, {})
    .withFragment(redFrag, { format: presentationFormat })
    .createPipeline();

  const bluePipeline = root['~unstable']
    .withVertex(triangleVert, {})
    .withFragment(blueFrag, { format: presentationFormat })
    .createPipeline();

  const [running, start, stop] = createRAF((t: number) => {
    const isFirst = !!((t * 10) % 10);
    if (isFirst) {
      redPipeline
        .withColorAttachment({
          view: context.getCurrentTexture().createView(),
          clearValue: vec4f(0, 0, 0, 1),
          loadOp: 'clear',
          storeOp: 'store'
        })
        .draw(3);
    } else {
      bluePipeline
        .withColorAttachment({
          view: context.getCurrentTexture().createView(),
          clearValue: vec4f(0, 0, 0, 1),
          loadOp: 'clear',
          storeOp: 'store'
        })
        .draw(3);
    }
  });
  start();

  return (
    <div class="flex flex-col items-center gap-2 p-2">
      <button class="rounded bg-blue-500 px-4 py-2 text-white" onClick={() => (untrack(running) ? stop() : start())}>
        Toggle {running() ? '⏸️' : '▶️'}
      </button>
      {canvas}
    </div>
  );
}
