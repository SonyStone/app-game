import { createEffect, onCleanup } from 'solid-js';
import {
  BoxGeometry,
  Camera,
  GridHelper,
  Group,
  Mesh,
  MeshBasicMaterial,
  Scene,
  TextureLoader,
  WebGLRenderer
} from 'three';

import { useStats } from '../../src/Stats.provider';
import brick_diffuse from './brick_diffuse.jpg';
import { useCamera } from './Camera.provider';
import { EffectComposer } from './postprocessing/EffectComposer';
import { RenderPass } from './postprocessing/RenderPass';
import { SMAAPass } from './postprocessing/SMAAPass';

export default function PostprocessingSmaa() {
  const canvas = (
    <canvas
      style={{
        'touch-action': 'none'
        // 'image-rendering': 'pixelated',
      }}
    ></canvas>
  ) as HTMLCanvasElement;

  const renderer = new WebGLRenderer({
    antialias: true,
    canvas
  });
  renderer.setPixelRatio(window.devicePixelRatio);
  renderer.setSize(window.innerWidth, window.innerHeight);

  const { camera, controls, resize } = useCamera();

  const scene = new Scene();

  const objects = new Group();
  scene.add(objects);

  const geometry = new BoxGeometry(120, 120, 120);
  const material1 = new MeshBasicMaterial({ color: 0xffffff, wireframe: true });

  const mesh1 = new Mesh(geometry, material1);
  mesh1.position.x = -100;
  objects.add(mesh1);

  const texture = new TextureLoader().load(brick_diffuse);
  texture.anisotropy = 4;

  const material2 = new MeshBasicMaterial({ map: texture });

  const mesh2 = new Mesh(geometry, material2);
  mesh2.position.x = 100;
  objects.add(mesh2);

  const helper = new GridHelper(600, 10);
  scene.add(helper);

  // postprocessing

  const composer = new EffectComposer(renderer);
  const renderPass = new RenderPass(scene);

  composer.addPass(renderPass);

  const pass = new SMAAPass(
    window.innerWidth * renderer.getPixelRatio(),
    window.innerHeight * renderer.getPixelRatio()
  );
  composer.addPass(pass);

  createEffect(() => {
    const { width, height } = resize();

    renderer.setSize(width, height);
    composer.setSize(width, height);
  });

  function render() {
    // renderer.render(scene, camera);
    composer.render();
  }

  controls.init(renderer.domElement);
  controls.addEventListener('change', render);
  controls.screenSpacePanning = true;

  let id: number;
  let currentCamera!: Camera;

  createEffect(() => {
    currentCamera = camera();
    renderPass.setCamera(currentCamera);

    cancelAnimationFrame(id);
    animate();
  });

  const stats = useStats();

  function animate() {
    id = requestAnimationFrame(animate);

    stats.begin();

    for (let i = 0; i < objects.children.length; i++) {
      const child = objects.children[i];

      child.rotation.x += 0.005;
      child.rotation.y += 0.01;
    }

    render();

    stats.end();
  }

  onCleanup(() => {
    scene.clear();
    renderer.dispose();
    cancelAnimationFrame(id);
    controls.removeEventListener('change', render);
  });

  return canvas;
}
