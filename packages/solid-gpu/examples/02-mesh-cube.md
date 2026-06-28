# Example 02: Mesh And Cube

This file sketches the high-level 3D API. The 3D layer should feel familiar to
users of `solid-ogl` or `react-three-fiber`, but it should still be backed by
the lower-level render graph and TypeGPU resources.

## Rotating Cube

```tsx
import {
  Canvas,
  Uniform,
  useFrame,
} from '@app-game/solid-gpu';
import {
  BoxGeometry,
  Mesh,
  PerspectiveCamera,
  Scene3D,
  ShaderMaterial,
} from '@app-game/solid-gpu/3d';
import { createSignal } from 'solid-js';
import * as d from 'typegpu/data';
import { litCubeFragment, litCubeVertex } from './shaders';

const materialSchema = d.struct({
  baseColor: d.vec4f,
  roughness: d.f32,
});

export function RotatingCube() {
  const [rotation, setRotation] = createSignal(0);

  useFrame((_state, delta) => {
    setRotation((value) => value + delta * 0.8);
  });

  return (
    <Canvas class="aspect-square w-full" frameloop="always">
      <Scene3D clear={[0.03, 0.04, 0.05, 1]}>
        <PerspectiveCamera makeDefault position={[0, 0, 5]} fov={45} />

        <Mesh rotation={[rotation(), rotation() * 0.6, 0]}>
          <BoxGeometry size={[1.5, 1.5, 1.5]} />
          <ShaderMaterial vertex={litCubeVertex} fragment={litCubeFragment}>
            <Uniform
              attach="material"
              schema={materialSchema}
              value={{
                baseColor: d.vec4f(0.2, 0.65, 1, 1),
                roughness: 0.45,
              }}
            />
          </ShaderMaterial>
        </Mesh>
      </Scene3D>
    </Canvas>
  );
}
```

## Mesh With Explicit Geometry And Material

```tsx
<Scene3D>
  <PerspectiveCamera makeDefault position={[0, 1, 6]} />

  <Mesh position={[-1.5, 0, 0]}>
    <Geometry
      attributes={{
        position: positionsBuffer,
        normal: normalsBuffer,
        uv: uvsBuffer,
      }}
      indices={indexBuffer}
    />
    <ShaderMaterial vertex={vertex} fragment={fragment} />
  </Mesh>

  <Mesh position={[1.5, 0, 0]}>
    <BoxGeometry size={[1, 2, 1]} />
    <ShaderMaterial vertex={vertex} fragment={fragment} />
  </Mesh>
</Scene3D>
```

## Instanced Mesh

```tsx
<InstancedMesh
  count={instances().length}
  instanceData={instances()}
  instanceSchema={instanceSchema}
>
  <BoxGeometry size={[1, 1, 1]} />
  <ShaderMaterial vertex={instancedVertex} fragment={fragment} />
</InstancedMesh>
```

## Open API Questions

- Should `Scene3D` create a default render pass, depth texture, and camera?
- Should `ShaderMaterial` own its bind group layouts, or should the user pass
  them explicitly?
- Should `BoxGeometry` create CPU-side arrays first, TypeGPU buffers directly,
  or both?
- Should transforms be plain tuples, matrix accessors, or both?
