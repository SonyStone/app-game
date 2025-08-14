import { Mesh, useApplication } from '@packages/solid-pixi';
import { Geometry, MeshGeometry, Shader, TextureShader } from 'pixi.js';
import fragment from './shaderToy.frag';
import vertex from './shaderToy.vert';

export default function ShaderToyMesh() {
  const quadGeometry = new Geometry({
    attributes: {
      aPosition: [
        -100,
        -100, // x, y
        100,
        -100, // x, y
        100,
        100, // x, y,
        -100,
        100 // x, y,
      ]
      // aUV: [0, 0, 1, 0, 1, 1, 0, 1]
    },
    indexBuffer: [0, 1, 2, 0, 2, 3]
  }) as MeshGeometry;

  const shader = Shader.from({
    gl: {
      vertex,
      fragment
    },
    resources: {
      shaderToyUniforms: {
        iResolution: { value: [640, 360, 1], type: 'vec3<f32>' },
        iTime: { value: 0, type: 'f32' }
      }
    }
  }) as TextureShader;

  const app = useApplication();

  return (
    <Mesh
      geometry={quadGeometry}
      shader={shader}
      ref={() => {
        const handler = () => {
          shader.resources.shaderToyUniforms.uniforms.iTime += app.ticker.elapsedMS / 1000;
        };
        app.ticker.add(handler);
        return () => {
          app.ticker.remove(handler);
        };
      }}
      x={app.screen.width / 2}
      y={app.screen.height / 2}
      width={app.screen.width}
      height={app.screen.height}
    />
  );
}
