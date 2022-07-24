import { createEffect, onCleanup } from 'solid-js';
import {
  BoxGeometry,
  BufferGeometry,
  Camera,
  GridHelper,
  Line,
  LineBasicMaterial,
  Mesh,
  MeshBasicMaterial,
  Object3D,
  Scene,
  Vector3,
  WebGLRenderer,
} from 'three';

import { useStats } from '../Stats.provider';
import { useCamera } from './Camera.provider';
import s from './SvgLoader.module.scss';

export default function Three() {
  const canvas = (<canvas class={s.canvas}></canvas>) as HTMLCanvasElement;

  const scene = new Scene();

  const { camera, controls, resize } = useCamera();

  const renderer = new WebGLRenderer({
    alpha: true,
    antialias: true,
    canvas,
  });
  renderer.setPixelRatio(window.devicePixelRatio);
  renderer.setSize(window.innerWidth, window.innerHeight);
  controls.init(canvas);

  const object3d = new Object3D();
  object3d.rotateY(30);
  object3d.updateMatrixWorld();

  console.log(`object3d`, object3d);

  const cube = (function () {
    const geometry = new BoxGeometry(100, 100, 100);

    console.log(`geometry`, geometry);

    const material = new MeshBasicMaterial({ color: 0x00ff00 });
    const cube = new Mesh(geometry, material);
    // cube.rotateY(30);

    console.log(`cube`, cube);

    cube.applyMatrix4(object3d.matrix);

    scene.add(cube);

    return cube;
  })();

  const helper = new GridHelper(1600, 20);
  scene.add(helper);

  {
    const material = new LineBasicMaterial({ color: 0x0000ff });
    const points = [
      new Vector3(-500, 0, 0),
      new Vector3(0, 500, 0),
      new Vector3(500, 0, 0),
    ];

    const geometry = new BufferGeometry().setFromPoints(points);
    const line = new Line(geometry, material);
    scene.add(line);
  }

  let id: number;
  const stats = useStats();
  let currentCamera!: Camera;

  function animate() {
    id = requestAnimationFrame(animate);
    stats.begin();
    cube.rotation.x += 0.01;
    cube.rotation.y += 0.01;
    renderer.render(scene, currentCamera);
    stats.end();
  }

  createEffect(() => {
    currentCamera = camera();

    cancelAnimationFrame(id);
    animate();

    render();
  });

  createEffect(() => {
    const { width, height } = resize();
    renderer.setSize(width, height);
    render();
  });

  controls.addEventListener('change', render);

  function render() {
    stats.begin();

    renderer.render(scene, currentCamera);
    stats.end();
  }

  onCleanup(() => {
    renderer.dispose();
    controls.dispose();
    scene.clear();
    controls.removeEventListener('change', render);
    cancelAnimationFrame(id);
  });

  return canvas;
}
