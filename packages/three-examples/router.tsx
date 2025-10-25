import { Navigation } from '@packages/app-router/components/navigation';
import { SectionTitle } from '@packages/app-router/components/section-title';
import { Thumbnail } from '@packages/app-router/components/thumbnail';
import { Routes } from '@packages/app-router/routes.interface';
import { Ripple } from '@packages/ui-components/ripple/Ripple';
import { A } from '@solidjs/router';
import { lazy } from 'solid-js';
import smaaThumbnail from './chrome_2023-11-18_16-03-08.png?url';
import svgLoaderThumbnail from './chrome_2023-11-18_16-04-46.png?url';
import rpgThumbnail from './rpg-thumbnail.png?url';
import spritesThumbnail from './sprites-thumbnail.png?url';

const routes: Routes[] = [
  {
    path: '/solid-three',
    name: 'Solid Three',
    Preview: (props) => <Thumbnail href={props.path} name={props.name} />,
    component: lazy(() => import('@packages/three-examples/SolidThreeExample'))
  },
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

export const threeRoutes: Routes = {
  path: '/three-examples',
  name: 'Three js Examples',
  Preview: (props) => (
    <A href={props.path} class="rounded-2 relative">
      <SectionTitle name={props.name} />
      <Ripple class="text-slate/20" />
    </A>
  ),
  children: [
    {
      path: '/',
      component: () => (
        <>
          <div class="flex w-full place-content-center place-items-center bg-blue-100">Three js Examples</div>
          <Navigation routes={routes} parentPath="." />
        </>
      )
    },
    ...routes
  ]
};
