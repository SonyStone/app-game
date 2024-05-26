import {
  Box,
  Camera,
  GridHelper,
  Mesh,
  NormalProgram,
  Orbit,
  Renderer,
  Transform,
  Vec3,
  VertexNormalsHelper
} from '@packages/ogl';
import { EyeSpaceFrustum } from '@packages/ogl/extras/eye-space-frustum';
import createRAF from '@solid-primitives/raf';
import { createWindowSize } from '@solid-primitives/resize-observer';
import { effect } from 'solid-js/web';

export default function Frustum() {
  const canvas = (<canvas />) as HTMLCanvasElement;
  const renderer = new Renderer({ dpr: 2, canvas });
  const gl = renderer.gl;
  gl.clearColor(1, 1, 1, 1);

  const camera = new Camera({ fov: 35 });
  camera.position.set(7, 7, 7);
  // camera.position.set(0, 0, 4);
  camera.lookAt([0, 0, 0]);
  const controls = new Orbit(camera);

  const scene = new Transform();

  const frustum = (() => {
    // Add camera used for demonstrating frustum culling
    const frustumCamera = new Camera({
      fov: 35,
      near: 1,
      far: 10
    }) as Camera & { target: Vec3 };
    frustumCamera.target = new Vec3();

    frustumCamera.position.set(-4, 0, 4);
    frustumCamera.lookAt([-4, 0, 0]);
    scene.addChild(frustumCamera);

    {
      const transform = new Transform();
      const geometry = new Box(gl);
      const program = new NormalProgram(gl);
      const mesh = new Mesh(gl, { geometry, program });
      // transform.matrix.set(frustumCamera.projectionViewMatrix.clone().inverse().scale([1, 1, 1]));

      transform.matrix[0] = 1;
      transform.matrix[1] = 0;
      transform.matrix[2] = 0;
      transform.matrix[3] = 0;

      transform.matrix[4] = 0;
      transform.matrix[5] = 1;
      transform.matrix[6] = 0;
      transform.matrix[7] = 0;

      transform.matrix[8] = 0;
      transform.matrix[9] = 0;
      transform.matrix[10] = 1;
      transform.matrix[11] = 1;

      transform.matrix[12] = 0;
      transform.matrix[13] = 0;
      transform.matrix[14] = 0;
      transform.matrix[15] = 1;

      transform.updateMatrix = () => {
        transform.worldMatrixNeedsUpdate = true;
      };
      transform.addChild(mesh);

      scene.addChild(transform);
    }

    {
      const mesh = new Mesh(gl, {
        geometry: new EyeSpaceFrustum(gl, frustumCamera),
        // mode: GL_DRAW_ARRAYS_MODE.LINE_LOOP,
        program: new NormalProgram(gl)
      });

      frustumCamera.addChild(mesh);

      const vertNorms = new VertexNormalsHelper(mesh, { size: 0.5 });
      vertNorms.setParent(scene);
    }

    return { camera: frustumCamera };
  })();

  const size = createWindowSize();
  effect(() => {
    renderer.setSize(size.width, size.height);
    camera.perspective({ aspect: gl.canvas.width / gl.canvas.height });
    frustum.camera.perspective({ aspect: gl.canvas.width / gl.canvas.height });
  });

  new GridHelper(gl, { size: 10, divisions: 10 }).setParent(scene);

  function update(t: number) {
    controls.update();
    renderer.render({ scene, camera });
  }
  console.log(`camera`, frustum.camera);

  const [running, start, stop] = createRAF(update);
  start();

  return canvas;
}
