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
      <Title>WebGPU Uniforms</Title>
      <Meta name="description" content="" />
      <div class="flex flex-col place-content-start gap-2 p-2">
        <a href="https://webgpufundamentals.org/webgpu/lessons/webgpu-uniforms">WebGPU Uniforms</a>

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

  // 1️⃣ Define the uniform structure schema (Like Zod)
  const ourStructShema = d.struct({
    color: d.vec4f,
    scale: d.vec2f,
    offset: d.vec2f
  });

  // 2️⃣ Create the bind group layout
  const bindGroupLayout = tgpu.bindGroupLayout({
    ourStruct: { uniform: ourStructShema }
  });

  const uniformsExample = (() => {
    const vertex = tgpu['~unstable'].vertexFn({
      in: { vertexIndex: d.builtin.vertexIndex },
      out: { pos: d.builtin.position }
    })(({ vertexIndex }) => {
      'use gpu';
      const pos = [
        d.vec2f(0, 0.5), // top center
        d.vec2f(-0.5, -0.5), // bottom left
        d.vec2f(0.5, -0.5) // bottom right
      ];

      return {
        pos: d.vec4f(
          // 3️⃣ Now we can use the bind group layout to access the uniform values
          std.add(std.mul(pos[vertexIndex], bindGroupLayout.$.ourStruct.scale), bindGroupLayout.$.ourStruct.offset),
          0,
          1
        )
      };
    });

    const fragment = tgpu['~unstable'].fragmentFn({
      in: { pos: d.builtin.position },
      out: d.vec4f
    })(({ pos }) => {
      'use gpu';
      // 3️⃣ And here too
      return bindGroupLayout.$.ourStruct.color;
    });

    return { vertex, fragment };
  })();

  const pipeline = root['~unstable']
    .withVertex(uniformsExample.vertex, {})
    .withFragment(uniformsExample.fragment, { format: presentationFormat })
    .createPipeline();

  // Now we need to create multiple bind groups with uniform values
  const bindGroups = Array.from({ length: 1000 }).map((_, i) => {
    const posOffset = [rand(-1, 1), rand(-1, 1)] as const;
    const colorOffset = [rand(-255, 255), rand(-255, 255), rand(-255, 255)] as const;
    // 4️⃣ Create uniform buffer for each bind group
    const ourStruct = root.createUniform(ourStructShema);
    const bindGroup = root.createBindGroup(bindGroupLayout, {
      ourStruct: ourStruct.buffer
    });

    return { posOffset, colorOffset, bindGroup, ourStruct };
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
        // 5️⃣ Update uniform values and do a draw call for each bind group
        for (const { posOffset, colorOffset, bindGroup, ourStruct } of bindGroups.slice(0, props.amount)) {
          ourStruct.write({
            color: d.vec4f(
              (color[0] + colorOffset[0]) / 255,
              (color[1] + colorOffset[1]) / 255,
              (color[2] + colorOffset[2]) / 255,
              color[3]
            ),
            scale: d.vec2f(props.scale[0], props.scale[1]),
            offset: d.vec2f(props.offset[0] + posOffset[0], props.offset[1] + posOffset[1])
          });
          pass.setBindGroup(bindGroupLayout, bindGroup);
          pass.draw(3);
        }
      }
    );

    // pipeline
    //   .withColorAttachment({
    //     view: context.getCurrentTexture().createView(),
    //     clearValue: d.vec4f(0, 0, 0, 1),
    //     loadOp: 'clear',
    //     storeOp: 'store'
    //   })
    //   .draw(3);
  });

  return null;
}
