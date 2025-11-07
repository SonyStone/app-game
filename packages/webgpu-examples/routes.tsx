import { Navigation } from '@packages/app-router/components/navigation';
import { Thumbnail } from '@packages/app-router/components/thumbnail';
import { Routes } from '@packages/app-router/routes.interface';
import { Ripple } from '@packages/ui-components/ripple/Ripple';
import { A } from '@solidjs/router';
import { lazy } from 'solid-js';

const routes: Routes[] = [
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
  },
  {
    path: '/typegpu-example',
    name: 'TypeGPU Example',
    Preview: (props) => <Thumbnail href={props.path} name={props.name} />,
    component: lazy(() => import('./typegpu-example'))
  }
];

export const webgpuRoutes: Routes = {
  path: '/webgpu-examples',
  name: 'WebGPU',
  Preview: (props) => (
    <A
      class="rounded-2 relative flex aspect-square w-full flex-col place-content-center place-items-center gap-1.5 overflow-hidden bg-slate-200 p-2 p-2 px-4"
      href={props.path}
    >
      <h2 class="text-4xl">
        {/* <a href="https://webgl2fundamentals.org/" target="_blank">
              </a> */}
        WebGPU
      </h2>
      <span class="text-center text-sm">Is it here or not?</span>
      <div class="absolute -end-2 bottom-1">
        <span class="text-4rem leading-6">😐</span>
      </div>
      <Ripple class="text-slate/20" />
    </A>
  ),
  children: [
    {
      path: '/',
      component: () => (
        <>
          <div class="flex w-full place-content-center place-items-center bg-blue-100">WebGPU Examples</div>
          <Navigation routes={routes} parentPath="." />
        </>
      )
    },
    ...routes
  ]
};
