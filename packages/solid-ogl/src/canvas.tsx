import { createResizeObserver } from '@solid-primitives/resize-observer';
import { Camera, Renderer, Transform } from 'ogl';
import {
  createEffect,
  createMemo,
  createSignal,
  mergeProps,
  onCleanup,
  type Component,
  type JSX,
} from 'solid-js';
import { OglContext } from './context';
import { render } from './renderer';
import { applyPropertyValue } from './shared';
import type {
  AnyInstance,
  CanvasProps,
  OglCanvasElement,
  OglRoot,
  OglRootState,
} from './types';
import createRAF from '@solid-primitives/raf';

const resizeRoot = (state: OglRootState, width: number, height: number) => {
  const safeWidth = width || 1;
  const safeHeight = height || 1;

  if (
    state.renderer.width === safeWidth &&
    state.renderer.height === safeHeight
  ) {
    return;
  }

  state.renderer.setSize(safeWidth, safeHeight);

  const currentCamera = state.camera();
  if (currentCamera.type === 'perspective') {
    currentCamera.perspective({ aspect: safeWidth / safeHeight });
  } else {
    currentCamera.orthographic();
  }

  state.invalidate();
  state.render();
};

const createResizeHandler =
  (state: OglRootState, canvas: HTMLCanvasElement) => () => {
    resizeRoot(state, canvas.clientWidth || 1, canvas.clientHeight || 1);
  };

export const Canvas: Component<
  Omit<JSX.CanvasHTMLAttributes<HTMLCanvasElement>, 'children'> & {
    children: JSX.Element;
    camera?:
      | (ConstructorParameters<typeof Camera>[1] & {
          position?: readonly [number, number, number];
        })
      | undefined;
    renderer?: ConstructorParameters<typeof Renderer>[0];
    dpr?: number;
    frameloop?: 'always' | 'demand';
    clearColor?: readonly [number, number, number, number?];
    onCreated?: (state: OglRootState) => void;
    className?: string;
  }
> = (rawProps) => {
  const props = mergeProps(
    {
      dpr: 1,
      frameloop: 'always' as const,
      renderer: undefined,
      camera: undefined,
      clearColor: undefined,
      style: {
        display: 'block',
        width: '100%',
        height: '100%',
      } as JSX.CSSProperties,
    },
    rawProps,
  );

  const className = createMemo(() =>
    [props.class, props.className].filter(Boolean).join(' '),
  );

  const canvas = (
    <canvas
      ref={(element) => {
        if (typeof props.ref === 'function') {
          props.ref(element);
        }
      }}
      class={className()}
      style={props.style}
      id={props.id}
      role={props.role}
      tabIndex={props.tabIndex}
      aria-label={props['aria-label']}
      aria-hidden={props['aria-hidden']}
      aria-describedby={props['aria-describedby']}
    />
  ) as unknown as OglCanvasElement;

  createResizeObserver(canvas, ({ width, height }) => {
    if (!canvas?.__oglState) {
      return;
    }

    resizeRoot(canvas.__oglState, width, height);
  });

  const renderer = new Renderer({
    canvas,
    dpr: props.dpr,
    alpha: true,
    ...(props.renderer ?? {}),
  });
  if (props.clearColor) {
    const [red, green, blue, alpha = 1] = props.clearColor;
    renderer.gl.clearColor(red, green, blue, alpha);
  }

  createEffect(() => {
    if (props.clearColor) {
      const [red, green, blue, alpha = 1] = props.clearColor;
      renderer.gl.clearColor(red, green, blue, alpha);
    }
  });

  const scene = new Transform();
  const cameraOptions = props.camera ? { ...props.camera } : undefined;
  const cameraPosition = cameraOptions?.position;
  if (cameraOptions) {
    delete cameraOptions.position;
  }

  const defaultCamera = new Camera(renderer.gl, {
    fov: 45,
    ...(cameraOptions ?? {}),
  });

  applyPropertyValue(
    defaultCamera as unknown as AnyInstance,
    'position',
    cameraPosition ?? [0, 0, 5],
  );

  const [camera, setCamera] = createSignal(defaultCamera);
  const [time, setTime] = createSignal(0);
  const [delta, setDelta] = createSignal(0);
  const [frame, setFrame] = createSignal(0);
  const [fps, setFps] = createSignal(0);
  const [averageFps, setAverageFps] = createSignal(0);
  let invalidated = true;
  let skipNextFrame = false;
  let startedAt = 0;
  let lastFrameAt = 0;
  let frameCount = 0;

  const renderScene = () => {
    invalidated = false;
    scene.updateMatrixWorld();
    camera().updateMatrixWorld();
    renderer.render({ scene, camera: camera() });
  };

  const resetTiming = () => {
    startedAt = 0;
    lastFrameAt = 0;
    frameCount = 0;
    setTime(0);
    setDelta(0);
    setFrame(0);
    setFps(0);
    setAverageFps(0);
  };

  const state: OglRootState = {
    renderer,
    gl: renderer.gl,
    scene,
    camera,
    time,
    delta,
    frame,
    fps,
    averageFps,
    setCamera(nextCamera) {
      setCamera(() => nextCamera ?? defaultCamera);
      invalidated = true;
    },
    invalidate() {
      invalidated = true;
    },
    render() {
      skipNextFrame = true;
      renderScene();
    },
    resize() {},
    resetTiming,
  };

  (canvas as OglCanvasElement).__oglState = state;

  const root: OglRoot = {
    kind: 'root',
    children: [],
    state,
  };

  const resize = createResizeHandler(state, canvas);
  state.resize = resize;
  resize();

  const dispose = (render as any)(
    () => (
      <OglContext.Provider value={state}>{props.children}</OglContext.Provider>
    ),
    root as any,
  );

  const [, start] = createRAF((timestamp) => {
    if (skipNextFrame) {
      skipNextFrame = false;
      return;
    }

    if (props.frameloop === 'demand' && !invalidated) {
      return;
    }

    if (!startedAt) {
      startedAt = timestamp;
      lastFrameAt = timestamp;
    }

    const elapsed = timestamp - startedAt;
    const nextDelta = timestamp - lastFrameAt;
    frameCount += 1;
    lastFrameAt = timestamp;

    setTime(elapsed * 0.001);
    setDelta(nextDelta > 0 ? nextDelta * 0.001 : 0);
    setFrame(frameCount);
    setFps(nextDelta > 0 ? 1000 / nextDelta : 0);
    setAverageFps(elapsed > 0 ? frameCount / (elapsed * 0.001) : 0);

    renderScene();
  });

  start();

  props.onCreated?.(state);

  onCleanup(() => {
    resetTiming();
    dispose();
    delete (canvas as OglCanvasElement).__oglState;
  });

  return canvas;
};
