import { JSX, mergeProps } from 'solid-js';
import { BoxGeometry, Mesh, MeshBasicMaterial, PerspectiveCamera, Scene, WebGLRenderer } from 'three';
import { RenderProps } from '../core';

// extend(THREE);

export type Props = Omit<RenderProps<HTMLElement>, 'size' | 'events'> & {
  // ,
  //   HTMLAttributes<HTMLDivElement>
  children: JSX.Element;
  fallback?: JSX.Element;
  // resize?: ResizeOptions
  // events?: (store: StoreApi<RootState>) => EventManager<any>;
  id?: string;
  class?: string;
  height?: string;
  width?: string;
  tabIndex?: number;
  // style?: CSSProperties;
};

// type SetBlock = false | Promise<null> | null;

// const CANVAS_PROPS: Array<keyof Props> = [
//   "gl",
//   "events",
//   "shadows",
//   "linear",
//   "flat",
//   "orthographic",
//   "frameloop",
//   "dpr",
//   "performance",
//   "clock",
//   "raycaster",
//   "camera",
//   "onPointerMissed",
//   "onCreated",
// ];

export function Canvas(props: Props) {
  props = mergeProps(
    {
      height: '100vh',
      width: '100vw'
    },
    props
  );

  const canvas = (<canvas style={{ height: '100%', width: '100%' }} />) as HTMLCanvasElement;
  const containerRef = (
    <div
      style={{
        height: props.height,
        width: props.width,
        position: 'relative',
        overflow: 'hidden'
      }}
      tabIndex={props.tabIndex}
    >
      {canvas}
    </div>
  ) as HTMLDivElement;

  const scene = new Scene();
  const camera = new PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
  const renderer = new WebGLRenderer({
    canvas: canvas,
    antialias: true,
    alpha: true
  });
  renderer.setSize(window.innerWidth, window.innerHeight);

  const geometry = new BoxGeometry(1, 1, 1);
  const material = new MeshBasicMaterial({ color: 0x00ff00 });
  const cube = new Mesh(geometry, material);
  scene.add(cube);

  camera.position.z = 5;

  renderer.render(scene, camera);

  // const root = createThreeRoot(canvas, {
  //   events: createPointerEvents,
  //   size: containerRef.getBoundingClientRect(),
  //   camera: props.camera,
  //   shadows: props.shadows,
  //   onPointerMissed: props.onPointerMissed
  //   // TODO: add the rest of the canvas props!
  // });

  // new ResizeObserver((entries) => {
  //   if (entries[0]?.target !== containerRef) return;
  //   root[0].setSize(entries[0].contentRect.width, entries[0].contentRect.height);
  // }).observe(containerRef);

  // insert(
  //   root[0].scene as unknown as Instance,
  //   (
  //     (<ThreeContext.Provider value={root}>{props.children}</ThreeContext.Provider>) as unknown as Accessor<Instance[]>
  //   )()
  // );

  // onCleanup(() => {
  //   log('three', 'cleanup');
  //   threeReconciler.removeRecursive(root[0].scene.children as any, root[0].scene as any, true);
  //   root[0].scene.clear();
  // });

  return canvas;
}
