import { createResizeObserver } from '@solid-primitives/resize-observer';
import { Meta, Title } from '@solidjs/meta';
import { createSignal, For, onCleanup, onSettled } from 'solid-js';
import code from './lesson-1-fundamentals.wgsl?raw';

export default function Lesson1Fundamentals() {
  const canvas = (<canvas class="aspect-square w-full" />) as HTMLCanvasElement;
  let device: GPUDevice | undefined;
  let render: () => void;

  type LogEntry = { kind: 'error' | 'info'; message: string };
  const [logs, setLogs] = createSignal<LogEntry[]>([], { ownedWrite: true });
  const addLog = (entry: LogEntry) => {
    setLogs((current) => [...current, entry]);
  };

  onSettled(() => {
    void (async () => {
      // 1. start off by requesting an adapter, and then requesting a device from the adapter.
      const adapter = await navigator.gpu?.requestAdapter({ powerPreference: 'high-performance' });
      const info = adapter?.info; // new API to get adapter info
      addLog({
        kind: 'info',
        message: `WebGPU adapter vendor: ${info?.vendor ?? 'unknown'}, architecture: ${info?.architecture ?? 'unknown'}`
      });
      device = await adapter?.requestDevice(); // GPUDevice object representing a connection to the physical or software device.
      if (!device) {
        addLog({ kind: 'error', message: 'WebGPU is not supported' });
        return;
      }

      {
        const { width, height } = canvas.getBoundingClientRect();
        canvas.width = Math.max(1, Math.min(width, device.limits.maxTextureDimension2D));
        canvas.height = Math.max(1, Math.min(height, device.limits.maxTextureDimension2D));
      }

      // 2. Next, we look up the canvas and create a webgpu context for it
      const context = canvas.getContext('webgpu')!;
      const presentationFormat = navigator.gpu?.getPreferredCanvasFormat();
      if (!presentationFormat) {
        addLog({ kind: 'error', message: 'WebGPU is not supported' });
        return { context, presentationFormat };
      }
      context.configure({
        device,
        format: presentationFormat
      });
      // 3. Next, we create a shader module
      const module = device.createShaderModule({
        label: 'our hardcoded red triangle shaders',
        code: code
      });

      // 4. Now that we’ve created a shader module, we next need to make a render pipeline
      const pipeline = device.createRenderPipeline({
        label: 'our hardcoded red triangle pipeline',
        layout: 'auto',
        vertex: {
          // entryPoint: 'vertexShader',
          module: module
        },
        fragment: {
          // entryPoint: 'fragmentShader',
          module: module,
          targets: [{ format: presentationFormat }]
        }
      });

      // 5. Next up we prepare a `GPURenderPassDescriptor` which describes which textures we want to draw to and how to use them.
      const renderPassDescriptor: GPURenderPassDescriptor = {
        label: 'our basic canvas renderPass',
        colorAttachments: [
          {
            view: undefined!, // <- to be filled out when we render
            clearValue: [0.3, 0.3, 0.3, 1],
            loadOp: 'clear',
            storeOp: 'store'
          }
        ]
      };

      // 6. Now it’s time to render.
      render = () => {
        const colorAttachments = renderPassDescriptor.colorAttachments as Array<
          GPURenderPassColorAttachment | null | undefined
        >;

        // Get the current texture from the canvas context and
        // set it as the texture to render to.
        colorAttachments[0]!.view = context.getCurrentTexture().createView();

        // make a command encoder to start encoding commands
        const encoder = device!.createCommandEncoder({ label: 'our encoder' });

        // make a render pass encoder to encode render specific commands
        const pass = encoder.beginRenderPass(renderPassDescriptor);
        pass.setPipeline(pipeline);
        pass.draw(6); // call our vertex shader 3 times
        pass.end();

        const commandBuffer = encoder.finish();
        device!.queue.submit([commandBuffer]);
      };

      render();
    })();
  });

  createResizeObserver(canvas as unknown as Element, ({ width, height }) => {
    if (!device || !render) {
      return;
    }
    canvas.width = Math.max(1, Math.min(width, device.limits.maxTextureDimension2D));
    canvas.height = Math.max(1, Math.min(height, device.limits.maxTextureDimension2D));
    // re-render
    render();
  });

  onCleanup(() => {
    device?.destroy();
  });

  return (
    <>
      <Title>Lesson 1 Fundamentals</Title>
      <Meta name="description" content="https://webgpufundamentals.org/webgpu/lessons/webgpu-fundamentals.html" />

      {canvas}
      <div class="flex flex-col gap-1 p-4">
        <a class="text-blue underline" href="https://webgpufundamentals.org/webgpu/lessons/webgpu-fundamentals.html">
          WebGPU Fundamentals
        </a>
        <For each={logs()}>
          {(log) => <span class={log.kind === 'error' ? 'text-red-500' : 'text-blue-700'}>{log.message}</span>}
        </For>
      </div>
    </>
  );
}
