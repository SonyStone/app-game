import { createContext, useContext } from 'solid-js';
import type { Transform } from 'ogl';
import type { OglRootState } from './types';

export const OglContext = createContext<OglRootState>();
export const OglParentContext = createContext<unknown>();

export const useOgl = () => {
  const context = useContext(OglContext);

  if (!context) {
    throw new Error('useOgl must be used within <Canvas>.');
  }

  return context;
};

export const useTime = () => useOgl().time;
export const useDelta = () => useOgl().delta;
export const useFrameCount = () => useOgl().frame;
export const useFps = () => useOgl().fps;
export const useAverageFps = () => useOgl().averageFps;

export const useOglParent = () => {
  const parent = useContext(OglParentContext);

  if (!parent) {
    throw new Error('OGL components must be used within <Canvas>.');
  }

  return parent as Transform | Record<string, unknown>;
};
