import { Meta, Title } from '@solidjs/meta';
import { onCleanup, onMount } from 'solid-js';
import { mat4, vec3 } from 'wgpu-matrix';
import shaderSrc from './rotating-cube-2.wgsl?raw';

export default function RotatingCube2() {
  const canvas = (<canvas class="max-w-600px aspect-square w-full" />) as HTMLCanvasElement;

  onMount(() => {
    main(canvas);
  });

  return (
    <>
      <Title>Rotating Cube 2</Title>
      <Meta
        name="description"
        content="This example shows how to upload uniform data every frame to render a rotating object."
      />
      <div id="fail">
        <div class="content"></div>
      </div>
      {canvas}
    </>
  );
}

interface CanvasInfo {
  canvas: HTMLCanvasElement;
  context: GPUCanvasContext;
  presentationFormat: GPUTextureFormat;
  renderTarget: GPUTexture | undefined;
  renderTargetView: GPUTextureView | undefined;
  depthTexture: GPUTexture | undefined;
  depthTextureView: GPUTextureView | undefined;
  sampleCount: number;
}

async function main(canvas: HTMLCanvasElement) {
  const adapter = await navigator.gpu?.requestAdapter();
  const device = await adapter?.requestDevice();
  if (!device) {
    fail('need a browser that supports WebGPU');
    return;
  }

  const context = canvas.getContext('webgpu')!;

  const presentationFormat = (navigator.gpu!.getPreferredCanvasFormat as any)(adapter);
  context.configure({
    device,
    format: presentationFormat
  });

  const canvasInfo: CanvasInfo = {
    canvas,
    context,
    presentationFormat,
    // these are filled out in resizeToDisplaySize
    renderTarget: undefined,
    renderTargetView: undefined,
    depthTexture: undefined,
    depthTextureView: undefined,
    sampleCount: 4 // can be 1 or 4
  };

  function createBuffer(device: GPUDevice, data: Float32Array | Uint16Array, usage: number) {
    const buffer = device.createBuffer({
      size: data.byteLength,
      usage,
      mappedAtCreation: true
    });
    const dst = new (data as any).constructor(buffer.getMappedRange());
    dst.set(data);
    buffer.unmap();
    return buffer;
  }

  const positions = new Float32Array([
    1, 1, -1, 1, 1, 1, 1, -1, 1, 1, -1, -1, -1, 1, 1, -1, 1, -1, -1, -1, -1, -1, -1, 1, -1, 1, 1, 1, 1, 1, 1, 1, -1, -1,
    1, -1, -1, -1, -1, 1, -1, -1, 1, -1, 1, -1, -1, 1, 1, 1, 1, -1, 1, 1, -1, -1, 1, 1, -1, 1, -1, 1, -1, 1, 1, -1, 1,
    -1, -1, -1, -1, -1
  ]);
  const normals = new Float32Array([
    1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, -1, 0, 0, -1, 0, 0, -1, 0, 0, -1, 0, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0,
    -1, 0, 0, -1, 0, 0, -1, 0, 0, -1, 0, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, -1, 0, 0, -1, 0, 0, -1, 0, 0, -1
  ]);
  const texcoords = new Float32Array([
    1, 0, 0, 0, 0, 1, 1, 1, 1, 0, 0, 0, 0, 1, 1, 1, 1, 0, 0, 0, 0, 1, 1, 1, 1, 0, 0, 0, 0, 1, 1, 1, 1, 0, 0, 0, 0, 1, 1,
    1, 1, 0, 0, 0, 0, 1, 1, 1
  ]);
  const indices = new Uint16Array([
    0, 1, 2, 0, 2, 3, 4, 5, 6, 4, 6, 7, 8, 9, 10, 8, 10, 11, 12, 13, 14, 12, 14, 15, 16, 17, 18, 16, 18, 19, 20, 21, 22,
    20, 22, 23
  ]);

  const positionBuffer = createBuffer(device, positions, GPUBufferUsage.VERTEX);
  const normalBuffer = createBuffer(device, normals, GPUBufferUsage.VERTEX);
  const texcoordBuffer = createBuffer(device, texcoords, GPUBufferUsage.VERTEX);
  const indicesBuffer = createBuffer(device, indices, GPUBufferUsage.INDEX);

  const tex = device.createTexture({
    size: [2, 2, 1],
    format: 'rgba8unorm',
    usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST
  });
  device.queue.writeTexture(
    { texture: tex },
    new Uint8Array([255, 255, 128, 255, 128, 255, 255, 255, 255, 128, 255, 255, 255, 128, 128, 255]),
    { bytesPerRow: 8, rowsPerImage: 2 },
    { width: 2, height: 2 }
  );

  const sampler = device.createSampler({
    magFilter: 'nearest',
    minFilter: 'nearest'
  });

  const shaderModule = device.createShaderModule({ code: shaderSrc });

  const pipeline = device.createRenderPipeline({
    label: 'fake lighting',
    layout: 'auto',
    vertex: {
      module: shaderModule,
      buffers: [
        // position
        {
          arrayStride: 3 * 4, // 3 floats, 4 bytes each
          attributes: [{ shaderLocation: 0, offset: 0, format: 'float32x3' }]
        },
        // normals
        {
          arrayStride: 3 * 4, // 3 floats, 4 bytes each
          attributes: [{ shaderLocation: 1, offset: 0, format: 'float32x3' }]
        },
        // texcoords
        {
          arrayStride: 2 * 4, // 2 floats, 4 bytes each
          attributes: [{ shaderLocation: 2, offset: 0, format: 'float32x2' }]
        }
      ]
    },
    fragment: {
      module: shaderModule,
      targets: [{ format: presentationFormat }]
    },
    primitive: {
      topology: 'triangle-list',
      cullMode: 'back'
    },
    depthStencil: {
      depthWriteEnabled: true,
      depthCompare: 'less',
      format: 'depth24plus'
    },
    ...(canvasInfo.sampleCount > 1 && {
      multisample: {
        count: canvasInfo.sampleCount
      }
    })
  });

  const vUniformBufferSize = 2 * 16 * 4; // 2 mat4s * 16 floats per mat * 4 bytes per float
  const fUniformBufferSize = 3 * 4; // 1 vec3 * 3 floats per vec3 * 4 bytes per float

  const vsUniformBuffer = device.createBuffer({
    size: Math.max(16, vUniformBufferSize),
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
  });

  const fsUniformBuffer = device.createBuffer({
    size: Math.max(16, fUniformBufferSize),
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
  });
  const vsUniformValues = new Float32Array(2 * 16); // 2 mat4s
  const worldViewProjection = vsUniformValues.subarray(0, 16);
  const worldInverseTranspose = vsUniformValues.subarray(16, 32);
  const fsUniformValues = new Float32Array(3); // 1 vec3
  const lightDirection = fsUniformValues.subarray(0, 3);

  const bindGroup = device.createBindGroup({
    layout: pipeline.getBindGroupLayout(0),
    entries: [
      { binding: 0, resource: { buffer: vsUniformBuffer } },
      { binding: 1, resource: { buffer: fsUniformBuffer } },
      { binding: 2, resource: sampler },
      { binding: 3, resource: tex.createView() }
    ]
  });

  const renderPassDescriptor = {
    colorAttachments: [
      {
        // view: undefined, // Assigned later
        // resolveTarget: undefined, // Assigned Later
        clearValue: [0.5, 0.5, 0.5, 1],
        loadOp: 'clear',
        storeOp: 'store'
      } as unknown as GPURenderPassColorAttachment
    ],
    depthStencilAttachment: {
      // view: undefined,  // Assigned later
      depthClearValue: 1,
      depthLoadOp: 'clear',
      depthStoreOp: 'store'
    } as unknown as GPURenderPassDepthStencilAttachment
  } as GPURenderPassDescriptor;

  function resizeToDisplaySize(device: GPUDevice, canvasInfo: CanvasInfo) {
    const { canvas, renderTarget, presentationFormat, depthTexture, sampleCount } = canvasInfo;
    const width = Math.max(1, Math.min(device.limits.maxTextureDimension2D, canvas.clientWidth));
    const height = Math.max(1, Math.min(device.limits.maxTextureDimension2D, canvas.clientHeight));

    const needResize = !canvasInfo.renderTarget || width !== canvas.width || height !== canvas.height;
    if (needResize) {
      if (renderTarget) {
        renderTarget.destroy();
      }
      if (depthTexture) {
        depthTexture.destroy();
      }

      canvas.width = width;
      canvas.height = height;

      if (sampleCount > 1) {
        const newRenderTarget = device.createTexture({
          size: [canvas.width, canvas.height, 1],
          format: presentationFormat,
          sampleCount,
          usage: GPUTextureUsage.RENDER_ATTACHMENT
        });
        canvasInfo.renderTarget = newRenderTarget;
        canvasInfo.renderTargetView = newRenderTarget.createView();
      }

      const newDepthTexture = device.createTexture({
        size: [canvas.width, canvas.height, 1],
        format: 'depth24plus',
        sampleCount,
        usage: GPUTextureUsage.RENDER_ATTACHMENT
      });
      canvasInfo.depthTexture = newDepthTexture;
      canvasInfo.depthTextureView = newDepthTexture.createView();
    }
    return needResize;
  }

  let animationFrameId = 0;
  function render(time: number) {
    if (!device) {
      return;
    }
    time *= 0.001;
    resizeToDisplaySize(device, canvasInfo);

    const projection = mat4.perspective((30 * Math.PI) / 180, canvas.clientWidth / canvas.clientHeight, 0.5, 10);
    const eye = [1, 4, -6];
    const target = [0, 0, 0];
    const up = [0, 1, 0];

    const view = mat4.lookAt(eye, target, up);
    const viewProjection = mat4.multiply(projection, view);
    const world = mat4.rotationY(time);
    mat4.transpose(mat4.inverse(world), worldInverseTranspose);
    mat4.multiply(viewProjection, world, worldViewProjection);

    vec3.normalize([1, 8, -10], lightDirection);

    device.queue.writeBuffer(vsUniformBuffer, 0, vsUniformValues);
    device.queue.writeBuffer(fsUniformBuffer, 0, fsUniformValues);

    if (canvasInfo.sampleCount === 1) {
      const colorTexture = context.getCurrentTexture();
      renderPassDescriptor.colorAttachments[0]!.view = colorTexture.createView();
    } else {
      renderPassDescriptor.colorAttachments[0]!.view = canvasInfo.renderTargetView!;
      renderPassDescriptor.colorAttachments[0]!.resolveTarget = context.getCurrentTexture().createView();
    }
    renderPassDescriptor.depthStencilAttachment!.view = canvasInfo.depthTextureView!;

    const commandEncoder = device.createCommandEncoder();
    const passEncoder = commandEncoder.beginRenderPass(renderPassDescriptor);
    passEncoder.setPipeline(pipeline);
    passEncoder.setBindGroup(0, bindGroup);
    passEncoder.setVertexBuffer(0, positionBuffer);
    passEncoder.setVertexBuffer(1, normalBuffer);
    passEncoder.setVertexBuffer(2, texcoordBuffer);
    passEncoder.setIndexBuffer(indicesBuffer, 'uint16');
    passEncoder.drawIndexed(indices.length);
    passEncoder.end();
    device.queue.submit([commandEncoder.finish()]);

    animationFrameId = requestAnimationFrame(render);
  }
  animationFrameId = requestAnimationFrame(render);

  onCleanup(() => {
    device.destroy();
    cancelAnimationFrame(animationFrameId);
  });
}

function fail(msg: string) {
  const elem = document.querySelector('#fail')! as HTMLDivElement;
  const contentElem = elem.querySelector('.content')!;
  elem.style.display = '';
  contentElem.textContent = msg;
}
