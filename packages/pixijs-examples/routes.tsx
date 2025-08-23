import { Thumbnail } from '@packages/ui-components/thumbnail';
import { lazy } from 'solid-js';
import { Routes } from 'src/routes.interface';

export const routes: Routes[] = [
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
    component: lazy(() => import('./pages/BlendModesExamles'))
  },
  {
    path: '/mouse-trail',
    name: 'Mouse Trail',
    Preview: (props) => <Thumbnail href={props.path} name={props.name} />,
    component: lazy(() => import('./pages/mouse-trail'))
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
];
