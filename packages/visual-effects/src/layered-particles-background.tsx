import {
  For,
  createEffect,
  createMemo,
  createSignal,
  createUniqueId,
  mergeProps,
  onCleanup,
  type Component,
  type JSX,
} from 'solid-js';
import { Portal } from 'solid-js/web';
import { useMotionRoot } from './motion-root';
import { useParallax } from './parallax';
import type { ParticlesBackgroundProps } from './particles-background';
import dust1AlphaSrc from './assets/dust1-alpha.png';
import dust2AlphaSrc from './assets/dust2-alpha.png';
import dust3AlphaSrc from './assets/dust3-alpha.png';
import s from './layered-particles-background.module.css';

type RgbColor = readonly [number, number, number];

type DustLayer = {
  backgroundImage: string;
  // blur: number;
  depth: number;
  // duration: number;
  // opacity: number;
  // scale: number;
  class: string;
};

type Speck = {
  blur: number;
  color: string;
  delay: number;
  driftX: number;
  driftY: number;
  duration: number;
  id: string;
  left: number;
  opacity: number;
  size: number;
  top: number;
};

const defaultColors = ['#f6f2ea', '#dc2626', '#f59e0b'] as const;
const dustTextures = [dust1AlphaSrc, dust2AlphaSrc, dust3AlphaSrc] as const;

const mergeClassNames = (...values: Array<string | undefined>) =>
  values.filter(Boolean).join(' ');

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

const hexToRgb = (hex: string): RgbColor => {
  let normalized = hex.replace(/^#/, '');

  if (normalized.length === 3) {
    normalized = normalized
      .split('')
      .map((char) => char + char)
      .join('');
  }

  if (!/^[0-9a-fA-F]{6}$/.test(normalized)) {
    return [255, 255, 255] as const;
  }

  const value = Number.parseInt(normalized, 16);

  return [(value >> 16) & 255, (value >> 8) & 255, value & 255] as const;
};

const toRgba = (hex: string, alpha: number) => {
  const [red, green, blue] = hexToRgb(hex);
  return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
};

const createSpecks = (
  particleCount: number,
  speed: number,
  palette: readonly string[],
  particleBaseSize: number,
  sizeRandomness: number,
) => {
  const total = clamp(Math.round(particleCount / 5), 22, 64);
  const baseSize = clamp(particleBaseSize / 34, 3, 10);
  const variation = clamp(sizeRandomness * 2.25, 0.4, 4.5);
  const speedOffset = clamp(speed * 12, 0, 2.25);

  return Array.from({ length: total }, (_, index) => {
    const size = clamp(baseSize + Math.random() * variation, 1.5, 9);

    return {
      blur: Math.random() * 1.2,
      color: palette[index % palette.length] ?? defaultColors[0],
      delay: Math.random() * 6,
      driftX: Math.round(80 + Math.random() * 150),
      driftY: Math.round(48 + Math.random() * 110),
      duration: clamp(3 + Math.random() * 4.5 - speedOffset, 1.6, 7.5),
      id: `speck-${index}`,
      left: Math.random() * 100,
      opacity: 0.55 + Math.random() * 0.35,
      size,
      top: Math.random() * 100,
    } satisfies Speck;
  });
};

const layeredParticlesStyles = `
  @keyframes layered-particles-twinkle {
    0% {
      opacity: 0;
      transform: translate3d(0, 0, 0) scale(0.35);
    }

    30% {
      opacity: 0;
    }

    52% {
      opacity: var(--layered-speck-opacity, 0.7);
    }

    72% {
      opacity: 0;
    }

    100% {
      opacity: 0;
      transform: translate3d(
          var(--layered-speck-drift-x, 160px),
          var(--layered-speck-drift-y, 90px),
          0
        )
        scale(1);
    }
  }
`;

export function LayeredParticlesBackground(
  rawProps: ParticlesBackgroundProps,
): JSX.Element {
  const props = mergeProps(
    {
      particleCount: 200,
      particleSpread: 10,
      speed: 0.1,
      particleColors: undefined,
      moveParticlesOnHover: false,
      particleHoverFactor: 1,
      alphaParticles: false,
      particleBaseSize: 100,
      sizeRandomness: 1,
      cameraDistance: 20,
      disableRotation: false,
      pixelRatio: 1,
      portal: true,
    },
    rawProps,
  );

  const {
    mouse,
    parallaxOffsetX,
    parallaxOffsetY,
    scroll,
    shouldReduceMotion,
  } = useMotionRoot();
  const parallax = useParallax();
  const consumerId = createUniqueId();

  const [containerRef, setContainerRef] = createSignal<HTMLDivElement>();
  const [mounted, setMounted] = createSignal(false);
  const [specks, setSpecks] = createSignal<Speck[]>([]);

  const palette = createMemo(() => {
    const colors = props.particleColors?.length
      ? props.particleColors
      : defaultColors;

    return colors;
  });

  const rootStyle = createMemo<JSX.CSSProperties | string>(() => {
    if (typeof props.style === 'string') {
      return `position: fixed; inset: 0; z-index: 20; overflow: hidden; pointer-events: none; ${props.style}`;
    }

    return {
      inset: '0',
      overflow: 'hidden',
      'pointer-events': 'none',
      position: 'fixed',
      'z-index': 20,
      ...(props.style ?? {}),
    } as JSX.CSSProperties;
  });

  const viewport = createMemo(() => {
    const container = containerRef();

    if (typeof window === 'undefined') {
      return { height: 1, width: 1 };
    }

    return {
      height: container?.clientHeight || window.innerHeight || 1,
      width: container?.clientWidth || window.innerWidth || 1,
    };
  });

  const sceneOffset = createMemo(() => {
    const { height, width } = viewport();
    const spread = props.particleSpread * 7;
    const motionScale = shouldReduceMotion() ? 0 : 1;

    return {
      x: (parallaxOffsetX() / width) * spread * motionScale,
      y:
        (parallaxOffsetY() / height) * spread * motionScale +
        (scroll.y / height) * 2.2,
    };
  });

  const layers = createMemo<DustLayer[]>(() => {
    const baseDuration = clamp(560 - props.speed * 1600, 180, 760);

    return [
      {
        backgroundImage: `url(${dustTextures[0]})`,
        depth: 1,
        class: s.img1,
      },
      {
        backgroundImage: `url(${dustTextures[1]})`,
        depth: 2,
        class: s.img2,
      },
      {
        backgroundImage: `url(${dustTextures[2]})`,
        depth: 3,
        class: s.img3,
      },
    ];
  });

  createEffect(() => {
    if (containerRef() && !mounted()) {
      setMounted(true);
    }
  });

  createEffect(() => {
    if (!parallax) {
      return;
    }

    parallax.setConsumerActivity(consumerId, mounted());
  });

  createEffect(() => {
    if (!mounted()) {
      return;
    }

    setSpecks(
      createSpecks(
        props.particleCount,
        props.speed,
        palette(),
        props.particleBaseSize,
        props.sizeRandomness,
      ),
    );
  });

  onCleanup(() => {
    parallax?.removeConsumerActivity(consumerId);
  });

  const content = () => (
    <div
      ref={setContainerRef}
      class={mergeClassNames(props.class, props.className)}
      style={rootStyle()}
      aria-hidden="true">
      <style>{layeredParticlesStyles}</style>
      <div
        style={
          {
            inset: '0',
            position: 'absolute',
          } as JSX.CSSProperties
        }
      />
      <div
        style={
          {
            inset: '0',
            overflow: 'hidden',
            position: 'absolute',
          } as JSX.CSSProperties
        }>
        <For each={layers()}>
          {(layer) => (
            <div
              style={
                {
                  inset: '-45%',
                  overflow: 'hidden',
                  position: 'absolute',
                  transform: `translate3d(${sceneOffset().x * layer.depth}px, ${sceneOffset().y * layer.depth}px, 0)`,
                  'transform-style': 'preserve-3d',
                  'backface-visibility': 'hidden',
                } as JSX.CSSProperties
              }>
              <div
                class={[s.img, layer.class].join(' ')}
                style={{
                  'background-image': layer.backgroundImage,
                }}
              />
            </div>
          )}
        </For>
      </div>
      <div
        style={
          {
            inset: '0',
            overflow: 'hidden',
            position: 'absolute',
            transform: `translate3d(${sceneOffset().x * 0.12}px, ${sceneOffset().y * 0.12}px, 0)`,
            transition: shouldReduceMotion()
              ? 'transform 220ms ease-out'
              : 'transform 100ms linear',
          } as JSX.CSSProperties
        }>
        <For each={specks()}>
          {(speck) => (
            <div
              style={
                {
                  left: `${speck.left}%`,
                  position: 'absolute',
                  top: `${speck.top}%`,
                } as JSX.CSSProperties
              }>
              <span
                style={
                  {
                    '--layered-speck-drift-x': `${speck.driftX}px`,
                    '--layered-speck-drift-y': `${speck.driftY}px`,
                    '--layered-speck-opacity': speck.opacity.toFixed(2),
                    animation: shouldReduceMotion()
                      ? 'none'
                      : `layered-particles-twinkle ${speck.duration}s cubic-bezier(0.25, 0.25, 0.75, 0.75) ${speck.delay}s infinite`,
                    background: `radial-gradient(circle at 30% 30%, rgba(255, 255, 255, 0.95), ${toRgba(
                      speck.color,
                      props.alphaParticles ? 0.45 : 0.72,
                    )} 48%, transparent 72%)`,
                    'border-radius': '9999px',
                    'box-shadow': `0 0 ${speck.size * 7}px ${toRgba(speck.color, 0.42)}`,
                    display: 'block',
                    filter: `blur(${speck.blur}px)`,
                    height: `${speck.size}px`,
                    'mix-blend-mode': 'screen',
                    opacity: 0,
                    width: `${speck.size}px`,
                  } as JSX.CSSProperties
                }
              />
            </div>
          )}
        </For>
      </div>
    </div>
  );

  return props.portal ? <Portal>{content()}</Portal> : content();
}
