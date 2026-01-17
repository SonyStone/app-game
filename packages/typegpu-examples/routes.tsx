import { Navigation } from '@packages/app-router/components/navigation';
import { Thumbnail } from '@packages/app-router/components/thumbnail';
import { Routes } from '@packages/app-router/routes.interface';
import { Ripple } from '@packages/ui-components/ripple/Ripple';
import { A } from '@solidjs/router';
import { lazy } from 'solid-js';
import typegpuCausticsExampleThumbnail from './typegpu-caustics-example/thumbnail.png?url';
import typegpuHelloTriangleThumbnail from './typegpu-hello-triangle/thumbnail.png?url';

const routes: Routes[] = [
  {
    path: '/1.1-webgpu-fundamentals',
    name: '[1.1] WebGPU Fundamentals',
    Preview: (props) => <Thumbnail href={props.path} name={props.name} />,
    component: lazy(() => import('./1.1-webgpu-fundamentals'))
  },
  {
    path: '/1.2-run-computations-on-the-gpu',
    name: '[1.2] Run computations on the GPU',
    Preview: (props) => <Thumbnail href={props.path} name={props.name} />,
    component: lazy(() => import('./1.2-run-computations-on-the-gpu'))
  },
  {
    path: '/2-webgpu-inter-stage-variables',
    name: '[2] WebGPU Inter-stage Variables',
    Preview: (props) => <Thumbnail href={props.path} name={props.name} />,
    component: lazy(() => import('./2-webgpu-inter-stage-variables'))
  },
  {
    path: '/3-webgpu-uniforms',
    name: '[3] WebGPU Uniforms',
    Preview: (props) => <Thumbnail href={props.path} name={props.name} />,
    component: lazy(() => import('./3-webgpu-uniforms'))
  },
  {
    path: '/4-webgpu-storage-buffers',
    name: '[4] WebGPU Storage Buffers',
    Preview: (props) => <Thumbnail href={props.path} name={props.name} />,
    component: lazy(() => import('./4-webgpu-storage-buffers'))
  },
  {
    path: '/5.1-webgpu-vertex-buffers',
    name: '[5.1] WebGPU Vertex Buffers',
    Preview: (props) => <Thumbnail href={props.path} name={props.name} />,
    component: lazy(() => import('./5.1-webgpu-vertex-buffers'))
  },
  {
    path: '/5.2-webgpu-instancing-with-vertex-buffers',
    name: '[5.2] WebGPU Instancing with Vertex Buffers',
    Preview: (props) => <Thumbnail href={props.path} name={props.name} />,
    component: lazy(() => import('./5.2-webgpu-instancing-with-vertex-buffers'))
  },
  {
    path: '/5.3-webgpu-index-buffers',
    name: '[5.3] WebGPU Index Buffers',
    Preview: (props) => <Thumbnail href={props.path} name={props.name} />,
    component: lazy(() => import('./5.3-index-buffers'))
  },
  {
    path: '/6.1-webgpu-textures',
    name: '[6.1] WebGPU Textures',
    Preview: (props) => <Thumbnail href={props.path} name={props.name} />,
    component: lazy(() => import('./6.1-webgpu-textures'))
  },
  {
    path: '/6.2-webgpu-loading-images-into-textures',
    name: '[6.2] WebGPU Loading Images into Textures',
    Preview: (props) => <Thumbnail href={props.path} name={props.name} />,
    component: lazy(() => import('./6.2-webgpu-loading-images-into-textures'))
  },
  {
    path: '/6.5-webgpu-multisampling',
    name: '[6.5] WebGPU Multisampling',
    Preview: (props) => <Thumbnail href={props.path} name={props.name} />,
    component: lazy(() => import('./6.5-webgpu-multisampling'))
  },
  {
    path: '/draw-on-canvas',
    name: 'Draw On Canvas',
    Preview: (props) => <Thumbnail href={props.path} name={props.name} />,
    component: lazy(() => import('./draw-on-canvas'))
  },
  {
    path: '/typegpu-caustics-example',
    name: 'TypeGPU Caustics Example',
    Preview: (props) => <Thumbnail href={props.path} name={props.name} thumbnail={typegpuCausticsExampleThumbnail} />,
    component: lazy(() => import('./typegpu-caustics-example'))
  },
  {
    path: '/typegpu-hello-triangle',
    name: 'TypeGPU Hello Triangle',
    Preview: (props) => <Thumbnail href={props.path} name={props.name} thumbnail={typegpuHelloTriangleThumbnail} />,
    component: lazy(() => import('./typegpu-hello-triangle'))
  },
  {
    path: '/rotating-cube-2',
    name: 'Rotating Cube 2',
    Preview: (props) => <Thumbnail href={props.path} name={props.name} />,
    component: lazy(() => import('./rotating-cube-2/rotating-cube-2'))
  }
];

export const typegpuRoutes: Routes = {
  path: '/typegpu-examples',
  name: 'TypeGPU',
  Preview: (props) => (
    <A
      class="rounded-2 relative flex aspect-square w-full flex-col place-content-center place-items-center gap-1.5 overflow-hidden bg-slate-200 p-2 p-2 px-4"
      href={props.path}
    >
      <h2 class="text-4xl">
        {/* <a href="https://webgl2fundamentals.org/" target="_blank">
              </a> */}
        TypeGPU
      </h2>
      <span class="text-center text-sm">Is it here or not?</span>
      <div class="absolute -end-2 bottom-1">
        <span class="text-4rem leading-6">🤨</span>
      </div>
      <Ripple class="text-slate/20" />
    </A>
  ),
  children: [
    {
      path: '/',
      component: () => (
        <>
          <div class="flex w-full place-content-center place-items-center bg-blue-100">TypeGPU Examples</div>
          <Navigation routes={routes} parentPath="." />
        </>
      )
    },
    ...routes
  ]
};
