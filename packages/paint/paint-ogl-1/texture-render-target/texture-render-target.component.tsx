import { Camera, OGLRenderingContext, RenderTarget, Renderer, Transform } from '@packages/ogl';
import { PlaneWithTextureComponent } from '@packages/paint/brush-example/plane-with-texture.component';
import { Listen } from '@solid-primitives/event-bus';

export const createTextureRenderTargetComponent = (props: {
  gl: OGLRenderingContext;
  scene: Transform;
  renderer: Renderer;
  render: Listen<void>;
}) => {
  const { gl, renderer, scene } = props;

  // Create render target framebuffer.
  // Uses canvas size by default and doesn't automatically resize.
  // To resize, re-create target
  const target = new RenderTarget(gl, {
    width: 1024,
    height: 1024,
    color: 1,
    depth: false,
    stencil: false
  });

  const camera = new Camera({ fov: 35 });
  {
    camera.position.set(-0.5, -0.5, 1);
    camera.lookAt([-0.5, -0.5, 0]);
    camera.orthographic({ left: 0, right: 1, top: 1, bottom: 0 });
  }

  gl.clearColor(0.8, 0.8, 0.8, 1);
  renderer.render({ scene, camera: camera, target });

  props.render?.(() => {
    renderer.render({ scene, camera: camera, target, clear: false });
  });

  return target;
};

export function TextureRenderTargetComponent(props: {
  gl: OGLRenderingContext;
  scene: Transform;
  brushScene: Transform;
  renderer: Renderer;
  render: Listen<void>;
}) {
  const { gl, scene, renderer } = props;

  // Create render target framebuffer.
  // Uses canvas size by default and doesn't automatically resize.
  // To resize, re-create target
  const renderTarget = new RenderTarget(gl, {
    width: 1024,
    height: 1024,
    color: 1,
    depth: false,
    stencil: false
  });

  const camera = new Camera({ fov: 35 });
  {
    camera.position.set(-0.5, -0.5, 1);
    camera.lookAt([-0.5, -0.5, 0]);
    camera.orthographic({ left: 0, right: 1, top: 1, bottom: 0 });
  }

  gl.clearColor(0.8, 0.8, 0.8, 1);
  renderer.render({ scene: props.brushScene, camera: camera, target: renderTarget });

  props.render?.(() => {
    renderer.render({ scene: props.brushScene, camera: camera, target: renderTarget, clear: false });
  });

  return (
    <>
      <PlaneWithTextureComponent gl={gl} parent={scene} texture={renderTarget.texture} />
    </>
  );
}
