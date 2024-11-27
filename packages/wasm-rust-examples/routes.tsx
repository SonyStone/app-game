import { Thumbnail } from '@packages/ui-components/thumbnail';
import { lazy } from 'solid-js';
import { Routes } from 'src/routes.interface';
import gameOfLifeThumbnail from './chrome_2023-11-18_15-20-36.png?url';

export const routes: Routes[] = [
  {
    path: '/wasm-game-of-life',
    name: 'Game Of Life',
    Preview: (props) => <Thumbnail href={props.path} thumbnail={gameOfLifeThumbnail} name={props.name} />,
    component: lazy(() => import('./wasm-game-of-life/wasm-game-of-life'))
  },
  {
    path: '/wasm-bindgen',
    name: 'WASM Bindgen',
    Preview: (props) => <Thumbnail href={props.path} name={props.name} />,
    component: lazy(() => import('./wasm-bindgen/wasm-bindgen'))
  },
  {
    path: '/wgrpu-hello-triangle',
    name: 'WGPU Hello Triangle',
    Preview: (props) => <Thumbnail href={props.path} name={props.name} />,
    component: lazy(() => import('./wasm-bindgen/wgpu-hello-triangle'))
  },
  {
    path: '/leptos',
    name: 'Leptos',
    Preview: (props) => <Thumbnail href={props.path} name={props.name} />,
    component: lazy(() => import('./wasm-bindgen/test-leptos'))
  },
  {
    path: '/custom-renderer',
    name: 'Custom Renderer',
    Preview: (props) => <Thumbnail href={props.path} name={props.name} />,
    component: lazy(() => import('./wasm-bindgen/custom-renderer'))
  }
];
