import { createEffect, onCleanup } from 'solid-js';
import {
  BoxGeometry,
  Color,
  GridHelper,
  Mesh,
  MeshBasicMaterial,
  Scene,
  sRGBEncoding,
  WebGLRenderer,
} from 'three';

import house from '../isometric/assets/house_1.png';
import { useStats } from '../Stats.provider';
import { useCamera } from './Camera.provider';
import s from './SvgLoader.module.scss';
import {
  createHouse,
  createIsoProjectCamera,
  createTiles,
  loadTexture,
} from './tiles';

export default function Sprites() {
  const canvas = (<canvas class={s.canvas}></canvas>) as HTMLCanvasElement;

  const { camera, controls, resize } = useCamera();

  const renderer = new WebGLRenderer({ antialias: true, canvas });
  renderer.setPixelRatio(window.devicePixelRatio);
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.outputEncoding = sRGBEncoding;
  renderer.sortObjects = false;

  controls.init(renderer.domElement);

  const stats = useStats();

  createEffect(() => {
    const { width, height } = resize();
    renderer.setSize(width, height);
    render();
  });

  const scene = new Scene();

  const group = createTiles(render);

  scene.add(group);

  scene.background = new Color(0x1099bb);

  const tileHight = Math.sqrt(32 * 32 + 32 * 32);

  const helper = new GridHelper(tileHight * 25, 25);
  const helperGrid = (tileHight * 25) / 1.472;
  helper.position.set(0, 0.1, helperGrid);
  helper.rotateY(Math.PI / 4);
  group.add(helper);

  // scene.add(new GridHelper(tileHight * 25, 25));
  group.position.set(tileHight * 12, 0, -(tileHight * 12));
  group.rotateY(-Math.PI / 4);

  {
    const geometry = new BoxGeometry(32, 64, 32);
    const material = new MeshBasicMaterial({ color: 0x55ff55 });
    const cube = new Mesh(geometry, material);
    cube.position.set(500, 10, 400);
    scene.add(cube);
  }

  {
    const house = createHouse(render);
    house.rotateY(-Math.PI / 4);
    house.scale.setScalar(0.3);
    house.position.set(550, 25, -100);
    scene.add(house);
  }

  function render() {
    stats.begin();

    renderer.render(scene, camera);
    stats.end();
  }
  controls.addEventListener('change', render);
  controls.screenSpacePanning = true;

  render();

  onCleanup(() => {
    renderer.dispose();
    controls.dispose();
    scene.clear();
    controls.removeEventListener('change', render);
  });

  return <>{canvas}</>;
}
