import { Link, RouteDefinition } from '@solidjs/router';
import { Component, JSX, Show, lazy } from 'solid-js';
import s from './App.module.scss';

import rpgThumbnail from './2023-11-18_15-27-57.png?url';
import spritesThumbnail from './chrome_2023-11-18_14-44-26.png?url';
import gameOfLifeThumbnail from './chrome_2023-11-18_15-20-36.png?url';
import twglThumbnail from './chrome_2023-11-18_15-44-48.png?url';
import phaserThumbnail from './chrome_2023-11-18_15-46-29.png?url';
import polylinesThumbnail from './chrome_2023-11-18_15-48-40.png?url';
import smaaThumbnail from './chrome_2023-11-18_16-03-08.png?url';
import svgLoaderThumbnail from './chrome_2023-11-18_16-04-46.png?url';
import skinningThumbnail from './chrome_2023-11-18_16-10-52.png?url';
import multipleLayersThumbnail from './chrome_2023-11-18_16-15-13.png?url';
import baseTileSizeThumbnail from './chrome_2023-11-18_16-19-18.png?url';

function Thumbnail(props: { thumbnail: string; link: string; name?: string }) {
  return (
    <Link class="aspect-square w-full p-2 relative bg-slate-200 rounded-2 flex" href={props.link}>
      <img class="rounded-1 object-cover" src={props.thumbnail} />
      <Show when={!!props.name}>
        <span class="absolute bottom-0 start-0 px-2 pb-2 max-w-full rounded-se-2 text-2xl leading-6 truncate bg-slate-200">
          {props.name}
        </span>
      </Show>
    </Link>
  );
}

export const routes: (RouteDefinition & { name: string | JSX.Element; Preview?: Component })[] = [
  {
    path: '/',
    name: 'home',
    component: lazy(() => import('./home-page'))
  },
  {
    path: '/three-pixi',
    name: 'ThreePixi',
    component: lazy(() => import('./ThreePixi'))
  },
  {
    path: '/3d-rpg',
    name: '3D RPG',
    Preview: () => <Thumbnail link="/3d-rpg" thumbnail={rpgThumbnail} name="3D RPG" />,
    component: lazy(() => import('./3d-rpg/Main'))
  },
  {
    path: '/3d-rpg-tests',
    name: '3D RPG Tests',
    component: lazy(() => import('./3d-rpg/load-fbx-test'))
  },
  {
    path: '/tanki',
    name: 'Tanki',
    component: lazy(() => import('./Tanki/Tanki'))
  },
  {
    path: '/wasm-game-of-life',
    name: 'Wasm Game Of Life',
    Preview: () => <Thumbnail link="/wasm-game-of-life" thumbnail={gameOfLifeThumbnail} name="Game Of Life" />,
    component: lazy(() => import('./WasmGameOfLife'))
  },
  {
    path: '/my-pixijs',
    name: 'My Pixijs',
    component: lazy(() => import('./my-pixijs/MyPixijs'))
  },
  {
    path: '/3d-wireframe',
    name: '3d Wireframe',
    component: lazy(() => import('./my-pixijs/webgl/3d-wireframe/3dWireframe'))
  },
  {
    path: '/webgl_postprocessing_smaa',
    name: 'webgl - postprocessing smaa',
    Preview: () => <Thumbnail link="/webgl_postprocessing_smaa" thumbnail={smaaThumbnail} name="SMAA" />,
    component: lazy(() => import('./three/PostprocessingSmaa'))
  },
  {
    path: '/webgl_loader_svg',
    name: 'webgl - svg loader',
    Preview: () => <Thumbnail link="/webgl_loader_svg" thumbnail={svgLoaderThumbnail} name="SVG Loader" />,
    component: lazy(() => import('./three/SvgLoader'))
  },
  {
    path: '/sprites',
    name: 'Sprites',
    Preview: () => <Thumbnail link="/sprites" thumbnail={spritesThumbnail} name="Sprites" />,
    component: lazy(() => import('./three/Sprites'))
  },
  {
    path: '/babylon',
    name: 'Babylon.js',
    component: lazy(() => import('./babylonjs/index'))
  },
  {
    path: '/three',
    name: 'Three',
    component: lazy(() => import('./three/Three'))
  },
  {
    path: '/solid-three',
    name: 'SolidThree',
    component: lazy(() => import('./three/Solid-Three'))
  },
  {
    path: '/paint',
    name: 'Paint',
    component: lazy(() => import('./paint/paint-page'))
  },
  {
    path: '/twgl',
    name: 'twgl',
    Preview: () => <Thumbnail link="/twgl" thumbnail={twglThumbnail} name="twgl" />,
    component: lazy(() => import('./twgl/Main'))
  },
  {
    path: '/view-offset',
    name: 'ViewOffset',
    component: lazy(() => import('./three/ViewOffset'))
  },
  {
    path: '/game-ecs',
    name: 'Game ECS',
    component: lazy(() => import('./game-ecs/Index'))
  },
  {
    path: '/gpu-text-rendering',
    name: 'GPU Text Rendering',
    component: lazy(() => import('./gpu-text-rendering/Index'))
  },
  {
    path: '/geometric-algebra',
    name: 'Geometric Algebra',
    component: lazy(() => import('./geometric-algebra/GeometricAlgebra'))
  },
  {
    path: '/player',
    name: 'Player',
    component: lazy(() => import('./player/App'))
  },
  {
    path: '/animations',
    name: 'Animations',
    component: lazy(() => import('./libs/gsap/Animations'))
  },
  {
    path: '/phaser-game',
    name: 'Phaser Game',
    Preview: () => <Thumbnail link="/phaser-game" thumbnail={phaserThumbnail} name="Phaser" />,
    component: lazy(() => import('./phaser/Game'))
  },
  {
    path: '/100-world-bodies',
    name: '100 world bodies',
    component: lazy(() => import('@packages/phaser-examples/physics/matterjs/100 world bodies'))
  },
  {
    path: 'bevy-examples/breakout',
    name: 'breakout',
    Preview: () => (
      <Link
        class="aspect-square w-full p-2 bg-blueGray border border-solid rounded-2 flex"
        href="bevy-examples/breakout"
      >
        <div class="flex bg-white rounded-1 w-full h-full  place-content-center place-items-center">breakout</div>
      </Link>
    ),
    component: lazy(() => import('@packages/bevy-examples/breakout'))
  },
  {
    path: '/ogl-examples/polylines',
    name: 'polylines',
    Preview: () => <Thumbnail link="/ogl-examples/polylines" thumbnail={polylinesThumbnail} name="Polylines" />,
    component: lazy(() => import('@packages/ogl-examples/polylines'))
  },
  {
    path: '/ogl-examples/skinning',
    name: 'skinning',
    Preview: () => <Thumbnail link="/ogl-examples/skinning" thumbnail={skinningThumbnail} name="Skinning" />,
    component: lazy(() => import('@packages/ogl-examples/skinning'))
  },
  {
    path: '/ldtk-ts-exampless',
    name: 'ldtk-ts example',
    component: lazy(() => import('@packages/ldtk-ts-examples/example'))
  },
  {
    path: '/phaser-examples/tilemap/layer-with-multiple-layers',
    name: 'layer-with-multiple-layers',
    Preview: () => (
      <Thumbnail
        link="/phaser-examples/tilemap/layer-with-multiple-layers"
        thumbnail={multipleLayersThumbnail}
        name="Multiple Layers"
      />
    ),
    component: lazy(() => import('@packages/phaser-examples/tilemap/layer-with-multiple-layers'))
  },
  {
    path: '/phaser-examples/tilemap/base-tile-size',
    name: 'Base Tile Size',
    Preview: () => (
      <Thumbnail
        link="/phaser-examples/tilemap/base-tile-size"
        thumbnail={baseTileSizeThumbnail}
        name="Base Tile Size"
      />
    ),
    component: lazy(() => import('@packages/phaser-examples/tilemap/base-tile-size'))
  },
  {
    path: '/:any',
    name: 'Empty',
    component: () => <div class={s.nothing}>Nothing is here</div>
  }
];
