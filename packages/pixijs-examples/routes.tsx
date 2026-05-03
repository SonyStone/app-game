import { SectionTitle, Thumbnail, type Routes } from '@app-game/app-router';
import { Ripple } from '@app-game/ui-components/ripple';
import { A } from '@solidjs/router';
import { lazy } from 'solid-js';

export const routes = [
  {
    path: '/',
    name: 'Basic',
    Preview: (props) => <Thumbnail href={props.path} name={props.name} />,
    component: lazy(() => import('./pages/BasicExample'))
  },
  {
    path: '/basic-container',
    name: 'Basic Container',
    Preview: (props) => <Thumbnail href={props.path} name={props.name} />,
    component: lazy(() => import('./pages/BasicContainer'))
  },
  {
    path: '/animations',
    name: 'Animations',
    Preview: (props) => <Thumbnail href={props.path} name={props.name} />,
    component: lazy(() => import('./pages/AnimationsExample'))
  },
  {
    path: '/blend-modes',
    name: 'Blend Modes',
    Preview: (props) => <Thumbnail href={props.path} name={props.name} />,
    component: lazy(() => import('./pages/BlendModesExamples'))
  },
  {
    path: '/mouse-trail',
    name: 'Mouse Trail',
    Preview: (props) => <Thumbnail href={props.path} name={props.name} />,
    component: lazy(() => import('./pages/MouseTrail'))
  },
  {
    path: '/render-layers',
    name: 'Render Layers',
    Preview: (props) => <Thumbnail href={props.path} name={props.name} />,
    component: lazy(() => import('./pages/RenderLayers/index'))
  },
  {
    path: '/advanced-scratch-card',
    name: 'Advanced Scratch Card',
    Preview: (props) => <Thumbnail href={props.path} name={props.name} />,
    component: lazy(() => import('./pages/AdvancedScratchCard'))
  },
  {
    path: '/shader-toy-mesh',
    name: 'Shader Toy Mesh',
    Preview: (props) => <Thumbnail href={props.path} name={props.name} />,
    component: lazy(() => import('./pages/MeshAndShaders/ShaderToyMesh'))
  },
  {
    path: '/graphics-simple',
    name: 'Graphics Simple',
    Preview: (props) => <Thumbnail href={props.path} name={props.name} />,
    component: lazy(() => import('./pages/GraphicsSimple'))
  },
  {
    path: '/graphics-advanced',
    name: 'Graphics Advanced',
    Preview: (props) => <Thumbnail href={props.path} name={props.name} />,
    component: lazy(() => import('./pages/GraphicsAdvanced'))
  },
  {
    path: '/graphics-svg',
    name: 'Graphics Svg',
    Preview: (props) => <Thumbnail href={props.path} name={props.name} />,
    component: lazy(() => import('./pages/GraphicsSvg'))
  }
] as const satisfies Routes[];

export const pixijsRoutes: Routes = {
  path: '/pixijs-examples',
  name: 'PixiJS Examples',
  Preview: (props) => (
    <A href={props.path} class="rounded-2 relative">
      <SectionTitle name={props.name} />
      <Ripple class="text-slate/20" />
    </A>
  ),
  component: lazy(() => import('./index')),
  children: routes
};
