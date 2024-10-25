import { Thumbnail } from '@packages/ui-components/thumbnail';
import { lazy } from 'solid-js';
import { Routes } from 'src/routes.interface';

export const routes: Routes[] = [
  {
    path: '/geometric-algebra',
    name: 'Geometric Algebra',
    Preview: (props) => <Thumbnail href={props.path} name={props.name} />,
    component: lazy(() => import('./geometric-algebra/geometric-algebra'))
  },
  {
    path: '/affine-transformations',
    name: 'Affine Ttransformations',
    Preview: (props) => <Thumbnail href={props.path} name={props.name} />,
    component: lazy(() => import('./affine-transformations'))
  },
  {
    path: '/affine-transformations-3d',
    name: 'Affine Ttransformations 3D',
    Preview: (props) => <Thumbnail href={props.path} name={props.name} />,
    component: lazy(() => import('./affine-transformations-3d'))
  },
  {
    path: '/camera-projection-svg',
    name: 'Camera Projection SVG',
    Preview: (props) => <Thumbnail href={props.path} name={props.name} />,
    component: lazy(() => import('./camera-projection-svg/camera-projection-svg'))
  },
  {
    path: '/camera-projection-webgl2',
    name: 'Camera Projection WebGL2',
    Preview: (props) => <Thumbnail href={props.path} name={props.name} />,
    component: lazy(() => import('./camera-projection-webgl2/camera-projection-webgl2'))
  },
  {
    path: '/plane-equation',
    name: 'Plane Eequation',
    Preview: (props) => <Thumbnail href={props.path} name={props.name} />,
    component: lazy(() => import('./plane-equation'))
  }
];
