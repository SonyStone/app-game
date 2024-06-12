import { Mesh, OGLRenderingContext, Plane, Program, Transform, Vec3 } from '@packages/ogl';
import { onCleanup } from 'solid-js';
import { effect } from 'solid-js/web';
import brushFragment from './brush-shader.frag?raw';
import brushVertex from './brush-shader.vert?raw';

export function Brush2Component(props: { gl: OGLRenderingContext; brushScene: Transform; position: Vec3 }) {
  const { gl, brushScene } = props;

  const program = new Program(gl, {
    vertex: brushVertex,
    fragment: brushFragment,
    transparent: true,
    uniforms: {
      u_color: { value: [1, 0, 0, 0.1] }
    }
  });
  program.setBlendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA, gl.ONE, gl.ONE_MINUS_SRC_ALPHA);

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
