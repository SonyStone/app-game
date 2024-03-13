import { Meta, Title } from '@solidjs/meta';
import { onCleanup } from 'solid-js';
import { mat4, vec3 } from 'wgpu-matrix';
import basicVertWGSL from './basic.vert.wgsl?raw';
import { cubePositionOffset, cubeUVOffset, cubeVertexCount, cubeVertexSize, getCubeVertexArray } from './cube';
import vertexPositionColorWGSL from './vertex-position-color.frag.wgsl?raw';

declare enum GPUBufferUsage {
  COPY_DST = 8,
  COPY_SRC = 4,
  INDEX = 16,
  INDIRECT = 256,
  MAP_READ = 1,
  MAP_WRITE = 2,
  QUERY_RESOLVE = 512,
  STORAGE = 128,
  UNIFORM = 64,
  VERTEX = 32
}

declare enum GPUTextureUsage {
  COPY_DST = 8,
  COPY_SRC = 4,
  RENDER_ATTACHMENT = 2,
  SAMPLED = 1,
  STORAGE = 16
}

/**
 * https://webgpu.github.io/webgpu-samples/samples/rotatingCube
 */
export default function RotatingCube() {
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

    const cubeVertexArray = await getCubeVertexArray();

    // Create a vertex buffer from the cube data.
    const verticesBuffer = device.createBuffer({
      size: cubeVertexArray.byteLength,
      usage: GPUBufferUsage.VERTEX,
      mappedAtCreation: true
    });

    new Float32Array(verticesBuffer.getMappedRange()).set(cubeVertexArray);
    verticesBuffer.unmap();

    const pipeline = device.createRenderPipeline({
      layout: 'auto',
      vertex: {
        module: device.createShaderModule({
          code: basicVertWGSL
        }),
        entryPoint: 'main',
        buffers: [
          {
            arrayStride: cubeVertexSize,
            attributes: [
              {
                // position
                shaderLocation: 0,
                offset: cubePositionOffset,
                format: 'float32x4'
              },
              {
                // uv
                shaderLocation: 1,
                offset: cubeUVOffset,
                format: 'float32x2'
              }
            ]
          }
        ]
      },
      fragment: {
        module: device.createShaderModule({
          code: vertexPositionColorWGSL
        }),
        entryPoint: 'main',
        targets: [
          {
            format: presentationFormat
          }
        ]
      },
      primitive: {
        topology: 'triangle-list',

        // Backface culling since the cube is solid piece of geometry.
        // Faces pointing away from the camera will be occluded by faces
        // pointing toward the camera.
        cullMode: 'back'
      },

      // Enable depth testing so that the fragment closest to the camera
      // is rendered in front.
      depthStencil: {
        depthWriteEnabled: true,
        depthCompare: 'less',
        format: 'depth24plus'
      }
    });

    const depthTexture = device.createTexture({
      size: [canvas.width, canvas.height] as any,
      format: 'depth24plus',
      usage: GPUTextureUsage.RENDER_ATTACHMENT
    });

    const uniformBufferSize = 4 * 16; // 4x4 matrix
    const uniformBuffer = device.createBuffer({
      size: uniformBufferSize,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
    } as any);

    const uniformBindGroup = device.createBindGroup({
      layout: pipeline.getBindGroupLayout(0),
      entries: [
        {
          binding: 0,
          resource: {
            buffer: uniformBuffer
          }
        }
      ]
    });

    const renderPassDescriptor: GPURenderPassDescriptor = {
      colorAttachments: [
        {
          view: undefined as any, // Assigned later

          clearValue: { r: 0.5, g: 0.5, b: 0.5, a: 1.0 },
          loadOp: 'clear',
          storeOp: 'store'
        }
      ],
      depthStencilAttachment: {
        view: depthTexture.createView(),

        depthClearValue: 1.0,
        depthLoadOp: 'clear',
        depthStoreOp: 'store'
      }
    };

    const aspect = canvas.width / canvas.height;
    const projectionMatrix = mat4.perspective((2 * Math.PI) / 5, aspect, 1, 100.0);
    const modelViewProjectionMatrix = mat4.create();

    function getTransformationMatrix() {
      const viewMatrix = mat4.identity();
      mat4.translate(viewMatrix, vec3.fromValues(0, 0, -4), viewMatrix);
      const now = Date.now() / 1000;
      mat4.rotate(viewMatrix, vec3.fromValues(Math.sin(now), Math.cos(now), 0), 1, viewMatrix);

      mat4.multiply(projectionMatrix, viewMatrix, modelViewProjectionMatrix);

      return modelViewProjectionMatrix as Float32Array;
    }

    function frame() {
      const transformationMatrix = getTransformationMatrix();
      device.queue.writeBuffer(
        uniformBuffer,
        0,
        transformationMatrix.buffer,
        transformationMatrix.byteOffset,
        transformationMatrix.byteLength
      );
      renderPassDescriptor.colorAttachments[0]!.view = context.getCurrentTexture().createView();

      const commandEncoder = device.createCommandEncoder();
      const passEncoder = commandEncoder.beginRenderPass(renderPassDescriptor);
      passEncoder.setPipeline(pipeline);
      passEncoder.setBindGroup(0, uniformBindGroup);
      passEncoder.setVertexBuffer(0, verticesBuffer);
      passEncoder.draw(cubeVertexCount);
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
      <Title>Rotating Cube</Title>
      <Meta
        name="description"
        content="This example shows how to upload uniform data every frame to render a rotating object."
      />
      {canvas}
    </>
  );
}
