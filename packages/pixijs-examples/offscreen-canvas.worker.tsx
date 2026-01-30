import { Application, Stage } from '@packages/solid-pixi';
import { gsap } from 'gsap';
import { PixiPlugin } from 'gsap/PixiPlugin';
import { Graphics, VERSION } from 'pixi.js';
import { createMemo, createRoot, createSignal, JSX, lazy, Show } from 'solid-js';
import { Transition } from './Transition';

export const routes = [
  {
    path: '/',
    component: lazy(() => import('./pages/BasicExample'))
  },
  {
    path: '/basic-container',
    component: lazy(() => import('./pages/BasicContainer'))
  },
  {
    path: '/animations',
    component: lazy(() => import('./pages/AnimationsExample'))
  },
  {
    path: '/blend-modes',
    component: lazy(() => import('./pages/BlendModesExamples'))
  },
  {
    path: '/mouse-trail',
    component: lazy(() => import('./pages/MouseTrail'))
  },
  {
    path: '/render-layers',
    component: lazy(() => import('./pages/RenderLayers'))
  },
  {
    path: '/advanced-scratch-card',
    component: lazy(() => import('./pages/AdvancedScratchCard'))
  },
  {
    path: '/shader-toy-mesh',
    component: lazy(() => import('./pages/MeshAndShaders/ShaderToyMesh'))
  },
  {
    path: '/graphics-simple',
    component: lazy(() => import('./pages/GraphicsSimple'))
  },
  {
    path: '/graphics-advanced',
    component: lazy(() => import('./pages/GraphicsAdvanced'))
  },
  {
    path: '/graphics-svg',
    component: lazy(() => import('./pages/GraphicsSvg'))
  }
] as const;

createRoot(() => {
  const [offscreenCanvas, setOffscreenCanvas] = createSignal<OffscreenCanvas | undefined>(undefined);
  const [size, setSize] = createSignal<{ width: number; height: number }>({ width: 800, height: 600 });
  const [currentRoute, setCurrentRoute] = createSignal<string>('/');
  const component = createMemo<JSX.Element | null>(() => {
    const route = routes.find((r) => r.path === currentRoute()) ?? routes[0];

    return (route ? route.component : null) as JSX.Element;
  });

  onmessage = function (evt) {
    switch (evt.data.type) {
      case 'canvas': {
        setOffscreenCanvas(evt.data.canvas);
        return;
      }
      case 'resize': {
        setSize({ width: evt.data.width, height: evt.data.height });
        return;
      }
      case 'route match': {
        setCurrentRoute(evt.data.route);
        return;
      }
      case 'pointerdown': {
        // just an example to show you can receive events from main thread
        console.log('pointerdown', evt.data);
        return;
      }
    }
  };

  postMessage({ status: 'ready' });

  gsap.registerPlugin(PixiPlugin);
  PixiPlugin.registerPIXI({
    VERSION: VERSION,
    Graphics: Graphics
  });

  <Show when={offscreenCanvas()}>
    <Application
      offscreen
      canvas={offscreenCanvas()}
      width={size().width}
      height={size().height}
      background={'#1099bb'}
      useBackBuffer={true}
      antialias={true}
    >
      <Stage>
        <Transition
          onEnter={(el, done) => {
            gsap
              .fromTo(
                el,
                {
                  pixi: {
                    x: el.width / 2,
                    y: el.height / 2,
                    rotation: 360,
                    pivotX: el.width / 2,
                    pivotY: el.height / 2,
                    scaleX: 0,
                    scaleY: 0
                  }
                },
                {
                  pixi: {
                    x: el.width / 2,
                    y: el.height / 2,
                    scaleX: 1,
                    scaleY: 1,
                    pivotX: el.width / 2,
                    pivotY: el.height / 2,
                    rotation: 0
                  },
                  duration: 0.3
                }
              )
              .eventCallback('onComplete', () => {
                done();
              });
          }}
          onExit={(el, done) => {
            gsap
              .to(el, {
                pixi: { y: -size().height },
                duration: 0.5
              })
              .eventCallback('onComplete', () => {
                done();
              });
          }}
        >
          {(component?.() as unknown as () => JSX.Element)()}
        </Transition>
      </Stage>
    </Application>
  </Show>;
});
