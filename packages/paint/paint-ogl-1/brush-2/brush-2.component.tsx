import { Mesh, OGLRenderingContext, Plane, Program, RenderTarget, Texture, Transform, Vec3 } from '@packages/ogl';
import { onCleanup } from 'solid-js';
import { effect } from 'solid-js/web';
import brushFragment from './brush-shader.frag?raw';
import brushVertex from './brush-shader.vert?raw';

export function Brush2Component(props: {
  gl: OGLRenderingContext;
  brushScene: Transform;
  position: Vec3;
  renderTarget?: RenderTarget;
}) {
  const { gl, brushScene, renderTarget } = props;
  // A little data texture with 4 colors just to keep things interesting
  const texture4colors = new Texture(gl, {
    image: new Uint8Array([191, 25, 54, 255, 96, 18, 54, 255, 96, 18, 54, 255, 37, 13, 53, 255]),
    width: 1,
    height: 1,
    magFilter: gl.NEAREST
  });

  const program = new Program(gl, {
    vertex: brushVertex,
    fragment: brushFragment,
    transparent: true,
    uniforms: {
      u_color: { value: [1, 0, 0, 0.1] }
    }
  });

  const plane = new Plane(gl, { width: 0.5, height: 0.5 });
  const mesh = new Mesh(gl, { geometry: plane, program: program });
  mesh.scale.set(0.1, 0.1, 0.1);

  brushScene.addChild(mesh);

  onCleanup(() => {
    brushScene.removeChild(mesh);
  });

  effect(() => {
    mesh.position.set(props.position.x, props.position.y, 0);
  });

  return <></>;
}
