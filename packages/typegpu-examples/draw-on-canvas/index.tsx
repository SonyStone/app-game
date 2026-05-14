import { Meta, Title } from '@solidjs/meta';
import { createEffect } from 'solid-js';
import { TgpuRoot } from 'typegpu';
import * as d from 'typegpu/data';
import { ResizeContainer } from '../ui/ResizeContainer';
import { TypeGPUProvider, useTypeGPU } from '../utils/TypeGPU';
import { createBrushPipeline } from './brush.shader';
import { createCanvasPipeline } from './canvas.shader';
import { createCameraTransform } from './createCameraTransform';

export default function DrawOnCanvas() {
  const { transform, handlers } = createCameraTransform();
  return (
    <>
      <Title>Draw On Canvas</Title>
      <Meta name="description" content="" />
      <div class="flex flex-col place-content-start gap-2 p-2">
        <ResizeContainer>
          <TypeGPUProvider class="image-render-pixel aspect-square w-full" {...handlers}>
            <App transform={transform()} />
          </TypeGPUProvider>
        </ResizeContainer>
      </div>
    </>
  );
}

function App(props: { transform: d.m3x3f }) {
  const { root, context, presentationFormat, size } = useTypeGPU();

  const { textureView } = createBrushTexture({ root, presentationFormat });

  const { render, transform, resolution } = createCanvasPipeline({
    root,
    presentationFormat,
    textureView
  });

  createEffect(() => {
    size();

    resolution.write(d.vec2f(size().width, size().height));
    transform.write(props.transform);

    render(context.getCurrentTexture().createView());

    // brush.render(context.getCurrentTexture().createView());
  });

  return null;
}

function createBrushTexture({ root, presentationFormat }: { root: TgpuRoot; presentationFormat: GPUTextureFormat }) {
  const texture = root['~unstable']
    .createTexture({
      size: [1000, 1000],
      format: presentationFormat
    })
    .$usage('sampled', 'render');

  const textureView = texture.createView();

  const brush = createBrushPipeline({
    root,
    presentationFormat
  });

  brush.render(root.unwrap(textureView));

  return { textureView };
}
