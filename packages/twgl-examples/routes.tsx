import { Thumbnail } from '@packages/ui-components/thumbnail';
import { Routes } from '@packages/utils/routes.interface';
import { lazy } from 'solid-js';
import twglThumbnail from './thumbnail/chrome_2023-11-18_15-44-48.png?url';

export const routes: Routes[] = [
  {
    path: '/uniform-buffer-objects',
    name: 'Uniform Buffer Objects',
    Preview: (props) => <Thumbnail href={props.path} name={props.name} />,
    component: lazy(() => import('@packages/twgl-examples/uniform-buffer-objects/uniform-buffer-objects'))
  },
  {
    path: '/twgl-2-development',
    name: '[WIP] TWGL 2 Development',
    Preview: (props) => <Thumbnail href={props.path} name={props.name} />,
    component: lazy(() => import('@packages/twgl-examples/twgl-2-development/twgl-2-development'))
  },
  {
    path: '/twgl',
    name: '[Not working] twgl',
    Preview: (props) => <Thumbnail href={props.path} thumbnail={twglThumbnail} name={props.name} />,
    component: lazy(() => import('@packages/twgl-examples/twgl/main'))
  }
];
