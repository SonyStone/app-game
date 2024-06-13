import { Link, RouteDefinition } from '@solidjs/router';
import { Component, JSX, Show, lazy } from 'solid-js';

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
import texturesViewThumbnail from './thumbnail/chrome_2024-06-13_07-04-13.png?url';
import multipleLayersThumbnail from './thumbnail/multiple-layers-thumbnail.png?url';
import rpgGamesThumbnail from './thumbnail/rpg-games.png?url';
import rpgThumbnail from './thumbnail/rpg-thumbnail.png?url';
import spritesThumbnail from './thumbnail/sprites-thumbnail.png?url';
import wireframeThumbnail from './thumbnail/wireframe-thumbnail.png?url';
import worldBodiesThumbnail from './thumbnail/world-rodies-thumbnail.png?url';

function Thumbnail(props: { thumbnail?: string; href: string; name?: string }) {
  return (
    <Link class="rounded-2 relative flex aspect-square w-full bg-slate-200 p-2" href={props.href}>
      <Show when={!!props.thumbnail}>
        <img class="rounded-1 object-cover" src={props.thumbnail} />
      </Show>
      <Show when={!!props.name}>
        <span class="rounded-se-2 absolute bottom-0 start-0 max-w-full bg-slate-200 px-2 pb-2 text-2xl leading-6">
          {props.name}
        </span>
      </Show>
    </Link>
  );
}

const SectionTitle = (props: { name: string }) => (
  <div class="rounded-2 border-e-15 col-start-1 flex place-content-center place-items-center border-slate-200 p-2">
    <h2 class="text-4xl">{props.name}</h2>
  </div>
);

type Routes = Pick<RouteDefinition, 'path' | 'component'> & {
  name?: string | JSX.Element;
  Preview?: Component<{ name: string; path: string }>;
  children?: Routes[];
};

export const routes: Routes[] = [
  {
    path: '/wasm-game-of-life',
    name: 'Game Of Life',
    Preview: (props) => <Thumbnail href={props.path} thumbnail={gameOfLifeThumbnail} name={props.name} />,
    component: lazy(() => import('@packages/wasm-rust-examples/wasm-game-of-life'))
  },

  {
    path: '/math/geometric-algebra',
    name: 'Geometric Algebra',
    Preview: (props) => <Thumbnail href={props.path} name={props.name} />,
    component: lazy(() => import('@packages/math-examples/math-stuff'))
  },
  {
    path: '/player',
    name: 'Player',
    Preview: (props) => <Thumbnail href={props.path} name={props.name} />,
    component: lazy(() => import('@packages/film-annotation-player/App'))
  },

  {
    path: '/100-world-bodies',
    name: '100 world bodies',

    Preview: (props) => <Thumbnail href={props.path} thumbnail={worldBodiesThumbnail} name={props.name} />,
    component: lazy(() => import('@packages/phaser-examples/physics/matterjs/100 world bodies'))
  },

  {
    path: '/ui-components-examples',
    name: 'UI Components',
    Preview: (props) => <Thumbnail href={props.path} name={props.name} />,
    component: lazy(() => import('@packages/ui-components-examples/breadcrumbs/components'))
  },

  {
    path: '/gsap-scroll-trigger-svg-text-mask',
    name: 'ScrollTrigger: SVG Text Mask',
    Preview: (props) => <Thumbnail href={props.path} name={props.name} />,
    component: lazy(() => import('@packages/gsap-examples/scroll-trigger-svg-text-mask/scroll-trigger-svg-text-mask'))
  },
  {
    path: '/paint',
    Preview: (props) => (
      <div class="rounded-2 relative col-start-1 flex flex-col place-content-center place-items-center gap-1.5 overflow-hidden p-2 px-4">
        <h2 class="text-4xl">Paint App</h2>
        <span class="text-center text-sm">Stuff associated with creating a drawing application</span>
        <div class="absolute -end-2 bottom-1">
          <span class="text-4rem leading-6">🎨</span>
        </div>
      </div>
    ),
    children: [
      {
        path: '/hammer-multitouch',
        name: 'Hammer Multitouch',
        Preview: (props) => <Thumbnail href={props.path} thumbnail={multitouchThumbnail} name={props.name} />,
        component: lazy(() => import('@packages/hammer-examples/multitouch'))
      },
      {
        path: '/brush-example',
        name: 'Brush Example',
        Preview: (props) => <Thumbnail href={props.path} thumbnail={texturesViewThumbnail} name={props.name} />,
        component: lazy(() => import('@packages/paint/brush-example/ogl-swap-textures-view'))
      },
      {
        path: '/paint',
        name: 'Paint',
        Preview: (props) => <Thumbnail href={props.path} name={props.name} />,
        component: lazy(() => import('@packages/paint/paint-1/paint-page'))
      },
      {
        path: '/ogl-paint-render-target',
        name: 'OGL paint render target',
        Preview: (props) => <Thumbnail href={props.path} name={props.name} />,
        component: lazy(() => import('@packages/paint/paint-ogl-1/paint-1'))
      },
      {
        path: '/ogl-paint-full-screen',
        name: 'OGL paint full screen canvas',
        Preview: (props) => <Thumbnail href={props.path} name={props.name} />,
        component: lazy(() => import('@packages/paint/paint-ogl-1/paint-2'))
      },
      {
        path: '/paint-app',
        name: 'paint app [WIP]',
        Preview: (props) => <Thumbnail href={props.path} name={props.name} />,
        component: lazy(() => import('@packages/paint/paint-app/paint-app'))
      }
    ]
  },

  {
    path: '/webgl-examples',
    name: 'WebGL Examples',
    Preview: (props) => <SectionTitle name={props.name} />,
    children: [
      {
        path: '/simple-program',
        name: 'Simple Program (nothing to see)',
        Preview: (props) => <Thumbnail href={props.path} name={props.name} />,
        component: lazy(() => import('@packages/webgl-examples/simple-program/simple-program'))
      },
      {
        path: '/matrices-2d',
        name: '2d matrices',
        Preview: (props) => <Thumbnail href={props.path} name={props.name} />,
        component: lazy(() => import('@packages/webgl-examples/matrices-2d/matrices-2d'))
      },
      {
        path: '/meshing',
        name: 'Meshing [WIP]',
        Preview: (props) => <Thumbnail href={props.path} name={props.name} />,
        component: lazy(() => import('@packages/webgl-examples/ogl-meshing/meshing'))
      },
      {
        path: '/instanced-drawing',
        name: 'Instanced Drawing',
        Preview: (props) => <Thumbnail href={props.path} name={props.name} />,
        component: lazy(() => import('@packages/webgl-examples/instanced-drawing/instanced-drawing'))
      },
      {
        path: '/blending-modes',
        name: 'Blending Modes',
        Preview: (props) => <Thumbnail href={props.path} name={props.name} />,
        component: lazy(() => import('@packages/webgl-examples/ogl-blending-modes/ogl-blending-modes'))
      }
    ]
  },
  {
    path: '/ogl-examples',
    name: 'OGL Examples',
    Preview: (props) => <SectionTitle name={props.name} />,
    children: [
      {
        path: '/polylines',
        name: 'OGL Polylines',
        Preview: (props) => <Thumbnail href={props.path} thumbnail={polylinesThumbnail} name={props.name} />,
        component: lazy(() => import('@packages/ogl-examples/polylines'))
      },
      {
        path: '/skinning',
        name: 'OGL skinning',
        Preview: (props) => <Thumbnail href={props.path} thumbnail={skinningThumbnail} name={props.name} />,
        component: lazy(() => import('@packages/ogl-examples/skinning/skinning'))
      },
      {
        path: '/msdf-text',
        name: 'OGL MSDF Text',
        Preview: (props) => <Thumbnail href={props.path} name={props.name} />,
        component: lazy(() => import('@packages/ogl-examples/msdf-text/msdf-text'))
      },
      {
        path: '/sort-transparency',
        name: 'OGL Sort Transparency',
        Preview: (props) => <Thumbnail href={props.path} name={props.name} />,
        component: lazy(() => import('@packages/ogl-examples/sort-transparency/sort-transparency'))
      },
      {
        path: '/helpers',
        name: 'OGL Helpers',
        Preview: (props) => <Thumbnail href={props.path} name={props.name} />,
        component: lazy(() => import('@packages/ogl-examples/helpers/helpers'))
      },
      {
        path: '/draw-modes',
        name: 'OGL Draw modes',
        Preview: (props) => <Thumbnail href={props.path} name={props.name} />,
        component: lazy(() => import('@packages/ogl-examples/draw-modes/draw-modes'))
      },
      {
        path: '/load-gltf',
        name: 'Load glTF',
        Preview: (props) => <Thumbnail href={props.path} name={props.name} />,
        component: lazy(() => import('@packages/ogl-examples/load-gltf/load-gltf'))
      },

      {
        path: '/ogl-flowmap',
        name: 'OGL Flowmap',
        Preview: (props) => <Thumbnail href={props.path} name={props.name} />,
        component: lazy(() => import('@packages/ogl-examples/flowmap/flowmap'))
      },
      {
        path: '/ogl-mouse-flowmap',
        name: 'OGL Mouse Flowmap',
        Preview: (props) => <Thumbnail href={props.path} name={props.name} />,
        component: lazy(() => import('@packages/ogl-examples/mouse-flowmap/mouse-flowmap'))
      },
      {
        path: '/ogl-raycasting',
        name: 'OGL Raycasting',
        Preview: (props) => <Thumbnail href={props.path} name={props.name} />,
        component: lazy(() => import('@packages/ogl-examples/raycasting/raycasting'))
      },
      {
        path: '/ogl-frustum',
        name: 'OGL Frustum',
        Preview: (props) => <Thumbnail href={props.path} name={props.name} />,
        component: lazy(() => import('@packages/ogl-examples/frustum/frustum'))
      },
      {
        path: '/ogl-mouse-flowmap',
        name: 'OGL Mouse Flowmap',
        Preview: (props) => <Thumbnail href={props.path} name={props.name} />,
        component: lazy(() => import('@packages/ogl-examples/mouse-flowmap/mouse-flowmap'))
      },
      {
        path: '/ogl-instancing',
        name: 'OGL Instancing',
        Preview: (props) => <Thumbnail href={props.path} name={props.name} />,
        component: lazy(() => import('@packages/ogl-examples/ogl-instancing/ogl-instancing'))
      }
    ]
  },
  {
    path: '/three-examples',
    name: 'Three js Examples',
    Preview: (props) => <SectionTitle name={props.name} />,
    children: [
      {
        path: '/three-pixi',
        name: 'ThreePixi (not working)',
        Preview: (props) => <Thumbnail href={props.path} name={props.name} />,
        component: lazy(() => import('@packages/three-examples/ThreePixi'))
      },
      {
        path: '/3d-rpg',
        name: '3D RPG',
        Preview: (props) => <Thumbnail href={props.path} thumbnail={rpgThumbnail} name={props.name} />,
        component: lazy(() => import('@packages/three-examples/3d-rpg/Main'))
      },
      {
        path: '/3d-rpg-tests',
        name: '3D RPG Tests',
        Preview: (props) => <Thumbnail href={props.path} name={props.name} />,
        component: lazy(() => import('@packages/three-examples/3d-rpg/load-fbx-test'))
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
        path: '/view-offset',
        name: 'ViewOffset',
        Preview: (props) => <Thumbnail href={props.path} name={props.name} />,
        component: lazy(() => import('@packages/three-examples/ViewOffset'))
      }
    ]
  },
  {
    path: '/twgl-examples',
    name: 'twgl Examples',
    Preview: (props) => <SectionTitle name={props.name} />,
    children: [
      {
        path: '/uniform-buffer-objects',
        name: 'Uniform Buffer Objects',
        Preview: (props) => <Thumbnail href={props.path} name={props.name} />,
        component: lazy(() => import('@packages/twgl-examples/uniform-buffer-objects/uniform-buffer-objects'))
      }
    ]
  },
  {
    path: '/phaser-examples',
    name: 'Phaser Examples',
    Preview: (props) => <SectionTitle name={props.name} />,
    children: [
      {
        path: '/tilemap/layer-with-multiple-layers',
        name: 'Multiple Layers',
        Preview: (props) => <Thumbnail href={props.path} thumbnail={multipleLayersThumbnail} name={props.name} />,
        component: lazy(() => import('@packages/phaser-examples/tilemap/layer-with-multiple-layers'))
      },
      {
        path: '/tilemap/base-tile-size',
        name: 'Base Tile Size',
        Preview: (props) => <Thumbnail href={props.path} thumbnail={baseTileSizeThumbnail} name={props.name} />,
        component: lazy(() => import('@packages/phaser-examples/tilemap/base-tile-size'))
      },
      {
        path: '/rpg-game',
        name: 'RPG Game',
        Preview: (props) => <Thumbnail href={props.path} name={props.name} thumbnail={rpgGamesThumbnail} />,
        component: lazy(() => import('@packages/phaser-examples/rpg/rpg-game'))
      },
      {
        path: '/phaser-game',
        name: 'Phaser',
        Preview: (props) => <Thumbnail href={props.path} thumbnail={phaserThumbnail} name={props.name} />,
        component: lazy(() => import('@packages/phaser-examples/phaser/Game'))
      },
      {
        path: '/breakout',
        name: 'Breakout',
        Preview: (props) => <Thumbnail href={props.path} thumbnail={breakoutThumbnail} name={props.name} />,
        component: lazy(() => import('@packages/phaser-examples/breakout'))
      }
    ]
  },
  {
    path: '/ecsy-examples',
    name: 'ECSY Examples',
    Preview: (props) => <SectionTitle name={props.name} />,
    children: [
      {
        path: '/circles-boxes',
        name: 'Circles Boxes',
        Preview: (props) => <Thumbnail href={props.path} name={props.name} />,
        component: lazy(() => import('@packages/ecsy-examples/circles-boxes/circles-boxes'))
      },
      {
        path: '/circles-boxes-dom',
        name: 'Circles Boxes DOM',
        Preview: (props) => <Thumbnail href={props.path} name={props.name} />,
        component: lazy(() => import('@packages/ecsy-examples/circles-boxes-dom/circles-boxes-dom'))
      },
      {
        path: '/circles-boxes-pixijs',
        name: 'Circles Boxes Pixijs',
        Preview: (props) => <Thumbnail href={props.path} name={props.name} />,
        component: lazy(() => import('@packages/ecsy-examples/circles-boxes-pixijs/circles-boxes-pixijs'))
      },
      {
        path: '/canvas',
        name: 'Canvas',
        Preview: (props) => <Thumbnail href={props.path} name={props.name} />,
        component: lazy(() => import('@packages/ecsy-examples/canvas/intersecting-circles'))
      },
      {
        path: '/dev',
        name: 'Dev',
        Preview: (props) => <Thumbnail href={props.path} name={props.name} />,
        component: lazy(() => import('@packages/ecsy-examples/dev/dev'))
      }
    ]
  },
  {
    path: '/webgpu-examples',
    name: 'WebGPU Examples',
    Preview: (props) => <SectionTitle name={props.name} />,
    children: [
      {
        path: '/hello-triangle',
        name: 'Hello Triangle',
        Preview: (props) => <Thumbnail href={props.path} name={props.name} />,
        component: lazy(() => import('@packages/webgpu-examples/hello-triangle/hello-triangle'))
      },
      {
        path: '/rotating-cube',
        name: 'Rotating Cube',
        Preview: (props) => <Thumbnail href={props.path} name={props.name} />,
        component: lazy(() => import('@packages/webgpu-examples/rotating-cube/rotating-cube'))
      }
    ]
  },
  {
    path: '/wip',
    Preview: (props) => (
      <div class="rounded-2 border-e-15 col-start-1 flex flex-col place-content-center place-items-center border-slate-200 p-2">
        <h2 class="text-4xl">WIP</h2>
        <span class="text-center">And generally not interesting stuff</span>
      </div>
    )
  },
  {
    path: '/',
    name: 'home',
    Preview: (props) => <Thumbnail href={props.path} name={props.name} />,
    component: lazy(() => import('./home-page'))
  },
  {
    path: '/tanki',
    name: 'Tanki',
    Preview: (props) => <Thumbnail href={props.path} name={props.name} />,
    component: lazy(() => import('@packages/tanki/tanki'))
  },
  {
    path: '/3d-wireframe',
    name: '3d Wireframe',
    Preview: (props) => <Thumbnail href={props.path} thumbnail={wireframeThumbnail} name={props.name} />,
    component: lazy(() => import('@packages/pixijs-research/webgl/3d-wireframe/3dWireframe'))
  },
  {
    path: '/my-pixijs',
    name: 'My Pixijs',
    component: lazy(() => import('@packages/pixijs-research/MyPixijs'))
  },
  {
    path: '/babylon',
    name: 'Babylon.js',
    Preview: (props) => <Thumbnail href={props.path} name={props.name} />,
    component: lazy(() => import('@packages/babylonjs-examples/babylon-example'))
  },
  {
    path: '/twgl',
    name: 'twgl',
    Preview: (props) => <Thumbnail href={props.path} thumbnail={twglThumbnail} name={props.name} />,
    component: lazy(() => import('@packages/twgl-examples/Main'))
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
    path: '/animations',
    name: 'Animations',
    Preview: (props) => <Thumbnail href={props.path} name={props.name} />,
    component: lazy(() => import('@packages/gsap/Animations'))
  },
  {
    path: '/ldtk-ts-exampless',
    name: 'ldtk-ts example',
    Preview: (props) => <Thumbnail href={props.path} name={props.name} />,
    component: lazy(() => import('@packages/ldtk-ts-examples/example'))
  },
  {
    path: '/game-shaders-for-beginners',
    name: '[WIP] Game Shaders For Beginners',
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
    path: '/webgl-state-diagram',
    name: '[WIP] WebGL State Diagram',
    Preview: (props) => <Thumbnail href={props.path} name={props.name} />,
    component: lazy(() => import('@packages/webgl-state-diagram/webgl-state-diagram'))
  },
  {
    path: '/gsap-page-scroll-animation',
    name: 'Page Scroll Animation',
    Preview: (props) => <Thumbnail href={props.path} name={props.name} />,
    component: lazy(() => import('@packages/gsap-examples/page-scroll-animation/page-scroll-animation'))
  },
  {
    path: '/piecs-performance',
    name: 'piecs performance',
    Preview: (props) => <Thumbnail href={props.path} name={props.name} />,
    component: lazy(() => import('@packages/piecs-examles/performance/performance'))
  },
  {
    path: '/litegraph',
    name: '[WIP] litegraph',
    Preview: (props) => <Thumbnail href={props.path} name={props.name} />,
    component: lazy(() => import('@packages/litegraph-examples/litegraph'))
  },
  {
    path: '/litegraph/first-project',
    name: 'litegraph First project',
    Preview: (props) => <Thumbnail href={props.path} name={props.name} />,
    component: lazy(() => import('@packages/litegraph-examples/first-project/first-project'))
  },
  {
    path: '/model-biewer',
    name: '[WIP] Model Viewer',
    Preview: (props) => <Thumbnail href={props.path} name={props.name} />,
    component: lazy(() => import('@packages/webgl-examples/ogl-model-viewer/model-viewer'))
  },
  {
    path: '/:any',
    name: 'Empty',
    Preview: (props) => <Thumbnail href={props.path} name={props.name} />,
    component: () => (
      <div class="flex h-screen w-screen place-content-center place-items-center text-4xl">Nothing is here</div>
    )
  }
];
