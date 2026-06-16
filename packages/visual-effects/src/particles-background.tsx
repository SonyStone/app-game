import { Camera, Geometry, Mesh, Program, Renderer } from 'ogl';
import {
  createUniqueId,
  createEffect,
  createMemo,
  createSignal,
  mergeProps,
  onCleanup,
  type Component,
  type JSX,
} from 'solid-js';
import { Portal } from 'solid-js/web';
import { useMotionRoot } from './motion-root';
import { useParallax } from './parallax';

export type ParticlesBackgroundProps = Omit<
  JSX.HTMLAttributes<HTMLDivElement>,
  'children'
> & {
  particleCount?: number;
  particleSpread?: number;
  speed?: number;
  particleColors?: string[];
  moveParticlesOnHover?: boolean;
  particleHoverFactor?: number;
  alphaParticles?: boolean;
  particleBaseSize?: number;
  sizeRandomness?: number;
  cameraDistance?: number;
  disableRotation?: boolean;
  pixelRatio?: number;
  className?: string;
  portal?: boolean;
};

type RgbColor = readonly [number, number, number];

const defaultColors = ['#ffffff', '#ffffff', '#ffffff'] as const;

const mergeClassNames = (...values: Array<string | undefined>) =>
  values.filter(Boolean).join(' ');

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

const vertex = /* glsl */ `
  attribute vec3 position;
  attribute vec4 random;
  attribute vec3 color;
  attribute vec4 settings;

  uniform mat4 modelMatrix;
  uniform mat4 viewMatrix;
  uniform mat4 projectionMatrix;
  uniform float uTime;
  uniform float uSpread;
  uniform float uBaseSize;
  uniform float uSizeRandomness;

  varying vec4 vRandom;
  varying vec3 vColor;
  varying vec4 vSettings;

  void main() {
    vRandom = random;
    vColor = color;
    vSettings = settings;

    vec3 pos = position * uSpread;
    pos.z *= 10.0;

    vec4 mPos = modelMatrix * vec4(pos, 1.0);
    float t = uTime;
    float tier = settings.w;
    float driftScale = 1.0;
    if (tier > 2.5) {
      driftScale = 0.58;
    } else if (tier > 1.5) {
      driftScale = 0.72;
    } else if (tier > 0.5) {
      driftScale = 1.18;
    }
    mPos.x += sin(t * random.z + 6.28 * random.w) * mix(0.1, 1.5, random.x) * driftScale;
    mPos.y += sin(t * random.y + 6.28 * random.x) * mix(0.1, 1.5, random.w) * driftScale;
    mPos.z += sin(t * random.w + 6.28 * random.y) * mix(0.1, 1.5, random.z) * driftScale;

    vec4 mvPos = viewMatrix * mPos;
    float sizeScale = settings.x;
    if (uSizeRandomness == 0.0) {
      gl_PointSize = uBaseSize * sizeScale;
    } else {
      gl_PointSize = (uBaseSize * sizeScale * (1.0 + uSizeRandomness * (random.x - 0.5))) / length(mvPos.xyz);
    }

    gl_Position = projectionMatrix * mvPos;
  }
`;

const fragment = /* glsl */ `
  precision highp float;

  uniform float uTime;
  uniform float uAlphaParticles;
  varying vec4 vRandom;
  varying vec3 vColor;
  varying vec4 vSettings;

  void main() {
    vec2 uv = gl_PointCoord.xy;
    float d = length(uv - vec2(0.5));
    float tier = vSettings.w;
    vec3 tinted = vColor * vSettings.z + 0.2 * sin(uv.yxx + uTime + vRandom.y * 6.28);
    float alphaScale = vSettings.y;
    float edge = mix(0.22, 0.42, clamp(vSettings.x / 3.2, 0.0, 1.0));

    if (tier > 2.5) {
      float pulse = 0.35 + 0.65 * pow(0.5 + 0.5 * sin(uTime * 2.8 + vRandom.x * 6.28), 4.0);
      tinted = mix(tinted, vec3(1.0), 0.62) + pulse * 0.16;
      alphaScale *= pulse;
      edge = 0.12;
    } else if (tier > 1.5) {
      tinted = mix(tinted, vec3(1.0), 0.12);
      edge = 0.47;
    } else if (tier > 0.5) {
      tinted = mix(tinted, vec3(1.0), 0.2);
      edge = 0.26;
    }

    if(uAlphaParticles < 0.5) {
      if(d > 0.5) {
        discard;
      }
      gl_FragColor = vec4(tinted, max(0.45, alphaScale));
    } else {
      float circle = smoothstep(0.5, edge, d) * alphaScale;
      gl_FragColor = vec4(tinted, circle);
    }
  }
`;

const hexToRgb = (hex: string): RgbColor => {
  let normalized = hex.replace(/^#/, '');

  if (normalized.length === 3) {
    normalized = normalized
      .split('')
      .map((char) => char + char)
      .join('');
  }

  const value = Number.parseInt(normalized, 16);

  return [
    ((value >> 16) & 255) / 255,
    ((value >> 8) & 255) / 255,
    (value & 255) / 255,
  ] as const;
};

export const ParticlesBackground: Component<ParticlesBackgroundProps> = (
  rawProps,
) => {
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
    shouldReduceMotion,
    scroll,
  } = useMotionRoot();
  const parallax = useParallax();
  const consumerId = createUniqueId();
  const [mounted, setMounted] = createSignal(false);

  const [containerRef, setContainerRef] = createSignal<HTMLDivElement>();
  const [canvasRef, setCanvasRef] = createSignal<HTMLCanvasElement>();
  let renderer: Renderer | undefined;
  let camera: Camera | undefined;
  let program: Program | undefined;
  let particleMesh: Mesh | undefined;
  let animationFrameId: number | undefined;
  let elapsed = 0;
  let lastTime = 0;
  const pointer = { x: 0, y: 0 };

  const palette = createMemo(() => {
    const colors = props.particleColors?.length
      ? props.particleColors
      : defaultColors;

    return colors.map(hexToRgb);
  });

  const getViewport = () => {
    const container = containerRef();
    const width = container?.clientWidth || window.innerWidth || 1;
    const height = container?.clientHeight || window.innerHeight || 1;
    return { width, height };
  };

  const resize = () => {
    if (!renderer || !camera) {
      return;
    }

    const { width, height } = getViewport();
    renderer.setSize(width, height);
    camera.perspective({
      aspect: renderer.gl.canvas.width / renderer.gl.canvas.height,
    });
  };

  const rebuildParticles = () => {
    if (!renderer) {
      return;
    }

    const gl = renderer.gl;
    const totalParticleCount = Math.max(
      props.particleCount,
      Math.round(props.particleCount * 3.2),
    );
    const positions = new Float32Array(totalParticleCount * 3);
    const randoms = new Float32Array(totalParticleCount * 4);
    const colors = new Float32Array(totalParticleCount * 3);
    const settings = new Float32Array(totalParticleCount * 4);
    const activePalette = palette();

    for (let index = 0; index < totalParticleCount; index += 1) {
      let x = 0;
      let y = 0;
      let z = 0;
      let length = 0;

      do {
        x = Math.random() * 2 - 1;
        y = Math.random() * 2 - 1;
        z = Math.random() * 2 - 1;
        length = x * x + y * y + z * z;
      } while (length > 1 || length === 0);

      const radius = Math.cbrt(Math.random());
      positions.set([x * radius, y * radius, z * radius], index * 3);
      randoms.set(
        [Math.random(), Math.random(), Math.random(), Math.random()],
        index * 4,
      );

      const tierRoll = Math.random();
      let sizeScale = 0.8 + Math.random() * 0.5;
      let alphaScale = 0.28 + Math.random() * 0.24;
      let brightnessScale = 0.95 + Math.random() * 0.1;
      let tier = 0;

      if (tierRoll > 0.6 && tierRoll <= 0.82) {
        sizeScale = 1.35 + Math.random() * 0.75;
        alphaScale = 0.78 + Math.random() * 0.22;
        brightnessScale = 1.18 + Math.random() * 0.2;
        tier = 1;
      } else if (tierRoll > 0.82 && tierRoll <= 0.95) {
        sizeScale = 2.8 + Math.random() * 1.8;
        alphaScale = 0.22 + Math.random() * 0.18;
        brightnessScale = 1.02 + Math.random() * 0.12;
        tier = 2;
      } else if (tierRoll > 0.95) {
        sizeScale = 1.15 + Math.random() * 0.7;
        alphaScale = 0.88 + Math.random() * 0.12;
        brightnessScale = 1.4 + Math.random() * 0.22;
        tier = 3;
      }

      settings.set([sizeScale, alphaScale, brightnessScale, tier], index * 4);
      colors.set(
        activePalette[Math.floor(Math.random() * activePalette.length)],
        index * 3,
      );
    }

    const nextGeometry = new Geometry(gl, {
      position: { size: 3, data: positions },
      random: { size: 4, data: randoms },
      color: { size: 3, data: colors },
      settings: { size: 4, data: settings },
    });

    program = new Program(gl, {
      vertex,
      fragment,
      uniforms: {
        uTime: { value: 0 },
        uSpread: { value: props.particleSpread },
        uBaseSize: { value: props.particleBaseSize * props.pixelRatio },
        uSizeRandomness: { value: props.sizeRandomness },
        uAlphaParticles: { value: props.alphaParticles ? 1 : 0 },
      },
      transparent: true,
      depthTest: false,
    });

    particleMesh = new Mesh(gl, {
      mode: gl.POINTS,
      geometry: nextGeometry,
      program,
    });
  };

  createEffect(() => {
    if (!parallax) {
      return;
    }

    parallax.setConsumerActivity(consumerId, mounted());
  });

  onCleanup(() => {
    parallax?.removeConsumerActivity(consumerId);
  });

  createEffect(() => {
    const container = containerRef();
    const canvas = canvasRef();

    if (!container || !canvas || renderer || typeof window === 'undefined') {
      return;
    }

    renderer = new Renderer({
      canvas,
      dpr: props.pixelRatio,
      depth: false,
      alpha: true,
    });

    const gl = renderer.gl;
    gl.clearColor(0, 0, 0, 0);
    gl.canvas.style.width = '100%';
    gl.canvas.style.height = '100%';
    gl.canvas.style.display = 'block';

    camera = new Camera(gl, { fov: 15 });
    camera.position.set(0, 0, props.cameraDistance);

    rebuildParticles();
    resize();
    setMounted(true);
    window.addEventListener('resize', resize, false);

    const animate = (time: number) => {
      animationFrameId = window.requestAnimationFrame(animate);

      if (!renderer || !camera || !program || !particleMesh) {
        return;
      }

      const delta = lastTime === 0 ? 16 : time - lastTime;
      lastTime = time;
      elapsed += delta * (shouldReduceMotion() ? 0 : props.speed);

      program.uniforms.uTime.value = elapsed * 0.001;
      program.uniforms.uSpread.value = props.particleSpread;
      program.uniforms.uBaseSize.value =
        props.particleBaseSize * props.pixelRatio;
      program.uniforms.uSizeRandomness.value = props.sizeRandomness;
      program.uniforms.uAlphaParticles.value = props.alphaParticles ? 1 : 0;
      camera.position.set(0, 0, props.cameraDistance);

      const { width, height } = getViewport();
      const parallaxX =
        (parallaxOffsetX() / width) * props.particleSpread * 0.9;
      const parallaxY =
        (parallaxOffsetY() / height) * props.particleSpread * 0.9;
      const scrollDrift = clamp((scroll.y / height) * 0.18, 0, 0.45);
      const hoverX = props.moveParticlesOnHover
        ? -pointer.x * props.particleHoverFactor
        : 0;
      const hoverY = props.moveParticlesOnHover
        ? -pointer.y * props.particleHoverFactor
        : 0;

      particleMesh.position.x = hoverX + parallaxX;
      particleMesh.position.y = hoverY + parallaxY + scrollDrift;

      if (props.disableRotation || shouldReduceMotion()) {
        particleMesh.rotation.x = 0;
        particleMesh.rotation.y = 0;
      } else {
        particleMesh.rotation.x =
          Math.sin(elapsed * 0.0002) * 0.1 +
          (parallaxOffsetY() / height) * 0.12;
        particleMesh.rotation.y =
          Math.cos(elapsed * 0.0005) * 0.15 -
          (parallaxOffsetX() / width) * 0.14;
        particleMesh.rotation.z += 0.01 * props.speed;
      }

      renderer.render({ scene: particleMesh, camera });
    };

    animationFrameId = window.requestAnimationFrame(animate);
  });

  createEffect(() => {
    const container = containerRef();

    if (!mounted() || !container || !props.moveParticlesOnHover) {
      pointer.x = 0;
      pointer.y = 0;
      return;
    }

    const x = mouse.x - window.scrollX;
    const y = mouse.y - window.scrollY;
    const { isInside } = mouse;
    const rect = container.getBoundingClientRect();
    const isOverContainer =
      isInside &&
      x >= rect.left &&
      x <= rect.right &&
      y >= rect.top &&
      y <= rect.bottom;

    if (!isOverContainer) {
      pointer.x = 0;
      pointer.y = 0;
      return;
    }

    pointer.x = ((x - rect.left) / rect.width) * 2 - 1;
    pointer.y = -(((y - rect.top) / rect.height) * 2 - 1);
  });

  createEffect(() => {
    if (!mounted()) {
      return;
    }

    props.particleCount;
    props.speed;
    props.particleBaseSize;
    props.sizeRandomness;
    palette();
    rebuildParticles();
  });

  createEffect(() => {
    if (!mounted()) {
      return;
    }

    scroll.y;
    parallaxOffsetX();
    parallaxOffsetY();

    if (shouldReduceMotion() && renderer && camera && particleMesh) {
      renderer.render({ scene: particleMesh, camera });
    }
  });

  createEffect(() => {
    if (!mounted()) {
      return;
    }

    resize();
  });

  onCleanup(() => {
    if (typeof window !== 'undefined' && animationFrameId !== undefined) {
      window.cancelAnimationFrame(animationFrameId);
    }

    if (typeof window !== 'undefined') {
      window.removeEventListener('resize', resize, false);
    }
  });

  const content = () => (
    <div
      ref={setContainerRef}
      class={mergeClassNames(
        'pointer-events-none fixed inset-0 z-20 overflow-hidden mix-blend-screen',
        props.class,
        props.className,
      )}
      style={props.style}
      aria-hidden="true">
      <canvas ref={setCanvasRef} class="h-full w-full" />
    </div>
  );

  return props.portal ? <Portal>{content()}</Portal> : content();
};

export default ParticlesBackground;
