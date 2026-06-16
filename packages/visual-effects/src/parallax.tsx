import { createVisibilityObserver } from '@solid-primitives/intersection-observer';
import {
  createUniqueId,
  createContext,
  createEffect,
  createMemo,
  createSignal,
  mergeProps,
  onCleanup,
  splitProps,
  useContext,
  type Accessor,
  type JSX,
  type ParentComponent,
  type ParentProps,
} from 'solid-js';
import { Dynamic } from 'solid-js/web';
import {
  createParallaxMotion,
  PARALLAX_MOTION_DEFAULTS,
  type ParallaxMotionOptions,
} from './parallax-motion';

const DEFAULTS = {
  ...PARALLAX_MOTION_DEFAULTS,
  invertX: true,
  invertY: true,
  precision: 1,
};

/**
 * Props for the global parallax provider.
 *
 * The provider listens to pointer movement and, when available, device orientation.
 * Child `ParallaxLayer`s read the shared state and translate themselves based on
 * their configured depth.
 */
export type ParallaxProviderProps = ParentProps<
  Omit<
    ParallaxMotionOptions,
    'active' | 'pauseWhenOutOfView' | 'publishToMotionRoot'
  > & {
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

export const ParallaxProvider: ParentComponent<ParallaxProviderProps> = (
  props,
) => {
  const merged = mergeProps(DEFAULTS, props);
  const [local] = splitProps(merged, [
    'children',
    'disabled',
    'gyroscope',
    'hoverOnly',
    'calibrationThreshold',
    'calibrationDelay',
    'supportDelay',
    'calibrateX',
    'calibrateY',
    'invertX',
    'invertY',
    'limitX',
    'limitY',
    'scalarX',
    'scalarY',
    'frictionX',
    'frictionY',
    'originX',
    'originY',
    'precision',
    'onReady',
  ]);
  const [consumerActivity, setConsumerActivityState] = createSignal<
    Record<string, boolean>
  >({});

  const hasActiveConsumers = createMemo(() =>
    Object.values(consumerActivity()).some(Boolean),
  );

  const motion = createParallaxMotion({
    active: hasActiveConsumers,
    get calibrationDelay() {
      return local.calibrationDelay;
    },
    get calibrationThreshold() {
      return local.calibrationThreshold;
    },
    get calibrateX() {
      return local.calibrateX;
    },
    get calibrateY() {
      return local.calibrateY;
    },
    get disabled() {
      return local.disabled;
    },
    get frictionX() {
      return local.frictionX;
    },
    get frictionY() {
      return local.frictionY;
    },
    get gyroscope() {
      return local.gyroscope;
    },
    get hoverOnly() {
      return local.hoverOnly;
    },
    get limitX() {
      return local.limitX;
    },
    get limitY() {
      return local.limitY;
    },
    onReady: local.onReady,
    get originX() {
      return local.originX;
    },
    get originY() {
      return local.originY;
    },
    pauseWhenOutOfView: true,
    publishToMotionRoot: true,
    get scalarX() {
      return local.scalarX;
    },
    get scalarY() {
      return local.scalarY;
    },
    get supportDelay() {
      return local.supportDelay;
    },
  });

  const updateConsumerActivity = (consumerId: string, isActive: boolean) => {
    setConsumerActivityState((current) => {
      if (current[consumerId] === isActive) {
        return current;
      }

      return {
        ...current,
        [consumerId]: isActive,
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
    <ParallaxContext.Provider
      value={{
        offsetX: motion.offsetX,
        offsetY: motion.offsetY,
        invertX: () => local.invertX,
        invertY: () => local.invertY,
        precision: () => local.precision,
        removeConsumerActivity,
        setConsumerActivity: updateConsumerActivity,
      }}>
      {local.children}
    </ParallaxContext.Provider>
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

  const merged = mergeProps(
    {
      as: 'div' as const,
      depth: 0,
    },
    props,
  );

  const [local, others] = splitProps(merged, [
    'as',
    'class',
    'style',
    'children',
    'depth',
    'depthX',
    'depthY',
    'precision',
  ]);

  let layerRef: HTMLElement | undefined;

  const isLayerVisible = createVisibilityObserver({ initialValue: true })(
    () => layerRef,
  );

  createEffect(() => {
    scene.setConsumerActivity(layerId, isLayerVisible());
  });

  onCleanup(() => {
    scene.removeConsumerActivity(layerId);
  });

  const frozenTransform = createMemo<string>((previousTransform) => {
    if (!isLayerVisible()) {
      return previousTransform;
    }

    const depthX = local.depthX ?? local.depth;
    const depthY = local.depthY ?? local.depth;
    const precision = local.precision ?? scene.precision();
    const translateX = scene.offsetX() * depthX * (scene.invertX() ? -1 : 1);
    const translateY = scene.offsetY() * depthY * (scene.invertY() ? -1 : 1);

    return `translate3d(${translateX.toFixed(precision)}px, ${translateY.toFixed(precision)}px, 0)`;
  }, 'translate3d(0.0px, 0.0px, 0)');

  const layerStyle = createMemo<JSX.CSSProperties>(() => ({
    ...(local.style ?? {}),
    transform: frozenTransform(),
    'will-change': 'transform',
  }));

  return (
    <Dynamic
      component={local.as}
      ref={(element: Element) => {
        layerRef = element as HTMLElement;
      }}
      class={local.class}
      style={layerStyle()}
      {...others}>
      {local.children}
    </Dynamic>
  );
};