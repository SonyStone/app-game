import { createStore } from 'solid-js/store';
import {
  Clock,
  type OrthographicCamera,
  type PerspectiveCamera,
  type Raycaster,
  type Scene,
  type WebGLRenderer
} from 'three';

export interface XRManager {
  connect: () => void;
  disconnect: () => void;
}

export type Camera = (OrthographicCamera | PerspectiveCamera) & { manual?: boolean };

export const createRootStore = () => {
  const [store, setStore] = createStore({
    gl: null as unknown as WebGLRenderer,
    camera: null as unknown as Camera,
    raycaster: null as unknown as Raycaster,
    events: { priority: 1, enabled: true, connected: false },
    scene: null as unknown as Scene,
    xr: null as unknown as XRManager,
    clock: new Clock(),
    size: { width: 0, height: 0, top: 0, left: 0 }
  });

  return [store, setStore] as const;
};
