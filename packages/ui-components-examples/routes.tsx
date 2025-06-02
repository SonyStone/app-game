import { Thumbnail } from '@packages/ui-components/thumbnail';
import { lazy } from 'solid-js';
import { Routes } from 'src/routes.interface';

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
  }
];
