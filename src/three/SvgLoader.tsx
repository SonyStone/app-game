import { createEffect, onCleanup } from 'solid-js';
import {
  Camera,
  Color,
  GridHelper,
  Scene,
  sRGBEncoding,
  WebGLRenderer,
} from 'three';

import { useStats } from '../Stats.provider';
import { useCamera } from './Camera.provider';
import { loadSVG } from './loadSVG';
import hexagon from './svg/tiger.svg';
import s from './SvgLoader.module.scss';

export default function SvgLoader() {
  const canvas = (<canvas class={s.canvas}></canvas>) as HTMLCanvasElement;

  const { camera, controls, resize } = useCamera();

  const renderer = new WebGLRenderer({ antialias: true, canvas });
  renderer.setPixelRatio(window.devicePixelRatio);
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.outputEncoding = sRGBEncoding;

  controls.init(renderer.domElement);

  const stats = useStats();

  let currentCamera!: Camera;
  createEffect(() => {
    const { width, height } = resize();
    currentCamera = camera();
    renderer.setSize(width, height);
    render();
  });

  function render() {
    stats.begin();
    renderer.render(scene, currentCamera);
    stats.end();
  }
  controls.addEventListener('change', render);
  controls.screenSpacePanning = true;

  const scene = new Scene();

  createEffect(async () => {
    const group = await loadSVG(hexagon);
    scene.add(group);
    render();
  });

  scene.background = new Color(0x000000);

  const helper = new GridHelper(600, 10);
  scene.add(helper);

  onCleanup(() => {
    renderer.dispose();
    controls.dispose();
    scene.clear();
    controls.removeEventListener('change', render);
  });

  return (
    <>
      {/* <GUI>
        <OptionController
          name="size"
          options={['Small', 'Medium', 'Large']}></OptionController>
        <OptionController
          name="speed"
          options={{ Slow: 0.1, Normal: 1, Fast: 5 }}></OptionController>
        <BooleanController name="boolean"></BooleanController>
        <StringController name="string"></StringController>
        <FunctionController name="function"></FunctionController>
      </GUI> */}
      {canvas}
    </>
  );
}
