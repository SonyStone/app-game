import { createWindowSize } from '@solid-primitives/resize-observer';
import {
  createEffect,
  createSignal,
  mergeProps,
  onCleanup,
  onMount,
  type Accessor,
} from 'solid-js';
import { useMotionRoot } from './motion-root';

const MAGIC_NUMBER = 30;

export const clamp = (value: number, min: number, max: number) =>
  Math.min(Math.max(value, min), max);

export const normalizePointerToViewport = ({
  clientX,
  clientY,
  originX,
  originY,
  viewportHeight,
  viewportWidth,
}: {
  clientX: number;
  clientY: number;
  originX: number;
  originY: number;
  viewportHeight: number;
  viewportWidth: number;
}) => {
  const centerX = viewportWidth * originX;
  const centerY = viewportHeight * originY;
  const radiusX = Math.max(centerX, viewportWidth - centerX) || 1;
  const radiusY = Math.max(centerY, viewportHeight - centerY) || 1;

  return {
    x: (clientX - centerX) / radiusX,
    y: (clientY - centerY) / radiusY,
  };
};

export type ParallaxMotionOptions = {
  disabled?: boolean;
  pauseWhenOutOfView?: boolean;
  gyroscope?: boolean;
  hoverOnly?: boolean;
  calibrationThreshold?: number;
  calibrationDelay?: number;
  supportDelay?: number;
  calibrateX?: boolean;
  calibrateY?: boolean;
  limitX?: number | false;
  limitY?: number | false;
  scalarX?: number;
  scalarY?: number;
  frictionX?: number;
  frictionY?: number;
  originX?: number;
  originY?: number;
  active?: boolean | Accessor<boolean>;
  publishToMotionRoot?: boolean;
  onReady?: () => void;
};

export const PARALLAX_MOTION_DEFAULTS = {
  disabled: false,
  pauseWhenOutOfView: true,
  gyroscope: true,
  hoverOnly: false,
  calibrationThreshold: 100,
  calibrationDelay: 500,
  supportDelay: 500,
  calibrateX: false,
  calibrateY: true,
  limitX: false as number | false,
  limitY: false as number | false,
  scalarX: 10,
  scalarY: 10,
  frictionX: 0.1,
  frictionY: 0.1,
  originX: 0.5,
  originY: 0.5,
  active: true,
  publishToMotionRoot: false,
} satisfies Required<Omit<ParallaxMotionOptions, 'onReady'>>;

export const createParallaxMotion = (
  rawOptions: ParallaxMotionOptions = {},
) => {
  const options = mergeProps(PARALLAX_MOTION_DEFAULTS, rawOptions);
  const { gyroscope, mouse, setParallaxOffsets, shouldReduceMotion } =
    useMotionRoot();
  const windowSize = createWindowSize();
  const [offsetX, setOffsetX] = createSignal(0);
  const [offsetY, setOffsetY] = createSignal(0);
  const isActive = () =>
    typeof options.active === 'function' ? options.active() : options.active;

  let frameId: number | undefined;
  let calibrationTimer: number | undefined;
  let calibrationFlag = true;
  let calibrationX = 0;
  let calibrationY = 0;
  let velocityX = 0;
  let velocityY = 0;
  let lastOrientationAt = Number.NEGATIVE_INFINITY;
  let portrait = false;
  let readyCalled = false;
  let mounted = false;

  const queueCalibration = (delay: number) => {
    clearTimeout(calibrationTimer);
    calibrationTimer = window.setTimeout(() => {
      calibrationFlag = true;
    }, delay);
  };

  const resetOffsets = () => {
    velocityX = 0;
    velocityY = 0;
    setOffsetX(0);
    setOffsetY(0);
  };

  onMount(() => {
    mounted = true;
    queueCalibration(options.calibrationDelay);
  });

  createEffect(() => {
    const beta = gyroscope.beta;
    const gamma = gyroscope.gamma;

    if (!mounted || !options.gyroscope) {
      return;
    }

    if (beta !== 0 || gamma !== 0) {
      lastOrientationAt = performance.now();
    }
  });

  createEffect(() => {
    if (!options.publishToMotionRoot) {
      return;
    }

    setParallaxOffsets(offsetX(), offsetY());
  });

  createEffect(() => {
    if (
      options.disabled ||
      (options.pauseWhenOutOfView && !isActive()) ||
      shouldReduceMotion()
    ) {
      readyCalled = false;
      resetOffsets();

      if (frameId !== undefined) {
        cancelAnimationFrame(frameId);
        frameId = undefined;
      }

      return;
    }

    const updateFrame = () => {
      const viewportWidth = windowSize.width || 0;
      const viewportHeight = windowSize.height || 0;

      if (!viewportWidth || !viewportHeight) {
        frameId = requestAnimationFrame(updateFrame);
        return;
      }

      let pointerX = 0;
      let pointerY = 0;

      if (!(options.hoverOnly && !mouse.isInside)) {
        const clientX = mouse.x - window.scrollX;
        const clientY = mouse.y - window.scrollY;
        const normalizedPointer = normalizePointerToViewport({
          clientX,
          clientY,
          originX: options.originX,
          originY: options.originY,
          viewportHeight,
          viewportWidth,
        });

        pointerX = normalizedPointer.x;
        pointerY = normalizedPointer.y;
      }

      const orientationActive =
        options.gyroscope &&
        performance.now() - lastOrientationAt < options.supportDelay * 2;

      let inputX = pointerX;
      let inputY = pointerY;

      if (orientationActive) {
        inputX = (gyroscope.beta || 0) / MAGIC_NUMBER;
        inputY = (gyroscope.gamma || 0) / MAGIC_NUMBER;

        const nextPortrait = viewportHeight > viewportWidth;
        if (portrait !== nextPortrait) {
          portrait = nextPortrait;
          calibrationFlag = true;
        }

        if (calibrationFlag) {
          calibrationFlag = false;
          calibrationX = inputX;
          calibrationY = inputY;
        }
      } else {
        portrait = false;
      }

      const calibratedInputX = orientationActive
        ? inputX - calibrationX
        : inputX;
      const calibratedInputY = orientationActive
        ? inputY - calibrationY
        : inputY;

      if (
        orientationActive &&
        (Math.abs(calibratedInputX) > options.calibrationThreshold ||
          Math.abs(calibratedInputY) > options.calibrationThreshold)
      ) {
        queueCalibration(0);
      }

      let motionX = 0;
      let motionY = 0;

      if (portrait && orientationActive) {
        motionX = options.calibrateX ? calibratedInputY : inputY;
        motionY = options.calibrateY ? calibratedInputX : inputX;
      } else {
        motionX = options.calibrateX ? calibratedInputX : inputX;
        motionY = options.calibrateY ? calibratedInputY : inputY;
      }

      motionX *= viewportWidth * (options.scalarX / 100);
      motionY *= viewportHeight * (options.scalarY / 100);

      if (typeof options.limitX === 'number') {
        motionX = clamp(motionX, -options.limitX, options.limitX);
      }

      if (typeof options.limitY === 'number') {
        motionY = clamp(motionY, -options.limitY, options.limitY);
      }

      velocityX += (motionX - velocityX) * options.frictionX;
      velocityY += (motionY - velocityY) * options.frictionY;

      setOffsetX(velocityX);
      setOffsetY(velocityY);

      if (!readyCalled) {
        readyCalled = true;
        options.onReady?.();
      }

      frameId = requestAnimationFrame(updateFrame);
    };

    frameId = requestAnimationFrame(updateFrame);

    onCleanup(() => {
      if (frameId !== undefined) {
        cancelAnimationFrame(frameId);
        frameId = undefined;
      }
    });
  });

  onCleanup(() => {
    clearTimeout(calibrationTimer);

    if (options.publishToMotionRoot) {
      setParallaxOffsets(0, 0);
    }
  });

  return {
    offsetX,
    offsetY,
    resetOffsets,
  };
};
