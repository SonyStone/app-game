import {
  Box,
  Camera,
  Color,
  Mesh,
  Orbit,
  Plane,
  Polyline,
  Program,
  Raycast,
  Renderer,
  Sphere,
  Transform
} from '@packages/ogl';

import { Vec2 } from '@packages/math/v2';
import createRAF from '@solid-primitives/raf';
import { onCleanup } from 'solid-js';
import fragment from './raycasting.frag?raw';
import vertex from './raycasting.vert?raw';

export default function Raycasting() {
  const renderer = new Renderer({ dpr: 2 });
  const gl = renderer.gl;
  gl.clearColor(1, 1, 1, 1);

  const camera = new Camera();
  camera.position.set(2, 1, 5);

  const orbit = new Orbit(camera, {
    ease: 0.9,
    inertia: 0,
    panSpeed: 1,
    rotateSpeed: 1
  });

  function resize() {
    renderer.setSize(window.innerWidth, window.innerHeight);
    camera.perspective({ aspect: gl.canvas.width / gl.canvas.height });
  }
  window.addEventListener('resize', resize, false);
  resize();

  const scene = new Transform();

  const planeGeometry = new Plane(gl);
  const sphereGeometry = new Sphere(gl);
  const cubeGeometry = new Box(gl);

  const program = new Program(gl, {
    vertex,
    fragment,
    cullFace: false,
    uniforms: {
      uHit: { value: 0 }
    }
  });

  const plane = new Mesh(gl, { geometry: planeGeometry, program });
  plane.position.set(0, 1.3, 0);
  plane.setParent(scene);

  const sphere = new Mesh(gl, { geometry: sphereGeometry, program });
  sphere.setParent(scene);

  const cube = new Mesh(gl, { geometry: cubeGeometry, program });
  cube.position.set(0, -1.3, 0);
  cube.setParent(scene);

  // assign update functions to each mesh so they can share a program but
  // still have unique uniforms by updating them just before being drawn
  function updateHitUniform({ mesh }: { mesh: Mesh & { isHit?: boolean } }) {
    program.uniforms.uHit.value = mesh.isHit ? 1 : 0;
  }
  plane.onBeforeRender(updateHitUniform);
  sphere.onBeforeRender(updateHitUniform);
  cube.onBeforeRender(updateHitUniform);

  function update() {
    orbit.update();
    renderer.render({ scene, camera });
  }

  const [running, start, stop] = createRAF(update);
  start();

  const mouse = new Vec2();

  // Create a raycast object
  const raycast = new Raycast();

  // Define an array of the meshes we want to test our ray against
  const meshes: (Mesh & { isHit?: boolean })[] = [plane, sphere, cube];

  const cast = () => {
    const polyline = new Polyline(gl, {
      points: [raycast.origin, raycast.direction],
      uniforms: {
        uColor: { value: new Color('#ddd') },
        uThickness: { value: 3 }
      }
    });

    const mesh = new Mesh(gl, { geometry: polyline.geometry, program: polyline.program });
    mesh.setParent(scene);
  };

  document.addEventListener('dblclick', cast, false);

  // By default, raycast.intersectBounds() tests against the bounding box.
  // Set it to bounding sphere by adding a 'raycast' property set to sphere geometry
  sphere.geometry.raycast = 'sphere';

  // Wrap in load event to prevent checks before page is ready
  document.addEventListener('pointermove', move, false);

  function move(e: PointerEvent) {
    mouse.set(2.0 * (e.x / renderer.width) - 1.0, 2.0 * (1.0 - e.y / renderer.height) - 1.0);

    // Update the ray's origin and direction using the camera and mouse
    raycast.castMouse(camera, mouse);

    // Just for the feedback in this example - reset each mesh's hit to false
    meshes.forEach((mesh) => (mesh.isHit = false));

    // raycast.intersectBounds will test against the bounds of each mesh, and
    // return an array of intersected meshes in order of closest to farthest
    const hits = raycast.intersectBounds(meshes);

    // Can intersect with geometry if the bounds aren't enough, or if you need
    // to find out the uv or normal value at the hit point.
    // Optional arguments include backface culling `cullFace`, and `maxDistance`
    // Both useful for doing early exits to help optimise.
    // const hits = raycast.intersectMeshes(meshes, {
    //     cullFace: true,
    //     maxDistance: 10,
    //     includeUV: true,
    //     includeNormal: true,
    // });
    // if (hits.length) console.log(hits[0].hit.uv);

    // Update our feedback using this array
    hits.forEach((mesh) => (mesh.isHit = true));
  }

  onCleanup(() => {
    orbit.remove();
    document.removeEventListener('dblclick', cast, false);
    document.removeEventListener('pointermove', move, false);
    window.removeEventListener('resize', resize, false);
  });

  return <>{gl.canvas}</>;
}
