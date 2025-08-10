import { Thumbnail } from '@packages/ui-components/thumbnail';
import { Routes } from '@packages/utils/routes.interface';
import { lazy } from 'solid-js';

export const routes: Routes[] = [
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
    component: lazy(() => import('./virtual-scroll/virtual-scroll'))
  },
  {
    path: '/virtual-scroll-nested',
    name: '[WIP] Virtual Scroll Nested Example',
    Preview: (props) => <Thumbnail href={props.path} name={props.name} />,
    component: lazy(() => import('./virtual-scroll-nested/virtual-scroll-nested'))
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
  }
];
