import { toRadian } from '@app-game/ogl/extras/path/utils';
import { Container, Graphics, Sprite, useAsset } from '@app-game/solid-pixi';
import { createEventListener } from '@solid-primitives/event-listener';
import createRAF from '@solid-primitives/raf';
import { createWindowSize } from '@solid-primitives/resize-observer';
import { Container as _Container, Graphics as _Graphics, Sprite as _Sprite, Color, Point, Ticker } from 'pixi.js';
import 'pixi.js/math-extras';
import { createEffect, JSX, onCleanup, onMount } from 'solid-js';
import { createStore } from 'solid-js/store';
import bunnyUrl from './bunny.png?url';
import { Collider } from './Collider';
import { RigidBody as _RigidBody, Rapier2D, useRapier2D } from './Rapier2D';
import { RendererProvider, useRenderer } from './Renderer';
import { RigidBody } from './RigidBody';
import { useWorld, World } from './World';

export default function TankiPage() {
  const size = createWindowSize();
  const canvas = (<canvas class="touch-none" width={size.width} height={size.height} />) as HTMLCanvasElement;

  return (
    <>
      {canvas}
      <RendererProvider width={size.width} height={size.height} backgroundColor={0x1099bb} canvas={canvas}>
        <Rapier2D>
          <World>
            <App />
          </World>
        </Rapier2D>
      </RendererProvider>
    </>
  );
}

function Entity() {
  return <></>;
}

function App() {
  const renderer = useRenderer();
  const world = useWorld();
  const size = createWindowSize();
  const rapier2D = useRapier2D();

  let wakeLockSentinel: WakeLockSentinel | null = null;
  onMount(() => {
    createEffect(async () => {
      wakeLockSentinel = await navigator.wakeLock.request('screen');
    });
  });
  onCleanup(() => {
    console.log('Releasing wake lock');
    wakeLockSentinel?.release();
  });

  createEffect(() => {
    renderer.resize(size.width, size.height);
  });

  const [devicemotion, setDevicemotion] = createStore({
    gravity: { x: 0, y: 0 },
    orientation: { alpha: 0, beta: 0, gamma: 0 },
    acceleration: { x: 0, y: 0, z: 0 },
    rotationRate: { alpha: 0, beta: 0, gamma: 0 }
  });

  createEventListener(window, 'deviceorientation', (event) => {
    if (!event) return;
    const { alpha, beta, gamma } = event;
    if (alpha === null || beta === null || gamma === null) return;
    setDevicemotion('orientation', { alpha: alpha ?? 0, beta: beta ?? 0, gamma: gamma ?? 0 });
    const gravity = new Point(devicemotion.orientation.gamma, devicemotion.orientation.beta)
      .normalize()
      .multiplyScalar(9.81);
    setDevicemotion('gravity', { x: gravity.x, y: -gravity.y });
    world.gravity = { x: gravity.x, y: -gravity.y };
    // world.gravity = { x: 0, y: 0 };
  });

  const [debugRender, debugRenderUpdate] = createDebugRender();
  const [texture] = useAsset(bunnyUrl);

  // Create the world bounds
  {
    const bounds = [
      { name: 'bottom', x: 0, y: 1 },
      { name: 'top', x: 0, y: -1 },
      { name: 'left', x: -1, y: 0 },
      { name: 'right', x: 1, y: 0 }
    ];
    const colliders = bounds.map((bound) => {
      const shape = new rapier2D.HalfSpace(bound);
      const colliderDesc = new rapier2D.ColliderDesc(shape).setActiveEvents(rapier2D.ActiveEvents.COLLISION_EVENTS);
      const collider = world.createCollider(colliderDesc);
      return collider;
    });

    createEffect(() => {
      const width = size.width / 20;
      const height = size.height / 20;

      colliders[0].setTranslation({ x: 0, y: -height / 2 }); // bottom
      colliders[1].setTranslation({ x: 0, y: height / 2 }); // top
      colliders[2].setTranslation({ x: width / 2, y: 0 }); // left
      colliders[3].setTranslation({ x: -width / 2, y: 0 }); // right
    });
  }

  const bunnies = [
    { x: 0, y: -5 },
    { x: 0, y: -9 },
    { x: 0, y: -13 },
    { x: 0, y: -17 },
    { x: 0, y: -21 },
    { x: 0, y: -25 }
  ].map((pos) => {
    const bunny = (
      <Sprite
        texture={texture()}
        anchor={{ x: 0.5, y: 0.5 }}
        scale={{ x: 0.1, y: 0.1 }}
        position={{ x: pos.x, y: pos.y }}
      />
    ) as _Sprite & JSX.Element;
    const rigidBody = (<RigidBody x={bunny.x} y={-bunny.y} angle={30} />) as _RigidBody & JSX.Element;
    <Collider hx={1} hy={1} parent={rigidBody} />;

    return { bunny, rigidBody };
  });

  addEventListener('devicemotion', (event) => {
    if (!event) return;
    const { x, y } = event.acceleration ?? { x: 0, y: 0 };
    const { alpha, beta, gamma } = event.rotationRate ?? { alpha: 0, beta: 0, gamma: 0 };
    if (x === null || y === null) return;
    if (alpha === null || beta === null || gamma === null) return;
    setDevicemotion('acceleration', { x: x ?? 0, y: y ?? 0, z: 0 });
    setDevicemotion('rotationRate', { alpha: alpha ?? 0, beta: beta ?? 0, gamma: gamma ?? 0 });
    for (const { rigidBody } of bunnies) {
      // rigidBody.applyImpulse({ x: -x * 2, y: -y * 2 }, true);

      // Applay acceleration and rotationRate directly to velocity and angularVelocity
      const velocity = rigidBody.linvel();
      const angularVelocity = rigidBody.angvel();
      rigidBody.setLinvel({ x: velocity.x + -x * 0.2, y: velocity.y + -y * 0.2 }, true);
      // alpha is a degree per second around z axis

      rigidBody.setAngvel(angularVelocity + toRadian(alpha), true);
    }
  });

  const stage = (
    <Container>
      <Container scale={{ x: 20, y: 20 }} position={{ x: size.width / 2, y: size.height / 2 }}>
        {bunnies.map(({ bunny }) => bunny)}
        {debugRender}
        <Graphics
          interactive
          ref={(graphics) => {
            graphics.rect(0, 0, 4, 4).fill(0xff0000);
          }}
          onpointerdown={() => {
            bunnies.forEach(({ rigidBody }) => {
              const force = { x: Math.sin(0) * 200, y: Math.cos(0) * 200 };
              rigidBody.applyImpulse(force, true);
            });
            navigator.vibrate(30);
          }}
        />
        <Graphics
          ref={(graphics) => {
            // acceleration
            graphics.clear();
            graphics
              .setStrokeStyle({
                width: 0.5,
                color: 0x0000ff
              })
              .moveTo(0, 0)
              .lineTo(-devicemotion.acceleration.x, devicemotion.acceleration.y)
              .stroke();

            // rotationRate
            graphics
              .setStrokeStyle({
                width: 0.5,
                color: 0x00ffff
              })
              .moveTo(0, 0)
              .lineTo(-devicemotion.rotationRate.alpha, 0)
              .stroke();

            // gravity
            graphics
              .setStrokeStyle({
                width: 0.5,
                color: 0xffff00
              })
              .moveTo(0, 0)
              .lineTo(devicemotion.gravity.x, -devicemotion.gravity.y)
              .stroke();
          }}
        />
      </Container>
    </Container>
  ) as _Container & JSX.Element;

  // <Collider x={0} y={-10} angle={angle()} hx={10} hy={2} />;

  const ticker = new Ticker();

  onMount(() => {
    const [running, start, stop] = createRAF((delta) => {
      ticker.update();
      const eventQueue = new rapier2D.EventQueue(true);
      world.step(eventQueue);

      eventQueue.drainCollisionEvents((handle1, handle2, started) => {
        if (started) {
          navigator.vibrate(10);
        }
      });

      for (const { bunny, rigidBody } of bunnies) {
        bunny.x = rigidBody.translation().x;
        bunny.y = -rigidBody.translation().y;
        bunny.rotation = -rigidBody.rotation();
      }

      debugRenderUpdate();

      renderer.render({ container: stage });
    });
    start();
  });

  return <></>;
}

function createDebugRender() {
  const world = useWorld();

  const lines = (<Graphics />) as _Graphics & JSX.Element;

  return [
    lines,
    () => {
      const buffers = world.debugRender();
      const vtx = buffers.vertices;
      const cls = buffers.colors;

      lines.clear();

      for (let i = 0; i < vtx.length / 4; i += 1) {
        const color = Color.shared.setValue([cls[i * 8], cls[i * 8 + 1], cls[i * 8 + 2]]).toHex();
        // (width, color, alpha, alignment, native)
        lines.setStrokeStyle({
          width: 0.1,
          color: color,
          alpha: cls[i * 8 + 3],
          alignment: 0.5
        });
        lines.moveTo(vtx[i * 4], -vtx[i * 4 + 1]);
        lines.lineTo(vtx[i * 4 + 2], -vtx[i * 4 + 3]);
        lines.stroke();
      }
    }
  ] as const;
}
