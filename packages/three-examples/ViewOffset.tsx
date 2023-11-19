import { createEffect, onCleanup } from 'solid-js';
import {
  BoxGeometry,
  GridHelper,
  Group,
  Mesh,
  MeshBasicMaterial,
  PerspectiveCamera,
  Scene,
  TextureLoader,
  WebGLRenderer
} from 'three';

import { useStats } from '../../src/Stats.provider';
import { createResize } from './Camera.provider';
import brick_diffuse from './brick_diffuse.jpg';
import { OrbitControls } from './controls/OrbitControls';

import SharedWorker from './view-offset.worker?sharedworker';

export default function ViewOffset() {
  const canvas = (
    <canvas
      style={{
        'touch-action': 'none'
      }}
    ></canvas>
  ) as HTMLCanvasElement;

  const sharedWorker = new SharedWorker();

  // sharedWorker.port.postMessage('this is a test message to the worker');

  const renderer = new WebGLRenderer({ antialias: true, canvas });
  renderer.setPixelRatio(window.devicePixelRatio);
  renderer.setSize(window.innerWidth, window.innerHeight);

  const stats = useStats();
  const resize = createResize();

  const camera = new PerspectiveCamera(50, window.innerWidth / window.innerHeight, 1, 10000);
  camera.position.z = 300;

  const controls = new OrbitControls();
  controls.screenSpacePanning = true;
  controls.setCamera(camera);
  controls.init(renderer.domElement);

  camera.lookAt(controls.target.x, controls.target.y, controls.target.z);

  let width: number;
  let height: number;
  createEffect(() => {
    const size = resize();
    width = size.width;
    height = size.height;
    renderer.setSize(width, height);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
  });

  const scene = new Scene();

  {
    const objects = new Group();
    scene.add(objects);

    const geometry = new BoxGeometry(120, 120, 120);
    const material1 = new MeshBasicMaterial({
      color: 0xffffff,
      wireframe: true
    });

    const mesh1 = new Mesh(geometry, material1);
    mesh1.position.x = -100;
    objects.add(mesh1);

    const texture = new TextureLoader().load(brick_diffuse);
    texture.anisotropy = 4;

    const material2 = new MeshBasicMaterial({ map: texture });

    const mesh2 = new Mesh(geometry, material2);
    mesh2.position.x = 100;
    objects.add(mesh2);

    const helper = new GridHelper(1600, 60);
    scene.add(helper);
  }

  console.log(`window.screen`, window.screen);

  function render() {
    stats.begin();

    // TODO make dynamic windows detection

    const fullWidth = 1920 + 2560 + 1920;
    const fullHeight = 1440; //+ 1200;

    camera.setViewOffset(fullWidth, fullHeight, window.screenX + 1920, window.screenY, width, height);

    renderer.render(scene, camera);
    stats.end();
  }

  sharedWorker.port.start();
  function onWorkerMessage(message: MessageEvent<any>) {
    // console.log(message);

    camera.matrixWorld.fromArray(message.data.matrixWorld);
    camera.matrixWorldInverse.fromArray(message.data.matrixWorldInverse);
    camera.projectionMatrix.fromArray(message.data.projectionMatrix);
    camera.projectionMatrixInverse.fromArray(message.data.projectionMatrixInverse);
    camera.position.fromArray(message.data.position);
    camera.quaternion.fromArray(message.data.quaternion);
    // camera.updateProjectionMatrix();
  }
  sharedWorker.port.addEventListener('message', onWorkerMessage);
  function onChange(event: any) {
    // console.log(`change`, event);

    const cameraData = {
      matrixWorld: camera.matrixWorld.toArray(),
      matrixWorldInverse: camera.matrixWorldInverse.toArray(),
      projectionMatrix: camera.projectionMatrix.toArray(),
      projectionMatrixInverse: camera.projectionMatrixInverse.toArray(),
      position: camera.position.toArray(),
      quaternion: camera.quaternion.toArray()
    };

    sharedWorker.port.postMessage(cameraData);
    render();
  }
  controls.addEventListener('change', onChange);

  let id: number;
  function animate() {
    id = requestAnimationFrame(animate);
    render();
  }
  animate();

  onCleanup(() => {
    sharedWorker.port.close();
    sharedWorker.port.removeEventListener('message', onWorkerMessage);
    controls.removeEventListener('change', onChange);
    scene.clear();
    controls.dispose();
    cancelAnimationFrame(id);
  });

  return canvas;
}
