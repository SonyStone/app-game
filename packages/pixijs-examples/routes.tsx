import { SectionTitle } from '@packages/app-router/components/section-title';
import { Thumbnail } from '@packages/app-router/components/thumbnail';
import type { Routes } from '@packages/app-router/routes.interface';
import { Ripple } from '@packages/ui-components/ripple/Ripple';
import { A } from '@solidjs/router';
import { lazy } from 'solid-js';

export const routes: Routes = {
  path: '/pixijs-examples',
  name: 'PixiJS Examples',
  Preview: (props) => (
    <A href={props.path} class="rounded-2 relative">
      <SectionTitle name={props.name} />
      <Ripple class="text-slate/20" />
    </A>
  ),
  component: lazy(() => import('./index')),
  children: [
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
  ]
};
