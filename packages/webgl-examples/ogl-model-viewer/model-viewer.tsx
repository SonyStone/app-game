import { Camera, Orbit, Renderer, Transform, Vec3 } from '@packages/ogl';
import JingliuBodyA from './JingliuMod/Jingliuf0000Mod/JingliuBodyA.ib?Uint32Array';
import JingliuBodyADiffuse from './JingliuMod/Jingliuf0000Mod/JingliuBodyADiffuse.dds?ArrayBuffer';
import JingliuBodyALightMap from './JingliuMod/Jingliuf0000Mod/JingliuBodyALightMap.dds?ArrayBuffer';
import JingliuBodyPosition from './JingliuMod/Jingliuf0000Mod/JingliuBodyPosition.buf?Float32Array';
import JingliuBodyTexcoord from './JingliuMod/Jingliuf0000Mod/JingliuBodyTexcoord.buf?Float32Array';
import JingliuHairA from './JingliuMod/Jingliuf0000Mod/JingliuHairA.ib?Uint32Array';
import JingliuHairADiffuse from './JingliuMod/Jingliuf0000Mod/JingliuHairADiffuse.dds?ArrayBuffer';
import JingliuHairALightMap from './JingliuMod/Jingliuf0000Mod/JingliuHairALightMap.dds?ArrayBuffer';
import JingliuHairPosition from './JingliuMod/Jingliuf0000Mod/JingliuHairPosition.buf?Float32Array';
import JingliuHairTexcoord from './JingliuMod/Jingliuf0000Mod/JingliuHairTexcoord.buf?Float32Array';
import JingliuHeadA from './JingliuMod/Jingliuf0000Mod/JingliuHeadA.ib?Uint32Array';
import JingliuHeadB from './JingliuMod/Jingliuf0000Mod/JingliuHeadB.ib?Uint32Array';
import JingliuHeadBDiffuse from './JingliuMod/Jingliuf0000Mod/JingliuHeadBDiffuse.dds?ArrayBuffer';
import JingliuHeadBLightMap from './JingliuMod/Jingliuf0000Mod/JingliuHeadBLightMap.dds?ArrayBuffer';
import JingliuHeadPosition from './JingliuMod/Jingliuf0000Mod/JingliuHeadPosition.buf?Float32Array';
import JingliuHeadTexcoord from './JingliuMod/Jingliuf0000Mod/JingliuHeadTexcoord.buf?Float32Array';
import HeaderFile from './JingliuMod/Jingliuf0000Mod/backup_DISABLEDJingliu.txt?raw';

import { createEffect } from 'solid-js';
import { checkerTexture } from './checker-texture';

import createRAF from '@solid-primitives/raf';
import { createWindowSize } from '@solid-primitives/resize-observer';
import { loadModel } from './create-view-model';
import { viewTexture } from './view-texture';
import { viewUVMap } from './view-uv-map';

// https://github.com/SilentNightSound/GI-Model-Importer/blob/main/Tools/genshin_3dmigoto_collect.py
// https://github.com/SilentNightSound/GI-Model-Importer/blob/main/Tools/genshin_3dmigoto_generate.py

export default function ModelViewer() {
  const canvas = (<canvas />) as HTMLCanvasElement;

  {
    const element = HeaderFile.split(']:')[0];
    const lines = element.split('\n');
    const name = lines[0].split(': ')[1];
    console.log(`HeaderFile`, name);
  }

  simpleBufferView(canvas);

  return canvas;
}

// first step - Collects model data (ib, color, texcoord(s), textures)
// Positional data comes from the pointlists, but can force it to be collected from these buffers by using the flag

// Positional data exists for both of the above cases, though the file we get the info from differs
// Order is POSITION (R32G32B32_FLOAT), NORMAL (R32G32B32_FLOAT), TANGENT (R32G32B32A32_FLOAT)
// Sizes are 12, 12, 16 for a total stride of 40
// All other values ignored

function simpleBufferView(canvas: HTMLCanvasElement) {
  const renderer = new Renderer({ dpr: 2, canvas });
  const gl = renderer.gl;
  gl.clearColor(1, 1, 1, 1);

  const camera = new Camera({ fov: 35 });
  const MOVE_BACK = 5;
  camera.position.set([0.3 * MOVE_BACK, 1.43, 0.6 * MOVE_BACK]);

  const controls = new Orbit(camera, { target: new Vec3(0, 1.43, 0) });

  const resize = createWindowSize();
  createEffect(() => {
    renderer.setSize(resize.width, resize.height);
    camera.perspective({ aspect: gl.canvas.width / gl.canvas.height });
  });

  const scene = new Transform();

  Promise.all([
    JingliuHeadPosition(),
    JingliuHeadTexcoord(),
    JingliuHeadBDiffuse(),
    JingliuHeadBLightMap(),
    JingliuHeadA(),
    JingliuHeadB(),
    JingliuBodyPosition(),
    JingliuBodyTexcoord(),
    JingliuBodyADiffuse(),
    JingliuBodyALightMap(),
    JingliuBodyA(),
    JingliuHairPosition(),
    JingliuHairTexcoord(),
    JingliuHairADiffuse(),
    JingliuHairALightMap(),
    JingliuHairA()
  ]).then(
    ([
      jingliuHeadPosition,
      jingliuHeadTexcoord,
      jingliuHeadBDiffuse,
      jingliuHeadBLightMap,
      jingliuHeadA,
      jingliuHeadB,
      jingliuBodyPosition,
      jingliuBodyTexcoord,
      jingliuBodyADiffuse,
      jingliuBodyALightMap,
      jingliuBodyA,
      jingliuHairPosition,
      jingliuHairTexcoord,
      jingliuHairADiffuse,
      jingliuHairALightMap,
      jingliuHairA
    ]) => {
      viewTexture({ gl, scene, diffuse: jingliuBodyADiffuse, position: [-1, 1, 0] });
      viewTexture({ gl, scene, diffuse: jingliuBodyALightMap, position: [-2.1, 1, 0] });
      viewTexture({ gl, scene, diffuse: jingliuHairADiffuse, position: [-1, 2.1, 0] });
      viewTexture({ gl, scene, diffuse: jingliuHairALightMap, position: [-2.1, 2.1, 0] });
      viewTexture({ gl, scene, diffuse: jingliuHeadBDiffuse, position: [1, 1, 0] });
      // viewTexture({ gl, scene, diffuse: jingliuHeadBLightMap, position: [2.1, 1, 0] });

      checkerTexture({ gl, scene });
      {
        const index = new Uint32Array(jingliuHeadA.length + jingliuHeadB.length);
        index.set(jingliuHeadA, 0);
        index.set(jingliuHeadB, jingliuHeadA.length);
        loadModel({
          gl,
          scene,
          data: jingliuHeadPosition,
          index,
          uv: jingliuHeadTexcoord,
          doubleTexcoord: true,
          diffuse: jingliuHeadBDiffuse
        });
        viewUVMap({ gl, scene, index, uv: jingliuHeadTexcoord, doubleTexcoord: true, position: [0.5, 0.5, 0.01] });
      }
      // body
      loadModel({
        gl,
        scene,
        data: jingliuBodyPosition,
        index: jingliuBodyA,
        uv: jingliuBodyTexcoord,
        diffuse: jingliuBodyADiffuse
      });
      viewUVMap({ gl, scene, index: jingliuBodyA, uv: jingliuBodyTexcoord, position: [-1.5, 0.5, 0.01] });

      loadModel({
        gl,
        scene,
        data: jingliuHairPosition,
        index: jingliuHairA,
        uv: jingliuHairTexcoord,
        doubleTexcoord: true,
        diffuse: jingliuHairADiffuse
      });
      viewUVMap({
        gl,
        scene,
        index: jingliuHairA,
        uv: jingliuHairTexcoord,
        doubleTexcoord: true,
        position: [-1.5, 1.6, 0.01]
      });
    }
  );

  const [, start] = createRAF((t: number) => {
    controls.update();
    renderer.render({ scene, camera });
  });
  start();
}
