import { Camera, Geometry, Mesh, Orbit, Program, Renderer, Text, Texture, Transform } from '@packages/ogl';
import { createWindowSize } from '@solid-primitives/resize-observer';
import { createEffect, onCleanup } from 'solid-js';

import firaSansBoldData from './FiraSans-Bold.json?url';
import firaSansBoldImg from './FiraSans-Bold.png?url';

import fragment100 from './msdf-text-100.frag?raw';
import vertex100 from './msdf-text-100.vert?raw';

import fragment300 from './msdf-text-300.frag?raw';
import vertex300 from './msdf-text-300.vert?raw';

export default function MsdfText() {
  const renderer = new Renderer({ dpr: 2 });
  const gl = renderer.gl;
  gl.clearColor(1, 1, 1, 1);

  const camera = new Camera(gl, { fov: 45 });
  camera.position.set(0, 0, 7);

  const controls = new (Orbit as any)(camera);

  const resize = createWindowSize();

  createEffect(() => {
    renderer.setSize(resize.width, resize.height);
    camera.perspective({ aspect: gl.canvas.width / gl.canvas.height });
  });

  const scene = new Transform();

  /*

  Instructions to generate necessary MSDF assets

  Install msdf-bmfont https://github.com/soimy/msdf-bmfont-xml
  `npm install msdf-bmfont-xml -g`

  Then, using a font .ttf file, run the following (using 'FiraSans-Bold.ttf' as example)

  `msdf-bmfont -f json -m 512,512 -d 2 --pot --smart-size FiraSans-Bold.ttf`

  Outputs a .png bitmap spritesheet and a .json with character parameters.

  */

  const texture = new Texture(gl, {
    generateMipmaps: false
  });
  const img = new Image();
  img.onload = () => (texture.image = img);
  img.src = firaSansBoldImg;

  const program = new Program(gl, {
    // Get fallback shader for WebGL1 - needed for OES_standard_derivatives ext
    vertex: renderer.isWebgl2 ? vertex300 : vertex100,
    fragment: renderer.isWebgl2 ? fragment300 : fragment100,
    uniforms: {
      tMap: { value: texture }
    },
    transparent: true,
    cullFace: false,
    depthWrite: false
  });

  loadText();
  async function loadText() {
    const font = await (await fetch(firaSansBoldData)).json();

    const text = new Text({
      font,
      text: "don't panic",
      width: 4,
      align: 'center',
      letterSpacing: -0.05,
      size: 1,
      lineHeight: 1.1
    });

    // Pass the generated buffers into a geometry
    const geometry = new Geometry(gl, {
      position: { size: 3, data: text.buffers.position },
      uv: { size: 2, data: text.buffers.uv },
      // id provides a per-character index, for effects that may require it
      id: { size: 1, data: text.buffers.id },
      index: { data: text.buffers.index }
    });

    const mesh = new Mesh(gl, { geometry, program });

    // Use the height value to position text vertically. Here it is centered.
    mesh.position.y = text.height * 0.5;
    mesh.setParent(scene);
  }

  let requestID = requestAnimationFrame(update);
  function update(t: number) {
    requestID = requestAnimationFrame(update);

    controls.update();
    renderer.render({ scene, camera });
  }

  onCleanup(() => {
    cancelAnimationFrame(requestID);
    controls.remove();
  });

  return <>{gl.canvas}</>;
}
