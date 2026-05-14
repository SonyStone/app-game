import createRAF from '@solid-primitives/raf';
import { withWrapper } from '@utils/withProviders';
import { createEffect, createSignal, onCleanup, Show } from 'solid-js';
import tgpu from 'typegpu';
import { builtin, vec2f, vec4f } from 'typegpu/data';
import { GPUProvider, useGPU } from '../utils/GPU.provider';
import { GPUCanvasContextProvider } from '../utils/GPUCanvasContext.provider';
import { TypeGPUCanvasContextProvider, useTypeGPUCanvasContext } from '../utils/TypeGPUCanvasContext.provider';
import { TypeGPURootProvider, useTypeGPURoot } from '../utils/TypeGPURoot.provider';

export default withWrapper((props) => (
  <div class="flex items-center gap-2 p-2">
    <GPUProvider>
      <TypeGPURootProvider loading={<div>Initializing TypeGPU...</div>}>{props.children}</TypeGPURootProvider>
    </GPUProvider>
  </div>
))(function HelloTriangle() {
  const gpu = useGPU();
  const root = useTypeGPURoot();
  const presentationFormat = gpu.getPreferredCanvasFormat();

  const redPipeline = root['~unstable']
    .withVertex(triangleVert, {})
    .withFragment(redFrag, { format: presentationFormat })
    .createPipeline();

  const bluePipeline = root['~unstable']
    .withVertex(triangleVert, {})
    .withFragment(blueFrag, { format: presentationFormat })
    .createPipeline();

  const renderRedPipeline = (view: GPUTextureView) => {
    redPipeline
      .withColorAttachment({
        view,
        clearValue: vec4f(0, 0, 0, 1),
        loadOp: 'clear',
        storeOp: 'store'
      })
      .draw(3);
  };

  const renderBluePipeline = (view: GPUTextureView) => {
    bluePipeline
      .withColorAttachment({
        view,
        clearValue: vec4f(0, 0, 0, 1),
        loadOp: 'clear',
        storeOp: 'store'
      })
      .draw(3);
  };

  return (
    <>
      <AppCanvas render={renderRedPipeline} />
      <AppCanvas render={renderBluePipeline} />
    </>
  );
});

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

function AppCanvas(props: { render?: (view: GPUTextureView) => void }) {
  const [running, setRunning] = createSignal(false);
  const [show, setShow] = createSignal(true);
  const [canvasRef, setCanvasRef] = createSignal<HTMLCanvasElement | undefined>();

  return (
    <div class="flex flex-1 flex-col gap-2">
      <div class="flex gap-2">
        <button class="rounded bg-blue-500 px-4 py-2 text-white" onClick={() => setRunning(!running())}>
          Toggle {running() ? '⏸️' : '▶️'}
        </button>
        <button class="rounded bg-red-500 px-4 py-2 text-white" onClick={() => setShow(!show())}>
          Toggle Canvas
        </button>
      </div>
      <GPUCanvasContextProvider
        canvas={canvasRef()}
        noCanvas={<div class="max-w-600px aspect-square w-full border">No canvas element provided</div>}
      >
        <TypeGPUCanvasContextProvider>
          <App running={running()} render={props.render} />
        </TypeGPUCanvasContextProvider>
      </GPUCanvasContextProvider>
      <Show when={show()}>
        <canvas
          class="max-w-600px aspect-square w-full border"
          ref={(ref) => {
            setCanvasRef(ref);
            onCleanup(() => setCanvasRef(undefined));
          }}
        />
      </Show>
    </div>
  );
}

function App(props: { running?: boolean; render?: (view: GPUTextureView) => void }) {
  // Maybe make gpu, root and context as props?

  const context = useTypeGPUCanvasContext();

  const render = (t: number) => {
    props.render?.(context.getCurrentTexture().createView());
  };

  const [running, start, stop] = createRAF(render);

  createEffect(() => {
    if (props.running) {
      start();
    } else {
      stop();
    }
  });
  render(0);

  return null;
}
