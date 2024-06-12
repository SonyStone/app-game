import { Camera, Geometry, Mesh, Program, Renderer, Texture, Transform } from '@packages/ogl';
import createRAF from '@solid-primitives/raf';
import { createWindowSize } from '@solid-primitives/resize-observer';
import { createEffect } from 'solid-js';
import fragment from './ogl-instancing.frag?raw';
import vertex from './ogl-instancing.vert?raw';

import acornTextureSrc from './acorn.jpg?url';
import acornDataSrc from './acorn.json?url';

export default () => {
  const renderer = new Renderer({ dpr: 2 });
  const gl = renderer.gl;
  document.body.appendChild(gl.canvas);
  gl.clearColor(1, 1, 1, 1);

  const camera = new Camera({ fov: 15 });
  camera.position.z = 15;

  const resize = createWindowSize();
  createEffect(() => {
    renderer.setSize(resize.width, resize.height);
    camera.perspective({ aspect: gl.canvas.width / gl.canvas.height });
  });

  const scene = new Transform();

  const texture = (() => {
    const texture = new Texture(gl);
    const img = new Image();
    img.onload = () => (texture.image = img);
    img.src = acornTextureSrc;
    return texture;
  })();

  const program = new Program(gl, {
    vertex,
    fragment,
    uniforms: {
      uTime: { value: 0 },
      tMap: { value: texture }
    }
  });

  let mesh: Mesh;
  (async () => {
    const data = await (await fetch(acornDataSrc)).json();

    const num = 20;

    let offset = new Float32Array(num * 3);
    let random = new Float32Array(num * 3);
    for (let i = 0; i < num; i++) {
      offset.set([Math.random() * 2 - 1, Math.random() * 2 - 1, Math.random() * 2 - 1], i * 3);

      // unique random values are always handy for instances.
      // Here they will be used for rotation, scale and movement.
      random.set([Math.random(), Math.random(), Math.random()], i * 3);
    }

    const geometry = new Geometry(gl, {
      position: { size: 3, data: new Float32Array(data.position) },
      uv: { size: 2, data: new Float32Array(data.uv) },
      normal: { size: 3, data: new Float32Array(data.normal) },

      // simply add the 'instanced' property to flag as an instanced attribute.
      // set the value as the divisor number
      offset: { instanced: 1, size: 3, data: offset },
      random: { instanced: 1, size: 3, data: random }
    });

    mesh = new Mesh(gl, { geometry, program });
    mesh.setParent(scene);
  })();

  const [, start] = createRAF((t) => {
    if (mesh) {
      mesh.rotation.y -= 0.005;
    }
    program.uniforms.uTime.value = t * 0.001;
    renderer.render({ scene, camera });
  });
  start();

  return gl.canvas;
};
