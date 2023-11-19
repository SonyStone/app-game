import { createEffect, onCleanup } from 'solid-js';
import {
  Camera,
  Color,
  GridHelper,
  Group,
  Mesh,
  MeshPhongMaterial,
  PointLight,
  Scene,
  sRGBEncoding,
  WebGLRenderer
} from 'three';

import { useStats } from '../../src/Stats.provider';
import { useCamera } from './Camera.provider';
import Controls from './Controls';
import { loadSVG } from './loadSVG';
import hexagon from './svg/diogram.drawio.svg?url';
import s from './SvgLoader.module.scss';

import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader';
import a from './airboat.obj?raw';

const loader = new OBJLoader();
const obj = loader.parse(a);

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

  scene.background = new Color(0xf6f6f6);

  const helper = new GridHelper(600, 10);
  scene.add(helper);

  {
    const g = new Group();
    const light = new PointLight(0xffffff, 0.5);
    // light.matrix.setPosition(10, 10, 10);
    light.translateY(10);
    g.add(light);
    const material = new MeshPhongMaterial();
    (obj.children as Mesh[]).forEach((mesh) => {
      mesh.geometry.computeVertexNormals();
      // const helper = new VertexNormalsHelper(mesh, 0.5, 0xff0000);
      // g.add(helper);
    });
    g.add(obj);

    g.scale.set(3, 3, 3);
    g.rotateY(45);
    g.translateX(90);

    scene.add(g);
  }

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

      <Controls></Controls>
      {canvas}
    </>
  );
}
