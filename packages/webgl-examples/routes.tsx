import { Thumbnail } from '@packages/ui-components/thumbnail';
import { lazy } from 'solid-js';
import { Routes } from 'src/routes.interface';

export const routes: Routes[] = [
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
];
