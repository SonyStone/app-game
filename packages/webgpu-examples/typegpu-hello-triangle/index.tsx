import createRAF from '@solid-primitives/raf';
import { createEffect, createSignal, onCleanup, Show } from 'solid-js';
import tgpu from 'typegpu';
import { builtin, vec2f, vec4f } from 'typegpu/data';
import { GPUCanvasContextProvider, useGPUCanvasContext } from '../utils/GPUCanvasContextProvider';
import { TGPURootProvider, useTGPURoot } from '../utils/TGPURootProvider';
import { useWebGPU, WebGPUProvider } from '../utils/WebGPUProvider';
import { AppStateProvider, useAppState } from './AppStateProvider';

export default function HelloTriangle() {
  return (
    <div class="flex items-center gap-2 p-2">
      <WebGPUProvider>
        <TGPURootProvider loading={<div>Initializing TypeGPU...</div>}>
          <AppStateProvider>
            <SetupAppPipelines />
            <AppCanvas />
            <AppCanvas />
          </AppStateProvider>
        </TGPURootProvider>
      </WebGPUProvider>
    </div>
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

function SetupAppPipelines() {
  const gpu = useWebGPU();
  const root = useTGPURoot();
  const presentationFormat = gpu.getPreferredCanvasFormat();

  const redPipeline = root['~unstable']
    .withVertex(triangleVert, {})
    .withFragment(redFrag, { format: presentationFormat })
    .createPipeline();

  const bluePipeline = root['~unstable']
    .withVertex(triangleVert, {})
    .withFragment(blueFrag, { format: presentationFormat })
    .createPipeline();

  const appState = useAppState();
  appState.redPipeline = redPipeline;
  appState.bluePipeline = bluePipeline;

  return null;
}

function AppCanvas() {
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
        <App running={running()} />
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

function App(props: { running?: boolean }) {
  // Maybe make gpu, root and context as props?

  const gpu = useWebGPU();
  const root = useTGPURoot();
  const context = useGPUCanvasContext();
  const presentationFormat = gpu.getPreferredCanvasFormat();
  context.configure({
    device: root.device,
    format: presentationFormat,
    alphaMode: 'premultiplied'
  });

  const { redPipeline, bluePipeline } = useAppState();

  const render = (t: number) => {
    const isFirst = !!((t * 10) % 10);
    if (isFirst) {
      redPipeline
        ?.withColorAttachment({
          view: context.getCurrentTexture().createView(),
          clearValue: vec4f(0, 0, 0, 1),
          loadOp: 'clear',
          storeOp: 'store'
        })
        .draw(3);
    } else {
      bluePipeline
        ?.withColorAttachment({
          view: context.getCurrentTexture().createView(),
          clearValue: vec4f(0, 0, 0, 1),
          loadOp: 'clear',
          storeOp: 'store'
        })
        .draw(3);
    }
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
