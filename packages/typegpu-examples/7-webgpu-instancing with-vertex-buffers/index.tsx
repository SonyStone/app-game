import { hex2rgb } from '@packages/chroma/io/hex/hex2rgb';
import { Range2D } from '@packages/components/ui/range-2d';
import { Meta, Title } from '@solidjs/meta';
import { createEffect, createSignal } from 'solid-js';
import tgpu from 'typegpu';
import * as d from 'typegpu/data';
import * as std from 'typegpu/std';
import { ResizeContainer } from '../ui/ResizeContainer';
import { TypeGPUProvider, useTypeGPU } from '../utils/TypeGPU';
import { rand } from '../utils/rand';

type HexColor = `#${string}`;

const MAX_INSTANCES = 1000;

export default function WebGPUUniforms() {
  const [color, setColor] = createSignal<HexColor>('#ff0000');
  const [scale, setScale] = createSignal<[number, number]>([0.5, 0.5]);
  const [offset, setOffset] = createSignal<[number, number]>([0, 0]);
  const [amount, setAmount] = createSignal<number>(100);

  return (
    <>
      <Title>WebGPU Instancing with Vertex Buffers</Title>
      <Meta name="description" content="" />
      <div class="flex flex-col place-content-start gap-2 p-2">
        <a href="https://webgpufundamentals.org/webgpu/lessons/webgpu-vertex-buffers.html#a-instancing">
          WebGPU Instancing with Vertex Buffers
        </a>

        <label>Color:</label>
        <input type="color" value={color()} onInput={(e) => setColor(e.currentTarget.value as HexColor)} />

        <label>Amount:</label>
        <input
          class="max-w-140"
          type="range"
          min={1}
          max={MAX_INSTANCES}
          value={amount()}
          onInput={(e) => setAmount(Number(e.currentTarget.value))}
        />

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
          <TypeGPUProvider class="aspect-square w-full">
            <App color={color()} scale={scale()} offset={offset()} amount={amount()} />
          </TypeGPUProvider>
        </ResizeContainer>
      </div>
    </>
  );
}

function App(props: { color: HexColor; scale: [number, number]; offset: [number, number]; amount: number }) {
  const { root, context, presentationFormat, size } = useTypeGPU();

  // --- Just shemas, shader and pipeline setup ---

  // 🟢 Define the uniform structure schema (Like Zod)
  const vertexSchema = d.arrayOf(
    d.struct({
      color: d.vec4f,
      offset: d.vec2f,
      scale: d.vec2f
    })
  );

  const instanceLayout = tgpu.vertexLayout(vertexSchema, 'instance');

  const shaders = (() => {
    const vertex = tgpu['~unstable'].vertexFn({
      in: { position: d.vec2f, color: d.vec4f, offset: d.vec2f, scale: d.vec2f },
      out: { pos: d.builtin.position, color: d.vec4f }
    })(({ position, color, offset, scale }) => {
      'use gpu';
      return {
        pos: d.vec4f(
          // 🟢 Now we can use the bind group layout to access the uniform values
          std.add(std.mul(position, scale), offset),
          0,
          1
        ),
        color
      };
    });

    const fragment = tgpu['~unstable'].fragmentFn({
      in: { pos: d.builtin.position, color: d.vec4f },
      out: d.vec4f
    })(({ color }) => {
      'use gpu';
      return color;
    });

    return { vertex, fragment };
  })();

  // 🟢 Define the circle vertices schema
  const circleVerticesSchema = d.arrayOf(d.vec2f);

  // 🟢 Create the vertex Layout
  const vertexLayout = tgpu.vertexLayout(circleVerticesSchema, 'vertex');

  const pipeline = root['~unstable']
    .withVertex(shaders.vertex, {
      position: vertexLayout.attrib,
      color: instanceLayout.attrib.color,
      offset: instanceLayout.attrib.offset,
      scale: instanceLayout.attrib.scale
    })
    .withFragment(shaders.fragment, { format: presentationFormat })
    .createPipeline();

  // --- Real data write into the GPU starts here ---

  const instanceBuffer = root
    .createBuffer(
      vertexSchema(MAX_INSTANCES),
      Array.from({ length: MAX_INSTANCES }).map(() => ({
        color: d.vec4f(rand(0, 255) / 255, rand(0, 255) / 255, rand(0, 255) / 255, 1),
        scale: std.mul(std.mul(d.vec2f(1, 1), rand(0, 1)), 0.2),
        offset: d.vec2f(rand(-1, 1), rand(-1, 1))
      }))
    )
    .$usage('vertex');

  const circle = createCircleVertices({
    radius: 0.5,
    innerRadius: 0.25
  });

  // 🟢 And create storage buffer for the 1 circle vertices
  const circleBuffer = root.createBuffer(circleVerticesSchema(circle.numVertices), circle.vertexData).$usage('vertex');

  createEffect(() => {
    size();
    const color = hex2rgb(props.color);

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
        // 🟢 Update storage buffer value and do a one draw call all instances

        instanceBuffer.writePartial([
          {
            idx: props.amount - 1,
            value: {
              color: d.vec4f(color[0] / 255, color[1] / 255, color[2] / 255, color[3]),
              scale: d.vec2f(props.scale[0], props.scale[1]),
              offset: d.vec2f(props.offset[0], props.offset[1])
            }
          }
        ]);
        pass.setVertexBuffer(vertexLayout, circleBuffer);
        pass.setVertexBuffer(instanceLayout, instanceBuffer);
        // Draw circle ⨉ amount times
        pass.draw(circle.numVertices, props.amount);
      }
    );
  });

  return null;
}
