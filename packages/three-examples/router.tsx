import { Thumbnail } from '@packages/ui-components/thumbnail';
import { lazy } from 'solid-js';
import { Routes } from 'src/routes.interface';
import smaaThumbnail from './chrome_2023-11-18_16-03-08.png?url';
import svgLoaderThumbnail from './chrome_2023-11-18_16-04-46.png?url';
import rpgThumbnail from './rpg-thumbnail.png?url';
import spritesThumbnail from './sprites-thumbnail.png?url';

export const routes: Routes[] = [
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
];
