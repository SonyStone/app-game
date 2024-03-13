import { Meta, Title } from '@solidjs/meta';
import { onCleanup } from 'solid-js';
import redFragWGSL from './red.frag.wgsl?raw';
import triangleVertWGSL from './triangle.vert.wgsl?raw';

/**
 * https://webgpu.github.io/webgpu-samples/samples/helloTriangle
 */
export default function HelloTriangle() {
  const canvas = (<canvas class="w-full aspect-square max-w-600px" />) as HTMLCanvasElement;

  let requestID: number;

  async function init() {
    const gpu = navigator.gpu;
    if (!gpu) {
      console.error('WebGPU is not supported');
      return;
    }
    const adapter = (await gpu.requestAdapter())!;
    const device = await adapter.requestDevice();
    const context = canvas.getContext('webgpu') as any as GPUCanvasContext;

    const devicePixelRatio = window.devicePixelRatio;
    canvas.width = canvas.clientWidth * devicePixelRatio;
    canvas.height = canvas.clientHeight * devicePixelRatio;
    const presentationFormat = gpu.getPreferredCanvasFormat();

    context.configure({
      device,
      format: presentationFormat,
      alphaMode: 'premultiplied'
    });

    const pipeline = device.createRenderPipeline({
      layout: 'auto',
      vertex: {
        module: device.createShaderModule({
          code: triangleVertWGSL
        }),
        entryPoint: 'main'
      },
      fragment: {
        module: device.createShaderModule({
          code: redFragWGSL
        }),
        entryPoint: 'main',
        targets: [
          {
            format: presentationFormat
          }
        ]
      },
      primitive: {
        topology: 'triangle-list'
      }
    });

    function frame() {
      const commandEncoder = device.createCommandEncoder();
      const textureView = context.getCurrentTexture().createView();

      const renderPassDescriptor: GPURenderPassDescriptor = {
        colorAttachments: [
          {
            view: textureView,
            clearValue: { r: 0.0, g: 0.0, b: 0.0, a: 1.0 },
            loadOp: 'clear',
            storeOp: 'store'
          }
        ]
      };

      const passEncoder = commandEncoder.beginRenderPass(renderPassDescriptor);
      passEncoder.setPipeline(pipeline);
      passEncoder.draw(3);
      passEncoder.end();

      device.queue.submit([commandEncoder.finish()]);
      requestID = requestAnimationFrame(frame);
    }

    requestID = requestAnimationFrame(frame);
  }

  init();

  onCleanup(() => {
    cancelAnimationFrame(requestID);
  });

  return (
    <>
      <Title>Hello Triangle</Title>
      <Meta name="description" content="Shows rendering a basic triangle." />
      {canvas}
    </>
  );
}
