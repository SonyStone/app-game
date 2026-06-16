import { createGyroscope } from '@solid-primitives/devices';
import { createMediaQuery } from '@solid-primitives/media';
import { createMousePosition } from '@solid-primitives/mouse';
import { createScrollPosition } from '@solid-primitives/scroll';
import {
  createMemo,
  createContext,
  createSignal,
  mergeProps,
  useContext,
  type Accessor,
  type ParentProps,
  type ParentComponent,
} from 'solid-js';

type MotionRootContextValue = {
  gyroscope: ReturnType<typeof createGyroscope>;
  mouse: ReturnType<typeof createMousePosition>;
  scroll: ReturnType<typeof createScrollPosition>;
  prefersReducedMotion: Accessor<boolean>;
  shouldReduceMotion: Accessor<boolean>;
  parallaxOffsetX: Accessor<number>;
  parallaxOffsetY: Accessor<number>;
  setParallaxOffsets: (x: number, y: number) => void;
};

const MotionRootContext = createContext<MotionRootContextValue>();

export type MotionRootProviderProps = ParentProps<{
  respectReducedMotion?: boolean;
}>;

export const MotionRootProvider: ParentComponent<MotionRootProviderProps> = (
  rawProps,
) => {
  const props = mergeProps({ respectReducedMotion: true }, rawProps);
  const gyroscope = createGyroscope(50);
  const mouse = createMousePosition();
  const scroll = createScrollPosition();
  const prefersReducedMotion = createMediaQuery(
    '(prefers-reduced-motion: reduce)',
    false,
  );
  const [parallaxOffsetX, setParallaxOffsetX] = createSignal(0);
  const [parallaxOffsetY, setParallaxOffsetY] = createSignal(0);
  const shouldReduceMotion = createMemo(
    () => props.respectReducedMotion && prefersReducedMotion(),
  );
  const setParallaxOffsets = (x: number, y: number) => {
    setParallaxOffsetX(x);
    setParallaxOffsetY(y);
  };

  return (
    <MotionRootContext.Provider
      value={{
        gyroscope,
        mouse,
        scroll,
        prefersReducedMotion,
        shouldReduceMotion,
        parallaxOffsetX,
        parallaxOffsetY,
        setParallaxOffsets,
      }}>
      {props.children}
    </MotionRootContext.Provider>
  );
};

export const useMotionRoot = () => {
  const context = useContext(MotionRootContext);

  if (!context) {
    throw new Error('useMotionRoot must be used inside MotionRootProvider.');
  }

  return context;
};