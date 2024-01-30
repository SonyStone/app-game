import { Link, RouteDefinition } from '@solidjs/router';
import { Component, JSX, Show, lazy } from 'solid-js';
import s from './App.module.scss';

import multitouchThumbnail from '@packages/hammer-examples/thumbnail.png';
import baseTileSizeThumbnail from './thumbnail/base-tile-size-thumbnail.png?url';
import breakoutThumbnail from './thumbnail/breakout-thumbnail.png?url';
import gameOfLifeThumbnail from './thumbnail/chrome_2023-11-18_15-20-36.png?url';
import twglThumbnail from './thumbnail/chrome_2023-11-18_15-44-48.png?url';
import phaserThumbnail from './thumbnail/chrome_2023-11-18_15-46-29.png?url';
import polylinesThumbnail from './thumbnail/chrome_2023-11-18_15-48-40.png?url';
import smaaThumbnail from './thumbnail/chrome_2023-11-18_16-03-08.png?url';
import svgLoaderThumbnail from './thumbnail/chrome_2023-11-18_16-04-46.png?url';
import skinningThumbnail from './thumbnail/chrome_2023-11-18_16-10-52.png?url';
import multipleLayersThumbnail from './thumbnail/multiple-layers-thumbnail.png?url';
import rpgThumbnail from './thumbnail/rpg-thumbnail.png?url';
import spritesThumbnail from './thumbnail/sprites-thumbnail.png?url';
import wireframeThumbnail from './thumbnail/wireframe-thumbnail.png?url';
import worldBodiesThumbnail from './thumbnail/world-rodies-thumbnail.png?url';

function Thumbnail(props: { thumbnail?: string; href: string; name?: string }) {
  return (
    <Link class="aspect-square w-full p-2 relative bg-slate-200 rounded-2 flex" href={props.href}>
      <Show when={!!props.thumbnail}>
        <img class="rounded-1 object-cover" src={props.thumbnail} />
      </Show>
      <Show when={!!props.name}>
        <span class="absolute bottom-0 start-0 px-2 pb-2 max-w-full rounded-se-2 text-2xl leading-6 truncate bg-slate-200">
          {props.name}
        </span>
      </Show>
    </Link>
  );
}

export const routes: (RouteDefinition & {
  name: string | JSX.Element;
  Preview?: Component<{ name: string; path: string }>;
})[] = [
  {
    path: '/',
    name: 'home',
    Preview: (props) => <Thumbnail href={props.path} name={props.name} />,
    component: lazy(() => import('./home-page'))
  },
  {
    path: '/three-pixi',
    name: 'ThreePixi',
    Preview: (props) => <Thumbnail href={props.path} name={props.name} />,
    component: lazy(() => import('./ThreePixi'))
  },
  {
    path: '/3d-rpg',
    name: '3D RPG',
    Preview: (props) => <Thumbnail href={props.path} thumbnail={rpgThumbnail} name={props.name} />,
    component: lazy(() => import('./3d-rpg/Main'))
  },
  {
    path: '/3d-rpg-tests',
    name: '3D RPG Tests',
    Preview: (props) => <Thumbnail href={props.path} name={props.name} />,
    component: lazy(() => import('./3d-rpg/load-fbx-test'))
  },
  {
    path: '/tanki',
    name: 'Tanki',
    Preview: (props) => <Thumbnail href={props.path} name={props.name} />,
    component: lazy(() => import('./Tanki/Tanki'))
  },
  {
    path: '/wasm-game-of-life',
    name: 'Game Of Life',
    Preview: (props) => <Thumbnail href={props.path} thumbnail={gameOfLifeThumbnail} name={props.name} />,
    component: lazy(() => import('./WasmGameOfLife'))
  },
  {
    path: '/my-pixijs',
    name: 'My Pixijs',
    component: lazy(() => import('@packages/pixijs-research/MyPixijs'))
  },
  {
    path: '/3d-wireframe',
    name: '3d Wireframe',
    Preview: (props) => <Thumbnail href={props.path} thumbnail={wireframeThumbnail} name={props.name} />,
    component: lazy(() => import('@packages/pixijs-research/webgl/3d-wireframe/3dWireframe'))
  },
  {
    path: '/webgl_postprocessing_smaa',
    name: 'SMAA',
    Preview: (props) => <Thumbnail href={props.path} thumbnail={smaaThumbnail} name={props.name} />,
    component: lazy(() => import('@packages/three-examples/PostprocessingSmaa'))
  },
  {
    path: '/webgl_loader_svg',
    name: 'SVG Loader',
    Preview: (props) => <Thumbnail href={props.path} thumbnail={svgLoaderThumbnail} name={props.name} />,
    component: lazy(() => import('@packages/three-examples/SvgLoader'))
  },
  {
    path: '/sprites',
    name: 'Sprites',
    Preview: (props) => <Thumbnail href={props.path} thumbnail={spritesThumbnail} name={props.name} />,
    component: lazy(() => import('@packages/three-examples/Sprites'))
  },
  {
    path: '/babylon',
    name: 'Babylon.js',
    Preview: (props) => <Thumbnail href={props.path} name={props.name} />,
    component: lazy(() => import('@packages/babylonjs-examples/babylon-example'))
  },
  {
    path: '/three',
    name: 'Three',
    Preview: (props) => <Thumbnail href={props.path} name={props.name} />,
    component: lazy(() => import('@packages/three-examples/Three'))
  },
  {
    path: '/solid-three',
    name: 'SolidThree',
    Preview: (props) => <Thumbnail href={props.path} name={props.name} />,
    component: lazy(() => import('@packages/three-examples/Solid-Three'))
  },
  {
    path: '/paint',
    name: 'Paint',
    Preview: (props) => <Thumbnail href={props.path} name={props.name} />,
    component: lazy(() => import('@packages/paint/paint-page'))
  },
  {
    path: '/twgl',
    name: 'twgl',
    Preview: (props) => <Thumbnail href={props.path} thumbnail={twglThumbnail} name={props.name} />,
    component: lazy(() => import('@packages/twgl-examples/Main'))
  },
  {
    path: '/view-offset',
    name: 'ViewOffset',
    Preview: (props) => <Thumbnail href={props.path} name={props.name} />,
    component: lazy(() => import('@packages/three-examples/ViewOffset'))
  },
  {
    path: '/game-ecs',
    name: 'Game ECS',
    Preview: (props) => <Thumbnail href={props.path} name={props.name} />,
    component: lazy(() => import('./game-ecs/Index'))
  },
  {
    path: '/gpu-text-rendering',
    name: 'GPU Text Rendering',
    Preview: (props) => <Thumbnail href={props.path} name={props.name} />,
    component: lazy(() => import('./gpu-text-rendering/Index'))
  },
  {
    path: '/geometric-algebra',
    name: 'Geometric Algebra',
    Preview: (props) => <Thumbnail href={props.path} name={props.name} />,
    component: lazy(() => import('./geometric-algebra/GeometricAlgebra'))
  },
  {
    path: '/player',
    name: 'Player',
    Preview: (props) => <Thumbnail href={props.path} name={props.name} />,
    component: lazy(() => import('@packages/film-annotation-player/App'))
  },
  {
    path: '/animations',
    name: 'Animations',
    Preview: (props) => <Thumbnail href={props.path} name={props.name} />,
    component: lazy(() => import('@packages/gsap/Animations'))
  },
  {
    path: '/phaser-game',
    name: 'Phaser',
    Preview: (props) => <Thumbnail href={props.path} thumbnail={phaserThumbnail} name={props.name} />,
    component: lazy(() => import('@packages/phaser-examples/phaser/Game'))
  },
  {
    path: '/100-world-bodies',
    name: '100 world bodies',

    Preview: (props) => <Thumbnail href={props.path} thumbnail={worldBodiesThumbnail} name={props.name} />,
    component: lazy(() => import('@packages/phaser-examples/physics/matterjs/100 world bodies'))
  },
  {
    path: 'bevy-examples/breakout',
    name: 'Breakout',
    Preview: (props) => <Thumbnail href={props.path} thumbnail={breakoutThumbnail} name={props.name} />,
    component: lazy(() => import('@packages/bevy-examples/breakout'))
  },
  {
    path: '/ogl-examples/polylines',
    name: 'Polylines',
    Preview: (props) => <Thumbnail href={props.path} thumbnail={polylinesThumbnail} name={props.name} />,
    component: lazy(() => import('@packages/ogl-examples/polylines'))
  },
  {
    path: '/ogl-examples/skinning',
    name: 'skinning',
    Preview: (props) => <Thumbnail href={props.path} thumbnail={skinningThumbnail} name={props.name} />,
    component: lazy(() => import('@packages/ogl-examples/skinning/skinning'))
  },
  {
    path: '/ogl-examples/msdf-text',
    name: 'MSDF Text',
    Preview: (props) => <Thumbnail href={props.path} name={props.name} />,
    component: lazy(() => import('@packages/ogl-examples/msdf-text/msdf-text'))
  },
  {
    path: '/ogl-examples/sort-transparency',
    name: 'Sort Transparency',
    Preview: (props) => <Thumbnail href={props.path} name={props.name} />,
    component: lazy(() => import('@packages/ogl-examples/sort-transparency/sort-transparency'))
  },
  {
    path: '/ogl-examples/helpers',
    name: 'Helpers',
    Preview: (props) => <Thumbnail href={props.path} name={props.name} />,
    component: lazy(() => import('@packages/ogl-examples/helpers/helpers'))
  },
  {
    path: '/ogl-examples/draw-modes',
    name: 'draw-modes',
    Preview: (props) => <Thumbnail href={props.path} name={props.name} />,
    component: lazy(() => import('@packages/ogl-examples/draw-modes/draw-modes'))
  },
  {
    path: '/ogl-examples/load-gltf',
    name: 'Load glTF',
    Preview: (props) => <Thumbnail href={props.path} name={props.name} />,
    component: lazy(() => import('@packages/ogl-examples/load-gltf/load-gltf'))
  },
  {
    path: '/ldtk-ts-exampless',
    name: 'ldtk-ts example',
    Preview: (props) => <Thumbnail href={props.path} name={props.name} />,
    component: lazy(() => import('@packages/ldtk-ts-examples/example'))
  },
  {
    path: '/hammer-multitouch',
    name: 'Hammer Multitouch',
    Preview: (props) => <Thumbnail href={props.path} thumbnail={multitouchThumbnail} name={props.name} />,
    component: lazy(() => import('@packages/hammer-examples/multitouch'))
  },
  {
    path: '/phaser-examples/tilemap/layer-with-multiple-layers',
    name: 'Multiple Layers',
    Preview: (props) => <Thumbnail href={props.path} thumbnail={multipleLayersThumbnail} name={props.name} />,
    component: lazy(() => import('@packages/phaser-examples/tilemap/layer-with-multiple-layers'))
  },
  {
    path: '/phaser-examples/tilemap/base-tile-size',
    name: 'Base Tile Size',
    Preview: (props) => <Thumbnail href={props.path} thumbnail={baseTileSizeThumbnail} name={props.name} />,
    component: lazy(() => import('@packages/phaser-examples/tilemap/base-tile-size'))
  },
  {
    path: '/game-shaders-for-beginners',
    name: 'Game Shaders For Beginners',
    Preview: (props) => <Thumbnail href={props.path} name={props.name} />,
    component: lazy(() => import('@packages/game-shaders-for-beginners/game-shaders-for-beginners'))
  },
  {
    path: '/webxr-vr-teleport',
    name: 'WebXR VR Teleport',
    Preview: (props) => <Thumbnail href={props.path} name={props.name} />,
    component: lazy(() => import('@packages/three-examples/webxr-vr-teleport/webxr-vr-teleport'))
  },
  {
    path: '/rpg-game',
    name: 'RPG Game',
    Preview: (props) => <Thumbnail href={props.path} name={props.name} />,
    component: lazy(() => import('@packages/phaser-examples/rpg/rpg-game'))
  },
  {
    path: '/:any',
    name: 'Empty',
    Preview: (props) => <Thumbnail href={props.path} name={props.name} />,
    component: () => <div class={s.nothing}>Nothing is here</div>
  }
];
