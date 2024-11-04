import { Thumbnail } from '@packages/ui-components/thumbnail';
import { lazy } from 'solid-js';
import { Routes } from 'src/routes.interface';

export const routes: Routes[] = [
  {
    path: '/basic',
    name: 'Basic',
    Preview: (props) => <Thumbnail href={props.path} name={props.name} />,
    component: lazy(() => import('@packages/pixijs-examples/basic'))
  },
  {
    path: '/basic-container',
    name: 'Basic Container',
    Preview: (props) => <Thumbnail href={props.path} name={props.name} />,
    component: lazy(() => import('./basic-container/basic-container'))
  },
  {
    path: '/blend-modes',
    name: 'Blend Modes',
    Preview: (props) => <Thumbnail href={props.path} name={props.name} />,
    component: lazy(() => import('@packages/pixijs-examples/blend-modes'))
  },
  {
    path: '/mouse-trail',
    name: 'Mouse Trail',
    Preview: (props) => <Thumbnail href={props.path} name={props.name} />,
    component: lazy(() => import('@packages/pixijs-examples/mouse-trail'))
  }
];
