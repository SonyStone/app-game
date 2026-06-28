# Example 01: Triangle

This is the smallest SolidGPU example. It keeps TypeGPU shader functions visible
and uses JSX only for canvas, pass, pipeline, and draw lifetimes.

## Proposed Usage

```tsx
import { Canvas, Draw, Pipeline, RenderPass } from '@app-game/solid-gpu';
import tgpu from 'typegpu';
import { builtin, vec2f, vec4f } from 'typegpu/data';

const vertex = tgpu['~unstable'].vertexFn({
  in: { vertexIndex: builtin.vertexIndex },
  out: { pos: builtin.position },
})(({ vertexIndex }) => {
  'use gpu';
  const positions = [
    vec2f(0, 0.55),
    vec2f(-0.55, -0.45),
    vec2f(0.55, -0.45),
  ];

  return { pos: vec4f(positions[vertexIndex], 0, 1) };
});

const fragment = tgpu['~unstable'].fragmentFn({
  out: vec4f,
})(() => {
  'use gpu';
  return vec4f(0.1, 0.8, 0.45, 1);
});

export function TriangleExample() {
  return (
    <Canvas class="aspect-square w-full" frameloop="demand">
      <RenderPass clear={[0.02, 0.02, 0.025, 1]}>
        <Pipeline vertex={vertex} fragment={fragment}>
          <Draw vertexCount={3} />
        </Pipeline>
      </RenderPass>
    </Canvas>
  );
}
```

## What This Should Replace

This shape should cover the current `1.1-webgpu-fundamentals` example with less
manual setup:

- no explicit `navigator.gpu` check in the example
- no explicit `canvas.getContext('webgpu')`
- no explicit `context.configure`
- no manual resize effect
- render pass redraws on mount and resize

## Notes

`Pipeline` can either accept TypeGPU shader functions directly or accept a
prebuilt pipeline through `value`. The direct form is nicer, but the first
implementation may support `value` first if that keeps the MVP simpler.

