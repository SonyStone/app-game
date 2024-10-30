import { Thumbnail } from '@packages/ui-components/thumbnail';
import { lazy } from 'solid-js';
import { Routes } from 'src/routes.interface';

export const routes: Routes[] = [
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
  },
  {
    path: '/rotating-cube-2',
    name: 'Rotating Cube 2',
    Preview: (props) => <Thumbnail href={props.path} name={props.name} />,
    component: lazy(() => import('./rotating-cube-2/rotating-cube-2'))
  },
  {
    path: '/lesson-1-fundamentals',
    name: 'Lesson 1: Fundamentals',
    Preview: (props) => <Thumbnail href={props.path} name={props.name} />,
    component: lazy(() => import('./lesson-1-fundamentals/lesson-1-fundamentals'))
  }
];
