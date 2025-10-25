import { Navigation } from '@packages/app-router/components/navigation';
import { Thumbnail } from '@packages/app-router/components/thumbnail';
import { Routes } from '@packages/app-router/routes.interface';
import { Ripple } from '@packages/ui-components/ripple/Ripple';
import { A } from '@solidjs/router';
import { lazy } from 'solid-js';

const routes: Routes[] = [
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
  },
  {
    path: '/buffers',
    name: 'JavaScript Buffers',
    Preview: (props) => <Thumbnail href={props.path} name={props.name} />,
    component: lazy(() => import('./buffers/buffers'))
  },
  {
    path: '/m2x3',
    name: 'Matrix 2x3 - Transform Matrix',
    Preview: (props) => <Thumbnail href={props.path} name={props.name} />,
    component: lazy(() => import('./m2x3'))
  },
  {
    path: '/learn-solidjs-utils',
    name: 'Learn Solidjs Utils',
    Preview: (props) => <Thumbnail href={props.path} name={props.name} />,
    component: lazy(() => import('./learn-solidjs-utils'))
  },
  {
    path: '/rapier-2d-physics-engine',
    name: 'Rapier 2D Physics Engine',
    Preview: (props) => <Thumbnail href={props.path} name={props.name} />,
    component: lazy(() => import('./rapier-2d-physics-engine'))
  },
  {
    path: '/bitecs-ecs-example',
    name: 'Bitecs ECS Example',
    Preview: (props) => <Thumbnail href={props.path} name={props.name} />,
    component: lazy(() => import('./bitecs-ecs'))
  },
  {
    path: '/sensor-access-demo',
    name: 'Sensor Access Demo',
    Preview: (props) => <Thumbnail href={props.path} name={props.name} />,
    component: lazy(() => import('./sensor-access-demo'))
  }
];

export const mathRoutes: Routes = {
  path: '/math',
  name: 'Math Examples',
  Preview: (props) => (
    <A
      class="rounded-2 relative flex aspect-square w-full flex-col place-content-center place-items-center gap-1.5 overflow-hidden overflow-hidden bg-slate-200 p-2 p-2 px-4"
      href={props.path}
    >
      <h2 class="text-4xl">Math</h2>
      <span class="text-center text-sm">{props.name}</span>
      <div class="absolute -end-2 bottom-1">
        <span class="text-4rem leading-6">👨‍🔬</span>
      </div>
      <Ripple class="text-slate/20" />
    </A>
  ),
  children: [
    {
      path: '/',
      component: () => <Navigation routes={routes} parentPath="." />
    },
    ...routes
  ]
};
