import { hex2rgb } from '@app-game/chroma/io/hex/hex2rgb';
import { Range2D } from '@app-game/components/ui/range-2d';
import { Meta, Title } from '@solidjs/meta';
import { createEffect, createSignal } from 'solid-js';
import tgpu from 'typegpu';
import * as d from 'typegpu/data';
import * as std from 'typegpu/std';
import { ResizeContainer } from '../ui/ResizeContainer';
import { TypeGPUProvider, useTypeGPU } from '../utils/TypeGPU';
import { rand } from '../utils/rand';

type HexColor = `#${string}`;

export default function WebGPUUniforms() {
  const [color, setColor] = createSignal<HexColor>('#ff0000');
  const [scale, setScale] = createSignal<[number, number]>([0.5, 0.5]);
  const [offset, setOffset] = createSignal<[number, number]>([0, 0]);
  const [amount, setAmount] = createSignal<number>(100);

  return (
    <>
      <Title>WebGPU Vertex Buffers</Title>
      <Meta name="description" content="" />
      <div class="flex flex-col place-content-start gap-2 p-2">
        <a href="https://webgpufundamentals.org/webgpu/lessons/webgpu-vertex-buffers.html">WebGPU Vertex Buffers</a>

        <label>Color:</label>
        <input type="color" value={color()} onInput={(e) => setColor(e.currentTarget.value as HexColor)} />

        <label>Amount:</label>
        <input
          class="max-w-140"
          type="range"
          min={1}
          max={1000}
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
  const ourStructShema = d.arrayOf(
    d.struct({
      color: d.vec4f,
      scale: d.vec2f,
      offset: d.vec2f
    })
  );

  // 🟢 Create the bind group layout
  const bindGroupLayout = tgpu.bindGroupLayout({
    ourStruct: { storage: ourStructShema }
  });

  const shaders = (() => {
    const vertex = tgpu['~unstable'].vertexFn({
      in: { vert: d.vec2f, instanceIndex: d.builtin.instanceIndex },
      out: { pos: d.builtin.position, color: d.vec4f }
    })(({ vert, instanceIndex }) => {
      'use gpu';
      const ourStruct = bindGroupLayout.$.ourStruct[instanceIndex];
      return {
        pos: d.vec4f(
          // 🟢 Now we can use the bind group layout to access the uniform values
          std.add(std.mul(vert, ourStruct.scale), ourStruct.offset),
          0,
          1
        ),
        color: ourStruct.color
      };
    });

    const fragment = tgpu['~unstable'].fragmentFn({
      in: { pos: d.builtin.position, color: d.vec4f },
      out: d.vec4f
    })(({ color }) => {
      'use gpu';
      // 🟢 And here too
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
      vert: vertexLayout.attrib
    })
    .withFragment(shaders.fragment, { format: presentationFormat })
    .createPipeline();

  // --- Real data write into the GPU starts here ---

  // 🟢 Create storage buffers for one bind group
  const ourStruct = root
    .createBuffer(
      ourStructShema(1000),
      Array.from({ length: 1000 }).map(() => ({
        color: d.vec4f(rand(0, 255) / 255, rand(0, 255) / 255, rand(0, 255) / 255, 1),
        scale: d.vec2f(1, 1),
        offset: d.vec2f(rand(-1, 1), rand(-1, 1))
      }))
    )
    .$usage('storage');

  const circle = createCircleVertices({
    radius: 0.5,
    innerRadius: 0.25
  });

  // 🟢 And create storage buffer for the 1 circle vertices
  const circleBuffer = root.createBuffer(circleVerticesSchema(circle.numVertices), circle.vertexData).$usage('vertex');

  const bindGroup = root.createBindGroup(bindGroupLayout, {
    ourStruct: ourStruct.buffer
  });

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

        ourStruct.writePartial([
          {
            idx: props.amount - 1,
            value: {
              color: d.vec4f(color[0] / 255, color[1] / 255, color[2] / 255, color[3]),
              scale: d.vec2f(props.scale[0], props.scale[1]),
              offset: d.vec2f(props.offset[0], props.offset[1])
            }
          }
        ]);
        pass.setBindGroup(bindGroupLayout, bindGroup);
        pass.setVertexBuffer(vertexLayout, circleBuffer);
        // Draw circle ⨉ amount times
        pass.draw(circle.numVertices, props.amount);
      }
    );
  });

  return null;
}

function createCircleVertices({
  radius = 1,
  numSubdivisions = 24,
  innerRadius = 0,
  startAngle = 0,
  endAngle = Math.PI * 2
} = {}) {
  // 2 triangles per subdivision, 3 verts per tri, 2 values (xy) each.
  const numVertices = numSubdivisions * 3 * 2;
  const vertexData: d.v2f[] = [];

  const addVertex = (x: number, y: number) => {
    vertexData.push(d.vec2f(x, y));
  };

  // 2 triangles per subdivision
  //
  // 0--1 4
  // | / /|
  // |/ / |
  // 2 3--5
  for (let i = 0; i < numSubdivisions; ++i) {
    const angle1 = startAngle + ((i + 0) * (endAngle - startAngle)) / numSubdivisions;
    const angle2 = startAngle + ((i + 1) * (endAngle - startAngle)) / numSubdivisions;

    const c1 = Math.cos(angle1);
    const s1 = Math.sin(angle1);
    const c2 = Math.cos(angle2);
    const s2 = Math.sin(angle2);

    // first triangle
    addVertex(c1 * radius, s1 * radius);
    addVertex(c2 * radius, s2 * radius);
    addVertex(c1 * innerRadius, s1 * innerRadius);

    // second triangle
    addVertex(c1 * innerRadius, s1 * innerRadius);
    addVertex(c2 * radius, s2 * radius);
    addVertex(c2 * innerRadius, s2 * innerRadius);
  }

  return {
    vertexData,
    numVertices
  };
}
