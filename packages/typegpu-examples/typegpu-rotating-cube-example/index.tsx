import createRAF from '@solid-primitives/raf';
import { Meta, Title } from '@solidjs/meta';
import { createEffect, createSignal, on, onCleanup, untrack } from 'solid-js';
import tgpu, { RenderFlag, SampledFlag, TgpuTexture } from 'typegpu';
import * as d from 'typegpu/data';
import * as std from 'typegpu/std';
import { mat4, vec3 } from 'wgpu-matrix';
import { ResizeContainer } from '../ui/ResizeContainer';
import { TypeGPUProvider, useTypeGPU } from '../utils/TypeGPU';

export default function TypeGPURotatingCubeExample() {
  const [running, setRunning] = createSignal(true);
  const [msaa, setMsaa] = createSignal(true);

  return (
    <>
      <Title>TypeGPU Rotating Cube Example</Title>
      <Meta name="description" content="A rotating 3D cube example using TypeGPU and SolidJS with textures" />
      <div class="flex flex-col place-content-start gap-2 p-2">
        <h1 class="text-xl font-bold">TypeGPU Rotating Cube Example</h1>
        <p class="text-sm text-gray-600">A rotating 3D textured cube using TypeGPU with SolidJS</p>
        <div class="flex gap-2">
          <button class="max-w-40 rounded bg-blue-500 p-2 text-white" onClick={() => setRunning((v) => !v)}>
            {running() ? 'Pause' : 'Play'}
          </button>
          <button
            class="max-w-40 rounded p-2 text-white"
            classList={{ 'bg-green-500': msaa(), 'bg-gray-500': !msaa() }}
            onClick={() => setMsaa((v) => !v)}
          >
            MSAA: {msaa() ? 'ON' : 'OFF'}
          </button>
        </div>
        <ResizeContainer>
          <TypeGPUProvider class="aspect-square w-full">
            <App running={running()} msaa={msaa()} />
          </TypeGPUProvider>
        </ResizeContainer>
      </div>
    </>
  );
}

// Create checkerboard texture data
function createCheckerboardTexture(size: number = 8): Uint8Array {
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      const isWhite = (x + y) % 2 === 0;
      const color = isWhite ? [255, 200, 100] : [100, 150, 255];
      data[i] = color[0]; // R
      data[i + 1] = color[1]; // G
      data[i + 2] = color[2]; // B
      data[i + 3] = 255; // A
    }
  }
  return data;
}

function App(props: { running: boolean; msaa: boolean }) {
  const { root, context, presentationFormat, size, canvas } = useTypeGPU();

  // Create bind group layout for uniforms and texture
  const bindGroupLayout = tgpu.bindGroupLayout({
    worldViewProjection: { uniform: d.mat4x4f },
    worldInverseTranspose: { uniform: d.mat4x4f },
    lightDirection: { uniform: d.vec3f },
    texture: { texture: d.texture2d() },
    sampler: { sampler: 'filtering' }
  });

  // Create uniform buffers
  const worldViewProjectionUniform = root.createUniform(d.mat4x4f);
  const worldInverseTransposeUniform = root.createUniform(d.mat4x4f);
  const lightDirectionUniform = root.createUniform(d.vec3f, d.vec3f(0.5, 0.7, -1));

  // Create checkerboard texture
  const textureSize = 8;
  const textureData = createCheckerboardTexture(textureSize);

  const texture = root['~unstable']
    .createTexture({
      size: [textureSize, textureSize],
      format: 'rgba8unorm'
    })
    .$usage('sampled', 'render');

  // Write texture data
  root.device.queue.writeTexture(
    { texture: root.unwrap(texture) },
    new Uint8Array(textureData),
    { bytesPerRow: textureSize * 4, rowsPerImage: textureSize },
    { width: textureSize, height: textureSize }
  );

  const textureView = texture.createView();

  const sampler = root['~unstable'].createSampler({
    magFilter: 'nearest',
    minFilter: 'nearest',
    addressModeU: 'repeat',
    addressModeV: 'repeat'
  });

  // Create bind group
  const bindGroup = root.createBindGroup(bindGroupLayout, {
    worldViewProjection: worldViewProjectionUniform.buffer,
    worldInverseTranspose: worldInverseTransposeUniform.buffer,
    lightDirection: lightDirectionUniform.buffer,
    texture: textureView,
    sampler: sampler
  });

  // Vertex shader using built-in vertex index to generate cube vertices
  const vertexFn = tgpu['~unstable'].vertexFn({
    in: {
      vertexIndex: d.builtin.vertexIndex
    },
    out: {
      pos: d.builtin.position,
      normal: d.vec3f,
      texcoord: d.vec2f
    }
  })(({ vertexIndex }) => {
    'use gpu';

    // Cube vertex data - 36 vertices for 12 triangles (2 per face, 6 faces)
    // prettier-ignore
    const positions = [
      // +X face
      d.vec3f(1, 1, -1), d.vec3f(1, 1, 1), d.vec3f(1, -1, 1),
      d.vec3f(1, 1, -1), d.vec3f(1, -1, 1), d.vec3f(1, -1, -1),
      // -X face
      d.vec3f(-1, 1, 1), d.vec3f(-1, 1, -1), d.vec3f(-1, -1, -1),
      d.vec3f(-1, 1, 1), d.vec3f(-1, -1, -1), d.vec3f(-1, -1, 1),
      // +Y face
      d.vec3f(-1, 1, 1), d.vec3f(1, 1, 1), d.vec3f(1, 1, -1),
      d.vec3f(-1, 1, 1), d.vec3f(1, 1, -1), d.vec3f(-1, 1, -1),
      // -Y face
      d.vec3f(-1, -1, -1), d.vec3f(1, -1, -1), d.vec3f(1, -1, 1),
      d.vec3f(-1, -1, -1), d.vec3f(1, -1, 1), d.vec3f(-1, -1, 1),
      // +Z face
      d.vec3f(1, 1, 1), d.vec3f(-1, 1, 1), d.vec3f(-1, -1, 1),
      d.vec3f(1, 1, 1), d.vec3f(-1, -1, 1), d.vec3f(1, -1, 1),
      // -Z face
      d.vec3f(-1, 1, -1), d.vec3f(1, 1, -1), d.vec3f(1, -1, -1),
      d.vec3f(-1, 1, -1), d.vec3f(1, -1, -1), d.vec3f(-1, -1, -1),
    ];

    // prettier-ignore
    const normals = [
      // +X face
      d.vec3f(1, 0, 0), d.vec3f(1, 0, 0), d.vec3f(1, 0, 0),
      d.vec3f(1, 0, 0), d.vec3f(1, 0, 0), d.vec3f(1, 0, 0),
      // -X face
      d.vec3f(-1, 0, 0), d.vec3f(-1, 0, 0), d.vec3f(-1, 0, 0),
      d.vec3f(-1, 0, 0), d.vec3f(-1, 0, 0), d.vec3f(-1, 0, 0),
      // +Y face
      d.vec3f(0, 1, 0), d.vec3f(0, 1, 0), d.vec3f(0, 1, 0),
      d.vec3f(0, 1, 0), d.vec3f(0, 1, 0), d.vec3f(0, 1, 0),
      // -Y face
      d.vec3f(0, -1, 0), d.vec3f(0, -1, 0), d.vec3f(0, -1, 0),
      d.vec3f(0, -1, 0), d.vec3f(0, -1, 0), d.vec3f(0, -1, 0),
      // +Z face
      d.vec3f(0, 0, 1), d.vec3f(0, 0, 1), d.vec3f(0, 0, 1),
      d.vec3f(0, 0, 1), d.vec3f(0, 0, 1), d.vec3f(0, 0, 1),
      // -Z face
      d.vec3f(0, 0, -1), d.vec3f(0, 0, -1), d.vec3f(0, 0, -1),
      d.vec3f(0, 0, -1), d.vec3f(0, 0, -1), d.vec3f(0, 0, -1),
    ];

    // prettier-ignore
    const texcoords = [
      // Each face: 2 triangles, 3 vertices each
      d.vec2f(0, 0), d.vec2f(1, 0), d.vec2f(1, 1),
      d.vec2f(0, 0), d.vec2f(1, 1), d.vec2f(0, 1),
      d.vec2f(0, 0), d.vec2f(1, 0), d.vec2f(1, 1),
      d.vec2f(0, 0), d.vec2f(1, 1), d.vec2f(0, 1),
      d.vec2f(0, 0), d.vec2f(1, 0), d.vec2f(1, 1),
      d.vec2f(0, 0), d.vec2f(1, 1), d.vec2f(0, 1),
      d.vec2f(0, 0), d.vec2f(1, 0), d.vec2f(1, 1),
      d.vec2f(0, 0), d.vec2f(1, 1), d.vec2f(0, 1),
      d.vec2f(0, 0), d.vec2f(1, 0), d.vec2f(1, 1),
      d.vec2f(0, 0), d.vec2f(1, 1), d.vec2f(0, 1),
      d.vec2f(0, 0), d.vec2f(1, 0), d.vec2f(1, 1),
      d.vec2f(0, 0), d.vec2f(1, 1), d.vec2f(0, 1),
    ];

    const position = positions[vertexIndex];
    const normal = normals[vertexIndex];
    const texcoord = texcoords[vertexIndex];

    const pos = std.mul(bindGroupLayout.$.worldViewProjection, d.vec4f(position, 1.0));
    const transformedNormal = std.mul(bindGroupLayout.$.worldInverseTranspose, d.vec4f(normal, 0.0));

    return {
      pos: pos,
      normal: transformedNormal.xyz,
      texcoord: texcoord
    };
  });

  // Fragment shader with lighting and texture
  const fragmentFn = tgpu['~unstable'].fragmentFn({
    in: {
      pos: d.builtin.position,
      normal: d.vec3f,
      texcoord: d.vec2f
    },
    out: d.vec4f
  })(({ normal, texcoord }) => {
    'use gpu';
    const diffuseColor = std.textureSample(bindGroupLayout.$.texture, bindGroupLayout.$.sampler, texcoord);
    const normalizedNormal = std.normalize(normal);
    const lightDir = std.normalize(bindGroupLayout.$.lightDirection);
    // Simple diffuse lighting with half-lambert for softer shadows
    const light = std.dot(normalizedNormal, lightDir) * 0.5 + 0.5;

    return d.vec4f(diffuseColor.x * light, diffuseColor.y * light, diffuseColor.z * light, diffuseColor.w);
  });

  // Create depth texture
  const [depthTextureView, setDepthTextureView] = createSignal<GPUTextureView | null>(null);
  const [depthTextureViewMsaa, setDepthTextureViewMsaa] = createSignal<GPUTextureView | null>(null);
  let depthTexture: GPUTexture | null = null;
  let depthTextureMsaa: GPUTexture | null = null;

  // Multisample texture for MSAA
  let multisampleTexture:
    | (TgpuTexture<{
        size: [number, number];
        format: GPUTextureFormat;
        sampleCount: 4;
      }> &
        SampledFlag &
        RenderFlag)
    | undefined = undefined;

  // Create pipeline without multisampling
  const pipelineNoMsaa = root['~unstable']
    .withVertex(vertexFn, {})
    .withFragment(fragmentFn, { format: presentationFormat })
    .withPrimitive({ topology: 'triangle-list', cullMode: 'back' })
    .withDepthStencil({
      depthWriteEnabled: true,
      depthCompare: 'less',
      format: 'depth24plus'
    })
    .createPipeline();

  // Create pipeline with multisampling
  const pipelineMsaa = root['~unstable']
    .withVertex(vertexFn, {})
    .withFragment(fragmentFn, { format: presentationFormat })
    .withPrimitive({ topology: 'triangle-list', cullMode: 'back' })
    .withDepthStencil({
      depthWriteEnabled: true,
      depthCompare: 'less',
      format: 'depth24plus'
    })
    .withMultisample({ count: 4 })
    .createPipeline();

  // Animation state - use accumulated time so pause/play doesn't jump
  let accumulatedTime = 0;
  let lastFrameTime = performance.now();

  const render = () => {
    // Update accumulated time
    const now = performance.now();
    accumulatedTime += (now - lastFrameTime) / 1000;
    lastFrameTime = now;

    const { width, height } = size();
    const canvasTexture = context.getCurrentTexture();
    const useMsaa = props.msaa;

    // Update multisample texture if size changed (only needed for MSAA)
    if (useMsaa) {
      if (
        !multisampleTexture ||
        multisampleTexture.props.size[0] !== canvasTexture.width ||
        multisampleTexture.props.size[1] !== canvasTexture.height
      ) {
        if (multisampleTexture) {
          multisampleTexture.destroy();
        }

        multisampleTexture = root['~unstable']
          .createTexture({
            format: canvasTexture.format,
            dimension: '2d',
            size: [canvasTexture.width, canvasTexture.height],
            sampleCount: 4
          })
          .$usage('sampled', 'render');
      }
    }

    // Update depth texture for MSAA (sampleCount: 4)
    if (useMsaa) {
      if (!depthTextureMsaa || depthTextureMsaa.width !== width || depthTextureMsaa.height !== height) {
        depthTextureMsaa?.destroy();
        depthTextureMsaa = root.device.createTexture({
          size: [width, height, 1],
          format: 'depth24plus',
          sampleCount: 4,
          usage: GPUTextureUsage.RENDER_ATTACHMENT
        });
        setDepthTextureViewMsaa(depthTextureMsaa.createView());
      }
    }

    // Update depth texture for non-MSAA (sampleCount: 1)
    if (!useMsaa) {
      if (!depthTexture || depthTexture.width !== width || depthTexture.height !== height) {
        depthTexture?.destroy();
        depthTexture = root.device.createTexture({
          size: [width, height, 1],
          format: 'depth24plus',
          usage: GPUTextureUsage.RENDER_ATTACHMENT
        });
        setDepthTextureView(depthTexture.createView());
      }
    }

    const time = accumulatedTime;

    // Calculate matrices
    const aspect = canvas.width / canvas.height;
    const projection = mat4.perspective((30 * Math.PI) / 180, aspect, 0.5, 100);
    const eye = vec3.fromValues(0, 4, -8);
    const target = vec3.fromValues(0, 0, 0);
    const up = vec3.fromValues(0, 1, 0);
    const view = mat4.lookAt(eye, target, up);
    const viewProjection = mat4.multiply(projection, view);

    // Rotate the cube
    const world = mat4.rotationY(time);
    mat4.rotateX(world, time * 0.7, world);

    const worldViewProjection = mat4.multiply(viewProjection, world);
    const worldInverse = mat4.inverse(world);
    const worldInverseTranspose = mat4.transpose(worldInverse);

    // Normalize light direction
    const lightDir = vec3.normalize(vec3.fromValues(1, 2, -1));

    // Update uniforms - convert Float64Array to mat4x4f
    worldViewProjectionUniform.write(
      d.mat4x4f(
        d.vec4f(worldViewProjection[0], worldViewProjection[1], worldViewProjection[2], worldViewProjection[3]),
        d.vec4f(worldViewProjection[4], worldViewProjection[5], worldViewProjection[6], worldViewProjection[7]),
        d.vec4f(worldViewProjection[8], worldViewProjection[9], worldViewProjection[10], worldViewProjection[11]),
        d.vec4f(worldViewProjection[12], worldViewProjection[13], worldViewProjection[14], worldViewProjection[15])
      )
    );
    worldInverseTransposeUniform.write(
      d.mat4x4f(
        d.vec4f(worldInverseTranspose[0], worldInverseTranspose[1], worldInverseTranspose[2], worldInverseTranspose[3]),
        d.vec4f(worldInverseTranspose[4], worldInverseTranspose[5], worldInverseTranspose[6], worldInverseTranspose[7]),
        d.vec4f(
          worldInverseTranspose[8],
          worldInverseTranspose[9],
          worldInverseTranspose[10],
          worldInverseTranspose[11]
        ),
        d.vec4f(
          worldInverseTranspose[12],
          worldInverseTranspose[13],
          worldInverseTranspose[14],
          worldInverseTranspose[15]
        )
      )
    );
    lightDirectionUniform.write(d.vec3f(lightDir[0], lightDir[1], lightDir[2]));

    if (useMsaa) {
      // Render with multisampling
      const dtView = depthTextureViewMsaa();
      if (!dtView || !multisampleTexture) return;

      const multisampleView = multisampleTexture.createView();

      root['~unstable'].beginRenderPass(
        {
          colorAttachments: [
            {
              view: root.unwrap(multisampleView),
              resolveTarget: canvasTexture.createView(),
              clearValue: d.vec4f(0.2, 0.2, 0.3, 1),
              loadOp: 'clear',
              storeOp: 'store'
            }
          ],
          depthStencilAttachment: {
            view: dtView,
            depthClearValue: 1.0,
            depthLoadOp: 'clear',
            depthStoreOp: 'store'
          }
        },
        (pass) => {
          pass.setPipeline(pipelineMsaa);
          pass.setBindGroup(bindGroupLayout, bindGroup);
          pass.draw(36);
        }
      );
    } else {
      // Render without multisampling
      const dtView = depthTextureView();
      if (!dtView) return;

      root['~unstable'].beginRenderPass(
        {
          colorAttachments: [
            {
              view: canvasTexture.createView(),
              clearValue: d.vec4f(0.2, 0.2, 0.3, 1),
              loadOp: 'clear',
              storeOp: 'store'
            }
          ],
          depthStencilAttachment: {
            view: dtView,
            depthClearValue: 1.0,
            depthLoadOp: 'clear',
            depthStoreOp: 'store'
          }
        },
        (pass) => {
          pass.setPipeline(pipelineNoMsaa);
          pass.setBindGroup(bindGroupLayout, bindGroup);
          pass.draw(36);
        }
      );
    }
  };

  // Animation loop
  const [running, start, stop] = createRAF(render);

  // Reset lastFrameTime when starting to prevent time jump
  createEffect(() => {
    if (props.running) {
      lastFrameTime = performance.now();
      start();
    } else {
      stop();
    }
  });

  createEffect(
    on(size, () => {
      if (!untrack(running)) {
        // Reset lastFrameTime to prevent time jump when resizing while paused
        lastFrameTime = performance.now();
        render();
      }
    })
  );

  // Re-render when MSAA toggle changes (even when paused)
  createEffect(
    on(
      () => props.msaa,
      () => {
        if (!untrack(running)) {
          // Reset lastFrameTime to prevent time jump when toggling MSAA while paused
          lastFrameTime = performance.now();
          render();
        }
      }
    )
  );

  onCleanup(() => {
    stop();
    depthTexture?.destroy();
    depthTextureMsaa?.destroy();
    multisampleTexture?.destroy();
  });

  return null;
}
