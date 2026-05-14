import { Navigation, Thumbnail, type Routes } from '@app-game/app-router';
import { Ripple } from '@app-game/ui-components/ripple';
import { A } from '@solidjs/router';
import { lazy } from 'solid-js';

const routes: Routes[] = [
  {
    path: '/breadcrumbs',
    name: 'Breadcrumbs',
    Preview: (props) => <Thumbnail href={props.path} name={props.name} />,
    component: lazy(() => import('./breadcrumbs/components'))
  },
  {
    path: '/layers',
    name: 'Layers',
    Preview: (props) => <Thumbnail href={props.path} name={props.name} />,
    component: lazy(() => import('./layers/layers'))
  },
  {
    path: '/svg-animations',
    name: 'SVG Animations',
    Preview: (props) => <Thumbnail href={props.path} name={props.name} />,
    component: lazy(() => import('./svg-animations'))
  },
  {
    path: '/css-gradient-border-glowing-animation-hover-effect',
    name: 'CSS Gradient Border Glowing Animation Hover Effect',
    Preview: (props) => <Thumbnail href={props.path} name={props.name} />,
    component: lazy(() => import('./css-gradient-border-glowing-animation-hover-effect'))
  },
  {
    path: '/virtual-scroll',
    name: 'Virtual Scroll Example',
    Preview: (props) => <Thumbnail href={props.path} name={props.name} />,
    component: lazy(() => import('./virtual-scroll'))
  },
  {
    path: '/virtual-scroll-nested',
    name: '[WIP] Virtual Scroll Nested Example',
    Preview: (props) => <Thumbnail href={props.path} name={props.name} />,
    component: lazy(() => import('./virtual-scroll-nested'))
  },
  {
    path: '/docking',
    name: '[WIP] Docking Example',
    Preview: (props) => <Thumbnail href={props.path} name={props.name} />,
    component: lazy(() => import('./docking'))
  },
  {
    path: '/solid-dockview',
    name: 'Solid Dockview',
    Preview: (props) => <Thumbnail href={props.path} name={props.name} />,
    component: lazy(() => import('./solid-dockview'))
  },
  {
    path: '/timeline',
    name: '[WIP] Timeline Example',
    Preview: (props) => <Thumbnail href={props.path} name={props.name} />,
    component: lazy(() => import('./timeline'))
  },
  {
    path: '/solid-motionone',
    name: '[WIP] Solid Motion One Example',
    Preview: (props) => <Thumbnail href={props.path} name={props.name} />,
    component: lazy(() => import('./solid-motionone'))
  },
  {
    path: '/cloud-storage-tree',
    name: 'Cloud Storage Tree',
    Preview: (props) => <Thumbnail href={props.path} name={props.name} />,
    component: lazy(() => import('./cloud-storage-tree'))
  }
];

export const uiComponentsRoutes: Routes = {
  path: '/ui-components-examples',
  Preview: (props) => (
    <A
      class="rounded-2 relative flex aspect-square w-full flex-col place-content-center place-items-center gap-1.5 overflow-hidden overflow-hidden bg-slate-200 p-2 p-2 px-4"
      href={props.path}
    >
      <h2 class="text-4xl">UI/UX</h2>
      <span class="text-center text-sm">Stuff associated with creating a UI</span>
      <div class="absolute -end-2 bottom-1">
        <span class="text-4rem leading-6">🖼️</span>
      </div>
      <Ripple class="text-slate/20" />
    </A>
  ),
  children: [
    {
      path: '/',
      component: () => (
        <>
          <div class="flex w-full place-content-center place-items-center bg-blue-100">UI Components</div>
          <Navigation routes={routes} parentPath="." />
        </>
      )
    },
    ...routes
  ]
};
