import { Navigation, Thumbnail, type Routes } from '@app-game/app-router';
import { Ripple } from '@app-game/ui-components/ripple';
import { A } from '@solidjs/router';
import { lazy } from 'solid-js';
import gameOfLifeThumbnail from './chrome_2023-11-18_15-20-36.png?url';

const routes: Routes[] = [
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
  },
  {
    path: '/draw-cubes',
    name: 'Draw Cubes',
    Preview: (props) => <Thumbnail href={props.path} name={props.name} />,
    component: lazy(() => import('./wasm-bindgen/draw-cubes'))
  }
];

export const wasmRustRoutes: Routes = {
  path: '/wasm',
  Preview: (props) => (
    <A
      class="rounded-2 relative flex aspect-square w-full flex-col place-content-center place-items-center gap-1.5 overflow-hidden overflow-hidden bg-slate-200 p-2 p-2 px-4"
      href={props.path}
    >
      <h2 class="text-4xl">WASM</h2>
      <span class="text-center text-sm">Rust in the browser</span>
      <div class="absolute -end-2 bottom-1">
        <span class="text-4rem leading-6">🦀</span>
      </div>
      <Ripple class="text-slate/20" />
    </A>
  ),
  children: [
    {
      path: '/',
      component: () => (
        <>
          <div class="flex w-full place-content-center place-items-center bg-blue-100">WASM</div>
          <Navigation routes={routes} parentPath="." />
        </>
      )
    },
    ...routes
  ]
};
