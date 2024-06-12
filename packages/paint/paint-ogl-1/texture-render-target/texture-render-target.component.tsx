import { Camera, Mesh, OGLRenderingContext, Plane, Program, RenderTarget, Renderer, Transform } from '@packages/ogl';
import { Listen } from '@solid-primitives/event-bus';
import { onCleanup } from 'solid-js';
import postFrag from './post.frag?raw';
import postVert from './post.vert?raw';

export function TextureRenderTargetComponent(props: {
  gl: OGLRenderingContext;
  brushScene: Transform;
  renderer: Renderer;
  renderTarget: RenderTarget;
  scene: Transform;
  render: Listen<void>;
}) {
  const { gl, scene, renderer, renderTarget } = props;

  const camera = new Camera({ fov: 35 });
  camera.position.set(-0.5, -0.5, 1);
  camera.lookAt([-0.5, -0.5, 0]);
  camera.orthographic({ left: 0, right: 1, top: 1, bottom: 0 });

  const targetProgram = new Program(gl, {
    vertex: postVert,
    fragment: postFrag,
    uniforms: {
      tMap: { value: renderTarget.texture }
    }
  });
  targetProgram.setBlendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA, gl.ONE, gl.ONE_MINUS_SRC_ALPHA);

  const geometry = new Plane(gl, { width: 1, height: 1 });
  const mesh = new Mesh(gl, { geometry: geometry, program: targetProgram });
  scene.addChild(mesh);

  const emptyScene = new Transform();
  renderer.render({ scene: emptyScene, camera: camera, target: renderTarget });
  gl.clearColor(1, 1, 1, 1);

  props.render?.(() => {
    // console.log(renderer, targetProgram, gl.isEnabled(gl.BLEND));
    // gl.enable(gl.STENCIL_TEST);
    // gl.stencilFunc(gl.ALWAYS, 1, 0xff);
    // gl.stencilOp(gl.KEEP, gl.REPLACE, gl.REPLACE);
    // gl.colorMask(false, false, false, false);
    renderer.render({ scene: props.brushScene, camera: camera, target: renderTarget, clear: false });
    // gl.stencilFunc(gl.EQUAL, 1, 1);
    // gl.stencilOp(gl.KEEP, gl.KEEP, gl.ZERO);
    // gl.colorMask(true, true, true, true);
    // gl.disable(gl.STENCIL_TEST);
  });

  onCleanup(() => {
    scene.removeChild(mesh);
  });

  return <></>;
}
