import { createEffect, onCleanup } from 'solid-js';
import { Color, GridHelper, Scene, sRGBEncoding, WebGLRenderer } from 'three';
import s from './SvgLoader.module.scss';

import { useStats } from '../Stats.provider';
import { useCamera } from './Camera.provider';
import { OrbitControls } from './controls/OrbitControls';
import { loadSVG } from './loadSVG';
import hexagon from './svg/tiger.svg';

export default function SvgLoader() {
  const canvas = (<canvas class={s.canvas}></canvas>) as HTMLCanvasElement;

  const camera = useCamera();

  const renderer = new WebGLRenderer({ antialias: true, canvas });
  renderer.setPixelRatio(window.devicePixelRatio);
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.outputEncoding = sRGBEncoding;

  const controls = new OrbitControls(camera, renderer.domElement);

  const stats = useStats();

  function render() {
    stats.begin();
    renderer.render(scene, camera);
    stats.end();
  }
  controls.addEventListener('change', render);
  controls.screenSpacePanning = true;

  function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();

    renderer.setSize(window.innerWidth, window.innerHeight);
    render();
  }

  window.addEventListener('resize', onWindowResize);

  const scene = new Scene();

  createEffect(async () => {
    const group = await loadSVG(hexagon);
    scene.add(group);
    render();
  });

  scene.background = new Color(0x555555);

  const helper = new GridHelper(600, 10);
  scene.add(helper);

  render();

  onCleanup(() => {
    camera.clear();
    renderer.dispose();
    controls.dispose();
    scene.clear();
    window.removeEventListener('resize', onWindowResize);
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
