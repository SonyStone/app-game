import { Meta, Title } from '@solidjs/meta';
import { createEffect, createSignal } from 'solid-js';
import * as d from 'typegpu/data';
import * as std from 'typegpu/std';
import { ResizeContainer } from '../ui/ResizeContainer';
import { TypeGPUProvider, useTypeGPU } from '../utils/TypeGPU';
import { shaders } from './shaders';

export default function DrawOnCanvas() {
  const [transform, setTransform] = createSignal(d.mat3x3f(1, 0, 0, 0, 1, 0, 0, 0, 1));

  let isPointerDown = false;
  let lastPointerPosition: [number, number] | null = null;

  return (
    <>
      <Title>Draw On Canvas</Title>
      <Meta name="description" content="" />
      <div class="flex flex-col place-content-start gap-2 p-2">
        <ResizeContainer>
          <TypeGPUProvider
            class="image-render-pixel aspect-square w-full"
            onPointerDown={(e) => {
              e.stopPropagation();
              isPointerDown = true;
              lastPointerPosition = [e.clientX, e.clientY];
            }}
            onPointerUp={(e) => {
              e.stopPropagation();
              isPointerDown = false;
              lastPointerPosition = null;
            }}
            onPointerMove={(e) => {
              e.stopPropagation();
              // Should zoom on alt key
              if (e.altKey) {
                const scaleAmount = e.movementY * -0.01;
                const currentTransform = transform();
                const scaleMatrix = d.mat3x3f(1 + scaleAmount, 0, 0, 0, 1 + scaleAmount, 0, 0, 0, 1);
                const newTransform = std.mul(currentTransform, scaleMatrix);
                setTransform(newTransform);
                return;
              }
              // Should rotate on shift key
              if (e.shiftKey) {
                const rotationAmount = e.movementX * 0.01;
                const cos = Math.cos(rotationAmount);
                const sin = Math.sin(rotationAmount);
                const rotationMatrix = d.mat3x3f(cos, -sin, 0, sin, cos, 0, 0, 0, 1);
                const currentTransform = transform();
                const newTransform = std.mul(currentTransform, rotationMatrix);
                setTransform(newTransform);
                return;
              }

              // Pan normally
              if (isPointerDown && lastPointerPosition) {
                const dx = e.clientX - lastPointerPosition[0];
                const dy = e.clientY - lastPointerPosition[1];
                const currentTransform = transform();
                const translationMatrix = d.mat3x3f(1, 0, 0, 0, 1, 0, dx, dy, 1);
                const newTransform = std.mul(currentTransform, translationMatrix);
                setTransform(newTransform);
                lastPointerPosition = [e.clientX, e.clientY];
              }
            }}
          >
            <App transform={transform()} />
          </TypeGPUProvider>
        </ResizeContainer>
      </div>
    </>
  );
}

function App(props: { transform: d.m3x3f }) {
  const { root, context, presentationFormat, size } = useTypeGPU();

  const transform = root.createUniform(d.mat3x3f, d.mat3x3f(1, 0, 0, 0, 1, 0, 0, 0, 1));
  const resolution = root.createUniform(d.vec2f, d.vec2f());

  const texture = root['~unstable']
    .createTexture({
      size: [100, 100],
      format: 'rgba8unorm'
    })
    .$usage('sampled', 'render');

  const textureView = texture.createView();

  const { vertex, fragment, bindGroupLayout } = shaders();

  const bindGroup = root.createBindGroup(bindGroupLayout, {
    transform: transform.buffer,
    resolution: resolution.buffer,
    texture: textureView,
    sampler: root['~unstable'].createSampler({})
  });

  const pipeline = root['~unstable']
    .withVertex(vertex, {})
    .withFragment(fragment, { format: presentationFormat })
    .createPipeline();

  createEffect(() => {
    size();

    resolution.write(d.vec2f(size().width, size().height));
    transform.write(props.transform);

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
        pass.setBindGroup(bindGroupLayout, bindGroup);
        pass.draw(6);
      }
    );
  });

  return null;
}
