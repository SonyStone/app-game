import { onCleanup } from 'solid-js';
import {
  BoxGeometry,
  GridHelper,
  Group,
  Mesh,
  MeshBasicMaterial,
  Scene,
  TextureLoader,
  WebGLRenderer,
} from 'three';

import { useStats } from '../Stats.provider';
import brick_diffuse from './brick_diffuse.jpg';
import { useCamera } from './Camera.provider';
import { OrbitControls } from './controls/OrbitControls';
import { EffectComposer } from './postprocessing/EffectComposer';
import { RenderPass } from './postprocessing/RenderPass';
import { SMAAPass } from './postprocessing/SMAAPass';

export default function PostprocessingSmaa() {
  const canvas = (
    <canvas
      style={{
        'touch-action': 'none',
        'image-rendering': 'pixelated',
      }}></canvas>
  ) as HTMLCanvasElement;

  const renderer = new WebGLRenderer({
    canvas,
  });
  renderer.setPixelRatio(window.devicePixelRatio);
  renderer.setSize(window.innerWidth, window.innerHeight);
  document.body.appendChild(renderer.domElement);

  //

  const camera = useCamera();

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
  composer.addPass(new RenderPass(scene, camera));

  const pass = new SMAAPass(
    window.innerWidth * renderer.getPixelRatio(),
    window.innerHeight * renderer.getPixelRatio()
  );
  composer.addPass(pass);

  function onWindowResize() {
    const width = window.innerWidth;
    const height = window.innerHeight;

    camera.aspect = width / height;
    camera.updateProjectionMatrix();

    renderer.setSize(width, height);
    composer.setSize(width, height);
  }

  window.addEventListener('resize', onWindowResize);

  function render() {
    renderer.render(scene, camera);
  }
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.addEventListener('change', render);
  controls.screenSpacePanning = true;

  let id: number;

  const stats = useStats();

  function animate() {
    id = requestAnimationFrame(animate);

    stats.begin();

    for (let i = 0; i < objects.children.length; i++) {
      const child = objects.children[i];

      child.rotation.x += 0.005;
      child.rotation.y += 0.01;
    }

    composer.render();

    stats.end();
  }

  onCleanup(() => {
    scene.clear();
    renderer.dispose();
    cancelAnimationFrame(id);
    window.removeEventListener('resize', onWindowResize);
    controls.removeEventListener('change', render);
  });

  animate();

  return canvas;
}
