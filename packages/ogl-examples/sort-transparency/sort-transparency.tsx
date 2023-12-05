import { createWindowSize } from '@solid-primitives/resize-observer';
import { Camera, Color, Mesh, Orbit, Plane, Program, Renderer, Texture, Transform } from 'ogl';
import { createEffect, onCleanup } from 'solid-js';

import leaf from './leaf.jpg?url';

import fragment from './sort-transparency.frag?raw';
import vertex from './sort-transparency.vert?raw';

// This demonstrates the default geometry sorting before rendering.
// It does not include sorting between faces/points within a single geometry.
export default function SortTransparency() {
  const renderer = new Renderer({ dpr: 2 });
  const gl = renderer.gl;
  gl.clearColor(1, 1, 1, 1);

  const camera = new Camera(gl, { fov: 35 });
  camera.position.set(0, 0, 7);
  camera.rotation.z = -0.3;

  const controls = new Orbit(camera);

  const resize = createWindowSize();

  createEffect(() => {
    renderer.setSize(resize.width, resize.height);
    camera.perspective({ aspect: gl.canvas.width / gl.canvas.height });
  });

  const scene = new Transform();

  const geometry = new Plane(gl, {
    widthSegments: 10,
    heightSegments: 10
  });

  const texture = new Texture(gl);
  const img = new Image();
  img.onload = () => (texture.image = img);
  img.src = leaf;

  const program = new Program(gl, {
    vertex,
    fragment,
    uniforms: {
      tMap: { value: texture },
      uColor: { value: new Color('#ffc219') }
    },
    transparent: true,
    cullFace: false
  });

  const meshes: Mesh[] = [];

  for (let i = 0; i < 50; i++) {
    const mesh = new Mesh(gl, { geometry, program });
    mesh.position.set((Math.random() - 0.5) * 2, (Math.random() - 0.5) * 2, (Math.random() - 0.5) * 3);
    mesh.rotation.set(0, (Math.random() - 0.5) * 6.28, (Math.random() - 0.5) * 6.28);
    mesh.scale.set(Math.random() * 0.5 + 0.2);
    (mesh as any).speed = Math.random() * 1.5 + 0.2;
    mesh.setParent(scene);
    meshes.push(mesh);
  }

  let requestID = requestAnimationFrame(update);
  function update(t: number) {
    requestID = requestAnimationFrame(update);

    // meshes.forEach((mesh) => {
    //   mesh.rotation.y += 0.05;
    //   mesh.rotation.z += 0.05;
    //   mesh.position.y -= 0.02 * mesh.speed;
    //   if (mesh.position.y < -3) mesh.position.y += 6;
    // });

    // scene.rotation.y += 0.015;

    controls.update();
    // Objects are automatically sorted if renderer.sort === true
    renderer.render({ scene, camera });
  }

  onCleanup(() => {
    cancelAnimationFrame(requestID);
    controls.remove();
  });

  return <>{gl.canvas}</>;
}
