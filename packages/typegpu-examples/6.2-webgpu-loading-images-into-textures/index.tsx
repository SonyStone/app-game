import { Range2D } from '@packages/components/ui/range-2d';
import { Meta, Title } from '@solidjs/meta';
import { createEffect, createMemo, createSignal } from 'solid-js';
import * as d from 'typegpu/data';
import { shaders } from '../6.1-webgpu-textures/shaders';
import { ResizeContainer } from '../ui/ResizeContainer';
import { TypeGPUProvider, useTypeGPU } from '../utils/TypeGPU';
import img from './f-texture.png?url';
import { ImageBitmapProvider, useImageBitmap } from './ImageBitmap.provider';

export default function WebGPULoadingImagesIntoTextures() {
  const [offset, setOffset] = createSignal<[number, number]>([0, 0]);
  const [scale, setScale] = createSignal<[number, number]>([0.5, 0.5]);
  const [magFilter, setMagFilter] = createSignal<'nearest' | 'linear'>('nearest');
  const [minFilter, setMinFilter] = createSignal<'nearest' | 'linear'>('nearest');
  const [pixelScale, setPixelScale] = createSignal<number>(1);

  return (
    <>
      <Title>WebGPU Loading Images into Textures</Title>
      <Meta name="description" content="" />
      <div class="flex flex-col place-content-start gap-2 p-2">
        <a href="https://webgpufundamentals.org/webgpu/lessons/webgpu-importing-textures.html">
          WebGPU Loading Images into Textures
        </a>

        <div class="flex flex-row place-items-center gap-4">
          <label>Mag Filter:</label>
          <select
            class="place-self-start border bg-blue-100 p-1"
            value={magFilter()}
            onChange={(e) => setMagFilter(e.currentTarget.value as 'nearest' | 'linear')}
          >
            <option value="nearest">Nearest</option>
            <option value="linear">Linear</option>
          </select>
        </div>

        <div class="flex flex-row place-items-center gap-4">
          <label>Min Filter:</label>
          <select
            class="place-self-start border bg-blue-100 p-1"
            value={minFilter()}
            onChange={(e) => setMinFilter(e.currentTarget.value as 'nearest' | 'linear')}
          >
            <option value="nearest">Nearest</option>
            <option value="linear">Linear</option>
          </select>
        </div>

        <div class="flex flex-row gap-4">
          <label>Pixel Scale: {pixelScale()}</label>
          <input
            class="max-w-140 flex-1"
            type="range"
            step={1}
            min={1}
            max={64}
            value={pixelScale()}
            onInput={(e) => setPixelScale(Number(e.currentTarget.value))}
          />
        </div>

        <div class="flex flex-row gap-4">
          <label>Scale:</label>
          <Range2D
            class="h-48 w-48"
            value={scale()}
            onInput={setScale}
            min={[0, 0]}
            max={[1, 1]}
            step={[0.001, 0.001]}
            showGrid
          />

          <label>Offset:</label>
          <Range2D
            class="h-48 w-48"
            value={offset()}
            onInput={setOffset}
            min={[-1, -1]}
            max={[1, 1]}
            step={[0.001, 0.001]}
            showGrid
          />
        </div>

        <ResizeContainer>
          <TypeGPUProvider class="image-render-pixel aspect-square w-full" pixelScale={pixelScale()}>
            <ImageBitmapProvider imgUrl={img}>
              <App
                scale={scale()}
                offset={offset()}
                magFilter={magFilter()}
                minFilter={minFilter()}
                pixelScale={pixelScale()}
              />
            </ImageBitmapProvider>
          </TypeGPUProvider>
        </ResizeContainer>
      </div>
    </>
  );
}

function App(props: {
  scale: [number, number];
  offset: [number, number];
  magFilter: 'nearest' | 'linear';
  minFilter: 'nearest' | 'linear';
  pixelScale: number;
}) {
  const { root, context, presentationFormat, size } = useTypeGPU();

  // --- Just shemas, shader and pipeline setup ---

  const position = root.createUniform(d.vec2f, d.vec2f(props.offset[0], props.offset[1]));
  const scale = root.createUniform(d.vec2f, d.vec2f(props.scale[0], props.scale[1]));

  const bitmap = useImageBitmap();

  const texture = root['~unstable']
    .createTexture({
      size: [bitmap.width, bitmap.height],
      format: 'rgba8unorm',
      mipLevelCount: 9
    })
    .$usage('sampled', 'render');

  texture.write(bitmap);
  texture.generateMipmaps();

  const textureView = texture.createView();

  const sampler = createMemo(() =>
    root['~unstable'].createSampler({
      magFilter: props.magFilter,
      minFilter: props.minFilter,
      addressModeU: 'repeat',
      addressModeV: 'repeat',
      mipmapFilter: 'linear'
    })
  );

  const { vertex, fragment, bindGroupLayout } = shaders();

  const bindGroup = createMemo(() =>
    root.createBindGroup(bindGroupLayout, {
      scale: scale.buffer,
      position: position.buffer,
      texture: textureView,
      sampler: sampler()
    })
  );

  const pipeline = root['~unstable']
    .withVertex(vertex, {})
    .withFragment(fragment, { format: presentationFormat })
    .createPipeline();

  createEffect(() => {
    size();
    const _ = props.pixelScale;
    const _bindGroup = bindGroup();
    if (!_bindGroup) {
      return;
    }
    position.write(d.vec2f(props.offset[0], props.offset[1]));
    scale.write(d.vec2f(props.scale[0], props.scale[1]));

    root['~unstable'].beginRenderPass(
      {
        colorAttachments: [
          {
            view: context.getCurrentTexture().createView(),
            clearValue: d.vec4f(0, 0, 0, 1),
            loadOp: 'clear',
            storeOp: 'store'
          }
        ]
      },
      (pass) => {
        pass.setPipeline(pipeline);
        pass.setBindGroup(bindGroupLayout, _bindGroup);
        pass.draw(6);
      }
    );
  });

  return null;
}
