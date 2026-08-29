import { createVisibilityObserver } from '@solid-primitives/intersection-observer';
import type { JSX } from '@solidjs/web';
import { Dynamic } from '@solidjs/web';
import {
  createContext,
  createMemo,
  createSignal,
  createTrackedEffect,
  createUniqueId,
  merge,
  omit,
  onCleanup,
  useContext,
  type Accessor,
  type ParentComponent,
  type ParentProps
} from 'solid-js';
import { createParallaxMotion, PARALLAX_MOTION_DEFAULTS, type ParallaxMotionOptions } from './parallax-motion';

const DEFAULTS = {
  ...PARALLAX_MOTION_DEFAULTS,
  invertX: true,
  invertY: true,
  precision: 1
};

/**
 * Props for the global parallax provider.
 *
 * The provider listens to pointer movement and, when available, device orientation.
 * Child `ParallaxLayer`s read the shared state and translate themselves based on
 * their configured depth.
 */
export type ParallaxProviderProps = ParentProps<
  Omit<ParallaxMotionOptions, 'active' | 'pauseWhenOutOfView' | 'publishToMotionRoot'> & {
    disabled?: boolean;
    gyroscope?: boolean;
    hoverOnly?: boolean;
    calibrationThreshold?: number;
    calibrationDelay?: number;
    supportDelay?: number;
    calibrateX?: boolean;
    calibrateY?: boolean;
    invertX?: boolean;
    invertY?: boolean;
    limitX?: number | false;
    limitY?: number | false;
    scalarX?: number;
    scalarY?: number;
    frictionX?: number;
    frictionY?: number;
    originX?: number;
    originY?: number;
    precision?: number;
    onReady?: () => void;
  }
>;

type ParallaxContextValue = {
  offsetX: Accessor<number>;
  offsetY: Accessor<number>;
  invertX: Accessor<boolean>;
  invertY: Accessor<boolean>;
  precision: Accessor<number>;
  removeConsumerActivity: (consumerId: string) => void;
  setConsumerActivity: (consumerId: string, isActive: boolean) => void;
};

const ParallaxContext = createContext<ParallaxContextValue>();

export const useParallax = () => useContext(ParallaxContext) ?? null;

export const ParallaxProvider: ParentComponent<ParallaxProviderProps> = (props) => {
  const merged = merge(DEFAULTS, props);

  const [consumerActivity, setConsumerActivityState] = createSignal<Record<string, boolean>>({});

  const hasActiveConsumers = createMemo(() => Object.values(consumerActivity()).some(Boolean));

  const motion = createParallaxMotion({
    active: hasActiveConsumers,
    get calibrationDelay() {
      return merged.calibrationDelay;
    },
    get calibrationThreshold() {
      return merged.calibrationThreshold;
    },
    get calibrateX() {
      return merged.calibrateX;
    },
    get calibrateY() {
      return merged.calibrateY;
    },
    get disabled() {
      return merged.disabled;
    },
    get frictionX() {
      return merged.frictionX;
    },
    get frictionY() {
      return merged.frictionY;
    },
    get gyroscope() {
      return merged.gyroscope;
    },
    get hoverOnly() {
      return merged.hoverOnly;
    },
    get limitX() {
      return merged.limitX;
    },
    get limitY() {
      return merged.limitY;
    },
    onReady: merged.onReady,
    get originX() {
      return merged.originX;
    },
    get originY() {
      return merged.originY;
    },
    pauseWhenOutOfView: true,
    publishToMotionRoot: true,
    get scalarX() {
      return merged.scalarX;
    },
    get scalarY() {
      return merged.scalarY;
    },
    get supportDelay() {
      return merged.supportDelay;
    }
  });

  const updateConsumerActivity = (consumerId: string, isActive: boolean) => {
    setConsumerActivityState((current) => {
      if (current[consumerId] === isActive) {
        return current;
      }

      return {
        ...current,
        [consumerId]: isActive
      };
    });
  };

  const removeConsumerActivity = (consumerId: string) => {
    setConsumerActivityState((current) => {
      if (!(consumerId in current)) {
        return current;
      }

      const next = { ...current };
      delete next[consumerId];
      return next;
    });
  };

  return (
    <ParallaxContext
      value={{
        offsetX: motion.offsetX,
        offsetY: motion.offsetY,
        invertX: () => merged.invertX,
        invertY: () => merged.invertY,
        precision: () => merged.precision,
        removeConsumerActivity,
        setConsumerActivity: updateConsumerActivity
      }}
    >
      {merged.children}
    </ParallaxContext>
  );
};

export interface ParallaxLayerProps extends ParentProps<
  Omit<JSX.HTMLAttributes<HTMLElement>, 'style'> & {
    as?: keyof JSX.IntrinsicElements;
    style?: JSX.CSSProperties;
    depth?: number;
    depthX?: number;
    depthY?: number;
    precision?: number;
  }
> {}

export const ParallaxLayer: ParentComponent<ParallaxLayerProps> = (props) => {
  const scene = useParallax();
  const layerId = createUniqueId();

  if (!scene) {
    throw new Error('ParallaxLayer must be used inside ParallaxProvider.');
  }

  const merged = merge(
    {
      as: 'div' as const,
      depth: 0
    },
    props
  );

  const others = omit(merged, 'as', 'class', 'style', 'children', 'depth', 'depthX', 'depthY', 'precision');

  let layerRef: HTMLElement | undefined;

  const isLayerVisible = createVisibilityObserver({ initialValue: true })(() => layerRef);

  createTrackedEffect(() => {
    scene.setConsumerActivity(layerId, isLayerVisible());
  });

  onCleanup(() => {
    scene.removeConsumerActivity(layerId);
  });

  const frozenTransform = createMemo<string>(
    (previousTransform) => {
      if (!isLayerVisible()) {
        return previousTransform;
      }

      const depthX = merged.depthX ?? merged.depth;
      const depthY = merged.depthY ?? merged.depth;
      const precision = merged.precision ?? scene.precision();
      const translateX = scene.offsetX() * depthX * (scene.invertX() ? -1 : 1);
      const translateY = scene.offsetY() * depthY * (scene.invertY() ? -1 : 1);

      return `translate3d(${translateX.toFixed(precision)}px, ${translateY.toFixed(precision)}px, 0)`;
    },
    { loadingValue: 'translate3d(0.0px, 0.0px, 0)' }
  );

  const layerStyle = createMemo<JSX.CSSProperties>(() => ({
    ...(merged.style ?? {}),
    transform: frozenTransform(),
    'will-change': 'transform'
  }));

  return (
    <Dynamic
      component={merged.as}
      ref={(element: Element) => {
        layerRef = element as HTMLElement;
      }}
      class={merged.class}
      style={layerStyle()}
      {...others}
    >
      {merged.children}
    </Dynamic>
  );
};
