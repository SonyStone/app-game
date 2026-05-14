import { createContext } from 'solid-js';
import { createStore, SetStoreFunction, Store } from 'solid-js/store';
import * as THREE from 'three';
import * as ReactThreeFiber from '../three-types';
import { DomEvent, EventManager, PointerCaptureTarget, ThreeEvent } from './events';
import { Instance, InstanceProps, prepare } from './renderer';
import { calculateDpr } from './utils';

export interface Intersection extends THREE.Intersection {
  eventObject: THREE.Object3D;
}

export type Subscription = {
  ref: RenderCallback;
  priority: number;
};

export type Dpr = number | [min: number, max: number];
export type Size = { width: number; height: number };
export type Viewport = Size & {
  initialDpr: number;
  dpr: number;
  factor: number;
  distance: number;
  aspect: number;
};

export type Camera = THREE.OrthographicCamera | THREE.PerspectiveCamera;
export type Raycaster = THREE.Raycaster & {
  enabled: boolean;
  filter?: FilterFunction;
  computeOffsets?: ComputeOffsetsFunction;
};

export type RenderCallback = (state: RootState, delta: number) => void;

export type Performance = {
  current: number;
  min: number;
  max: number;
  debounce: number;
  regress: () => void;
};

export type Renderer = {
  render: (scene: THREE.Scene, camera: THREE.Camera) => any;
};

export const isRenderer = (def: Renderer) => !!def?.render;
export const isOrthographicCamera = (def: THREE.Camera): def is THREE.OrthographicCamera =>
  def && (def as THREE.OrthographicCamera).isOrthographicCamera;

export type InternalState = {
  active: boolean;
  priority: number;
  frames: number;
  lastProps: StoreProps;
  lastEvent: { current: DomEvent | null };

  interaction: THREE.Object3D[];
  hovered: Map<string, ThreeEvent<DomEvent>>;
  subscribers: Subscription[];
  capturedMap: Map<number, Map<THREE.Object3D, PointerCaptureTarget>>;
  initialClick: [x: number, y: number];
  initialHits: THREE.Object3D[];

  xr: { connect: () => void; disconnect: () => void };
  subscribe: (callback: RenderCallback, priority?: number) => () => void;
};

export type RootState = {
  gl: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: Camera & { manual?: boolean };
  controls: THREE.EventDispatcher | null;
  raycaster: Raycaster;
  mouse: THREE.Vector2;
  clock: THREE.Clock;

  linear: boolean;
  flat: boolean;
  frameloop: 'always' | 'demand' | 'never';
  performance: Performance;

  size: Size;
  viewport: Viewport & {
    getCurrentViewport: (camera?: Camera, target?: THREE.Vector3, size?: Size) => Omit<Viewport, 'dpr' | 'initialDpr'>;
  };

  invalidate: () => void;
  advance: (timestamp: number, runGlobalEffects?: boolean) => void;
  setSize: (width: number, height: number) => void;
  setDpr: (dpr: Dpr) => void;
  setFrameloop: (frameloop?: 'always' | 'demand' | 'never') => void;
  onPointerMissed?: (event: MouseEvent) => void;

  events: EventManager<any>;
  internal: InternalState;
};

export type FilterFunction = (items: THREE.Intersection[], state: RootState) => THREE.Intersection[];
export type ComputeOffsetsFunction = (event: any, state: RootState) => { offsetX: number; offsetY: number };

export type StoreProps = {
  gl: THREE.WebGLRenderer;
  size: Size;
  shadows?: boolean | Partial<THREE.WebGLShadowMap>;
  linear?: boolean;
  flat?: boolean;
  orthographic?: boolean;
  frameloop?: 'always' | 'demand' | 'never';
  performance?: Partial<Omit<Performance, 'regress'>>;
  dpr?: Dpr;
  clock?: THREE.Clock;
  raycaster?: Partial<Raycaster>;
  camera?: (
    | Camera
    | Partial<
        ReactThreeFiber.Object3DNode<THREE.Camera, typeof THREE.Camera> &
          ReactThreeFiber.Object3DNode<THREE.PerspectiveCamera, typeof THREE.PerspectiveCamera> &
          ReactThreeFiber.Object3DNode<THREE.OrthographicCamera, typeof THREE.OrthographicCamera>
      >
  ) & { manual?: boolean };
  onPointerMissed?: (event: MouseEvent) => void;
};

export type ApplyProps = (instance: Instance, newProps: InstanceProps) => void;

export type ThreeStore = [Store<RootState>, SetStoreFunction<RootState>];

const ThreeContext = createContext<ThreeStore>(null!);

const createThreeStore = (
  applyProps: ApplyProps,
  invalidate: (state?: RootState) => void,
  advance: (timestamp: number, runGlobalEffects?: boolean, state?: RootState) => void,
  props: StoreProps
): ThreeStore => {
  const {
    gl,
    size,
    shadows = false,
    linear = false,
    flat = false,
    orthographic = false,
    frameloop = 'always',
    dpr = [1, 2],
    performance,
    clock = new THREE.Clock(),
    raycaster: raycastOptions,
    camera: cameraOptions,
    onPointerMissed
  } = props;

  // Set shadowmap
  if (shadows) {
    gl.shadowMap.enabled = true;
    if (typeof shadows === 'object') Object.assign(gl.shadowMap, shadows);
    else gl.shadowMap.type = THREE.PCFSoftShadowMap;
  }

  // Set color preferences
  if (linear)
    (gl as THREE.WebGLRenderer & { outputColorSpace: unknown }).outputColorSpace = (THREE as unknown as {
      LinearSRGBColorSpace: unknown;
    }).LinearSRGBColorSpace;
  if (flat) gl.toneMapping = THREE.NoToneMapping;

  // clock.elapsedTime is updated using advance(timestamp)
  if (frameloop === 'never') {
    clock.stop();
    clock.elapsedTime = 0;
  }

  // Create custom raycaster
  const raycaster = new THREE.Raycaster() as Raycaster;
  const { params, ...options } = raycastOptions || {};
  applyProps(raycaster as any, {
    enabled: true,
    ...options,
    params: { ...raycaster.params, ...params }
  });

  // Create default camera
  const isCamera = cameraOptions instanceof THREE.Camera;
  const camera = isCamera
    ? (cameraOptions as Camera)
    : orthographic
    ? new THREE.OrthographicCamera(0, 0, 0, 0, 0.1, 1000)
    : new THREE.PerspectiveCamera(75, 0, 0.1, 1000);
  if (!isCamera) {
    camera.position.z = 5;
    if (cameraOptions) applyProps(camera as any, cameraOptions as any);
    // Always look at center by default
    if (!cameraOptions?.rotation) camera.lookAt(0, 0, 0);
  }

  const initialDpr = calculateDpr(dpr);

  const position = new THREE.Vector3();
  const defaultTarget = new THREE.Vector3();
  const tempTarget = new THREE.Vector3();

  const getCurrentViewport = (
    cameraParam?: Camera,
    target: THREE.Vector3 | Parameters<THREE.Vector3['set']> = defaultTarget,
    sizeParam?: Size
  ): {
    width: number;
    height: number;
    factor: number;
    distance: number;
    aspect: number;
  } => {
    const currentCamera = cameraParam || store.camera;
    const currentSize = sizeParam || store.size;
    const { width, height } = currentSize;
    const aspect = width / height;
    if (target instanceof THREE.Vector3) tempTarget.copy(target);
    else tempTarget.set(...target);
    const distance = currentCamera.getWorldPosition(position).distanceTo(tempTarget);
    if (isOrthographicCamera(currentCamera)) {
      return {
        width: width / currentCamera.zoom,
        height: height / currentCamera.zoom,
        factor: 1,
        distance,
        aspect
      };
    } else {
      const fov = (currentCamera.fov * Math.PI) / 180; // convert vertical fov to radians
      const h = 2 * Math.tan(fov / 2) * distance; // visible height
      const w = h * (width / height);
      return { width: w, height: h, factor: width / w, distance, aspect };
    }
  };

  let performanceTimeout: ReturnType<typeof setTimeout> | undefined = undefined;

  // Handle frame behavior in WebXR
  const handleXRFrame = (timestamp: number) => {
    const state = store;
    if (state.frameloop === 'never') return;
    advance(timestamp, true, state);
  };

  // Toggle render switching on session
  const handleSessionChange = () => {
    gl.xr.enabled = gl.xr.isPresenting;
    gl.setAnimationLoop(gl.xr.isPresenting ? handleXRFrame : null);

    // If exiting session, request frame
    if (!gl.xr.isPresenting) invalidate(store);
  };

  // WebXR session manager
  const xr = {
    connect() {
      gl.xr.addEventListener('sessionstart', handleSessionChange);
      gl.xr.addEventListener('sessionend', handleSessionChange);
    },
    disconnect() {
      gl.xr.removeEventListener('sessionstart', handleSessionChange);
      gl.xr.removeEventListener('sessionend', handleSessionChange);
    }
  };

  // Subscribe to WebXR session events
  if (gl.xr) xr.connect();

  const [store, setStore] = createStore<RootState>({
    gl,
    linear,
    flat,
    scene: prepare(new THREE.Scene()),
    camera,
    controls: null,
    raycaster,
    clock,
    mouse: new THREE.Vector2(),
    frameloop,
    onPointerMissed,

    performance: {
      current: 1,
      min: 0.5,
      max: 1,
      debounce: 200,
      ...performance,
      regress: () => {
        const state = store;
        // Clear timeout
        if (performanceTimeout) clearTimeout(performanceTimeout);
        // Set lower bound performance
        if (state.performance.current !== state.performance.min) {
          setStore('performance', 'current', state.performance.min);
        }
        // Go back to upper bound performance after a while unless something regresses meanwhile
        performanceTimeout = setTimeout(
          () => setStore('performance', 'current', store.performance.max),
          state.performance.debounce
        );
      }
    },

    size: { width: 800, height: 600 },
    viewport: {
      initialDpr,
      dpr: initialDpr,
      width: 0,
      height: 0,
      aspect: 0,
      distance: 0,
      factor: 0,
      getCurrentViewport
    },

    invalidate: () => invalidate(store),
    advance: (timestamp: number, runGlobalEffects?: boolean) => advance(timestamp, runGlobalEffects, store),

    setSize: (width: number, height: number) => {
      const newSize = { width, height };
      setStore('size', newSize);
      setStore('viewport', {
        ...store.viewport,
        ...getCurrentViewport(camera, defaultTarget, newSize)
      });
    },

    setDpr: (dpr: Dpr) => {
      setStore('viewport', 'dpr', calculateDpr(dpr));
    },

    setFrameloop: (frameloop: 'always' | 'demand' | 'never' = 'always') => {
      setStore('frameloop', frameloop);
    },

    events: { connected: false },
    internal: {
      active: false,
      priority: 0,
      frames: 0,
      lastProps: props,
      lastEvent: { current: null },

      interaction: [],
      hovered: new Map<string, ThreeEvent<DomEvent>>(),
      subscribers: [],
      initialClick: [0, 0],
      initialHits: [],
      capturedMap: new Map(),

      xr,
      subscribe: (ref: RenderCallback, priority = 0) => {
        setStore('internal', (internal) => ({
          ...internal,
          // If this subscription was given a priority, it takes rendering into its own hands
          // For that reason we switch off automatic rendering and increase the manual flag
          // As long as this flag is positive there can be no internal rendering at all
          // because there could be multiple render subscriptions
          priority: internal.priority + (priority > 0 ? 1 : 0),
          // Register subscriber and sort layers from lowest to highest, meaning,
          // highest priority renders last (on top of the other frames)
          subscribers: [...internal.subscribers, { ref, priority }].sort((a, b) => a.priority - b.priority)
        }));

        return () => {
          setStore('internal', (internal) => ({
            ...internal,
            // Decrease manual flag if this subscription had a priority
            priority: internal.priority - (priority > 0 ? 1 : 0),
            // Remove subscriber from list
            subscribers: internal.subscribers.filter((s) => s.ref !== ref)
          }));
        };
      }
    }
  });

  // Resize camera and renderer on changes to size and pixelratio
  let oldSize = store.size;
  let oldDpr = store.viewport.dpr;

  // Note: SolidJS doesn't have a direct equivalent to zustand's subscribe
  // You'll need to use createEffect in the component that uses this store
  // or implement a custom subscription mechanism if needed

  // Update size
  if (size) store.setSize(size.width, size.height);

  // Return store tuple
  return [store, setStore];
};

export { createThreeStore, ThreeContext };
