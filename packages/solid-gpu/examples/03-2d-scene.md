# Example 03: 2D Scene

The 2D layer should make common canvas-like work concise while still allowing
low-level TypeGPU resources when needed.

## Shapes And Sprites

```tsx
import {
  Canvas,
  Texture,
} from '@app-game/solid-gpu';
import {
  Circle,
  Rect,
  Scene2D,
  Sprite,
} from '@app-game/solid-gpu/2d';

export function Scene2DExample() {
  const image = createImageResource('/assets/bunny.png');

  return (
    <Canvas class="aspect-square w-full" pixelScale={1}>
      <Scene2D clear={[0.08, 0.09, 0.11, 1]}>
        <Rect
          position={[20, 20]}
          size={[240, 100]}
          radius={8}
          fill={[0.12, 0.45, 0.95, 1]}
        />

        <Circle
          position={[320, 90]}
          radius={44}
          fill={[1, 0.48, 0.12, 1]}
        />

        <Texture source={image()}>
          {(texture) => (
            <Sprite
              texture={texture}
              position={[180, 220]}
              scale={[2, 2]}
              anchor={[0.5, 0.5]}
            />
          )}
        </Texture>
      </Scene2D>
    </Canvas>
  );
}
```

## Instanced Sprites

```tsx
<Texture source={particleImage()}>
  {(texture) => (
    <InstancedSprites
      texture={texture}
      instances={particles()}
      instanceSchema={particleSchema}
      blend="alpha"
    />
  )}
</Texture>
```

## Low-Level Escape Hatch

The 2D layer should allow custom passes inside the same canvas.

```tsx
<Canvas>
  <Scene2D order={0}>
    <Sprite texture={backgroundTexture()} />
  </Scene2D>

  <RenderPass order={1} clear={false}>
    <Pipeline vertex={customVertex} fragment={customFragment}>
      <BindGroup layout={customLayout} values={customBindings()} />
      <Draw vertexCount={6} instanceCount={effects().length} />
    </Pipeline>
  </RenderPass>
</Canvas>
```

## Notes

The first 2D implementation should probably skip text. Text requires atlas
generation, font loading, glyph layout, and cache invalidation. Sprites, rects,
circles, lines, and instancing are a better first target.
