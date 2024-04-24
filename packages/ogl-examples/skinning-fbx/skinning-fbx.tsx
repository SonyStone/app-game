import { Camera, Orbit, Renderer, Transform } from '@packages/ogl';

import mariaWProp from './Maria WProp J J Ong.fbx?url';

import { parse } from './fbx-loader';

export default function App() {
  const renderer = new Renderer({ dpr: 2 });
  const gl = renderer.gl;
  gl.clearColor(1, 1, 1, 1);

  const camera = new Camera({ fov: 35 });
  camera.position.set(6, 2, 6);

  const controls = new Orbit(camera);

  function resize() {
    renderer.setSize(window.innerWidth, window.innerHeight);
    camera.perspective({ aspect: gl.canvas.width / gl.canvas.height });
  }
  window.addEventListener('resize', resize, false);
  resize();

  const scene = new Transform();

  loadModel();
  async function loadModel() {
    const data2 = await (await (await fetch(mariaWProp)).blob()).arrayBuffer();

    parse(data2, gl);
  }

  // Rig JSON data format
  // format is the same as regular model json, with the addition of the rig object
  //
  // {
  //     position: [],
  //     skinWeight: [],
  //     ... other vertex attributes

  //     rig: {
  //         bones: [
  //             {name: 'root', parent: -1},
  //             {name: 'spine', parent: 0},
  //             ... for whole bone hierarchy
  //         ],
  //         bindPose: {
  //             ... for the following properties, values concatenated for all bones, arranged in order of bones array
  //             position: [x1, y1, z1, x2, y2, z2, ...],
  //             quaternion: [x1, y1, z1, w1, x2, y2, z2, w2, ...],
  //             scale: [x1, y1, z1, x2, y2, z2, ...],
  //         },
  //     },
  // }

  return gl.canvas;
}
