import { Thumbnail } from '@packages/ui-components/thumbnail';
import { lazy } from 'solid-js';
import { Routes } from 'src/routes.interface';

export const routes: Routes[] = [
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
];
