import { Animation, Camera, Geometry, Mesh, Orbit, Plane, Program, Renderer, Skin, Texture, Transform } from 'ogl';

import snoutAnimSrc from './snout-anim.json?url';
import snoutRigSrc from './snout-rig.json?url';
import snoutShadowSrc from './snout-shadow.jpg?url';
import snoutSrc from './snout.jpg?url';

import meshFragment from './mesh.frag?raw';
import meshVertex from './mesh.vert?raw';

import { createSignal, onCleanup } from 'solid-js';
import { Timeline } from '../../sequence-editor/timeline';
import shadowFragment from './shadow.frag?raw';
import shadowVertex from './shadow.vert?raw';

export default function App() {
  const renderer = new Renderer({ dpr: 2 });
  const gl = renderer.gl;
  gl.clearColor(1, 1, 1, 1);

  const camera = new Camera(gl, { fov: 35 });
  camera.position.set(6, 2, 6);

  const controls = new Orbit(camera);

  function resize() {
    renderer.setSize(window.innerWidth, window.innerHeight);
    camera.perspective({ aspect: gl.canvas.width / gl.canvas.height });
  }
  window.addEventListener('resize', resize, false);
  resize();

  const scene = new Transform();

  let skin: Skin;
  const [animation, setAnimation] = createSignal<Animation | undefined>(undefined);

  loadModel();
  async function loadModel() {
    const data = await (await fetch(snoutRigSrc)).json();
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

    const animationData = await (await fetch(snoutAnimSrc)).json();
    // Animation JSON format
    // data is expected to be baked for each frame, therefore duration is derived
    // from number of frames in array.
    // {
    //     frames: [
    //         {
    //             ... identical format to bindPose above, values are concatenated
    //             position: [x1, y1, z1, x2, y2, z2, ...],
    //             quaternion: [x1, y1, z1, w1, x2, y2, z2, w2, ...],
    //             scale: [x1, y1, z1, x2, y2, z2, ...],
    //         },
    //         ... continue for number of frames
    //     ]
    // }

    const geometry = new Geometry(gl, {
      position: { size: 3, data: new Float32Array(data.position) },
      uv: { size: 2, data: new Float32Array(data.uv) },
      normal: { size: 3, data: new Float32Array(data.normal) },
      skinIndex: { size: 4, data: new Float32Array(data.skinIndex) },
      skinWeight: { size: 4, data: new Float32Array(data.skinWeight) }
    });

    const texture = new Texture(gl);
    const img = new Image();
    img.onload = () => (texture.image = img);
    img.src = snoutSrc;

    const program = new Program(gl, {
      vertex: meshVertex,
      fragment: meshFragment,
      uniforms: {
        tMap: { value: texture }
      }
    });

    // Skin extends Mesh - so on top of passing in geometry and program,
    // pass in the rig data, including a list of bones and their bind transforms.
    // The Skin class will automatically add 'boneTexture' and 'boneTextureSize' uniforms.
    skin = new Skin(gl, { rig: data.rig, geometry, program });
    skin.setParent(scene);

    skin.scale.set(0.01);
    skin.position.y = -1;

    // Helper function to add animation to skin's bones.
    // The Animation class can be used directly for any hierarchy - is not solely for bones.
    setAnimation(skin.addAnimation(animationData));
  }

  // Added baked occlusion on the floor to help ground the character
  initShadow();
  function initShadow() {
    const texture = new Texture(gl);
    const img = new Image();
    img.onload = () => (texture.image = img);
    img.src = snoutShadowSrc;

    const geometry = new Plane(gl, { width: 7, height: 7 });
    const program = new Program(gl, {
      vertex: shadowVertex,
      fragment: shadowFragment,
      uniforms: {
        tMap: { value: texture }
      },
      transparent: true,
      cullFace: false
    });

    const mesh = new Mesh(gl, { geometry, program });
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.y = -1;
    mesh.setParent(scene);
  }

  requestAnimationFrame(update);
  function update(t: number) {
    requestAnimationFrame(update);

    // Control animation but updating the elapsed value.
    // It uses modulo to repeat the animation range,
    // so below is playing a never-ending loop.
    if (animation()) {
      animation()!.elapsed += 0.05;
    }

    // Calling 'update' updates the bones with all of the
    // attached animations based on their weights.
    if (skin) {
      skin.update();
    }

    controls.update();
    renderer.render({ scene, camera });
  }

  onCleanup(() => {
    document.body.removeChild(gl.canvas);
    controls.remove();
    window.removeEventListener('resize', resize, false);
  });

  return (
    <>
      {gl.canvas}
      <Timeline animation={animation()} />
    </>
  );
}
