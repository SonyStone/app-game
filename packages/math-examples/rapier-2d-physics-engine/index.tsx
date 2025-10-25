import { toRadian } from '@packages/ogl/extras/path/utils';
import createRAF from '@solid-primitives/raf';
import { lazy, onCleanup } from 'solid-js';
import { createStore } from 'solid-js/store';

const TestRapier2D = lazy(async () => {
  const RAPIER = await import('@dimforge/rapier2d-simd');

  function TestCube() {
    const [state, setSteate] = createStore({
      groundCollider: {
        hx: 6.0,
        hy: 0.1,
        translation: { x: 0.0, y: 0.0 }
      },
      rigidBody: {
        hx: 2,
        hy: 0.1,
        translation: { x: -0.0, y: 10.0 },
        rotation: toRadian(100)
      },
      collider: {
        translation: { x: 0.0, y: 4.0 },
        rotation: 0.0
      }
    });

    const canvas = (<canvas width="800" height="600" class="w-800px h-600px border" />) as HTMLCanvasElement;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Cannot get canvas context');

    const gravity = { x: 0.0, y: -9.81 };
    const world = new RAPIER.World(gravity);

    onCleanup(() => {
      world.free();
      console.log('cleanup world');
    });

    // Create the ground
    const groundColliderDesc = RAPIER.ColliderDesc.cuboid(state.groundCollider.hx, state.groundCollider.hy);
    world.createCollider(groundColliderDesc);

    // Create a dynamic rigid-body.
    const rigidBodyDesc = RAPIER.RigidBodyDesc.dynamic()
      .setTranslation(state.rigidBody.translation.x, state.rigidBody.translation.y)
      .setRotation(state.rigidBody.rotation);
    const rigidBody = world.createRigidBody(rigidBodyDesc);

    // Create a cuboid collider attached to the dynamic rigidBody.
    const colliderDesc = RAPIER.ColliderDesc.cuboid(state.rigidBody.hx, state.rigidBody.hy);
    const collider = world.createCollider(colliderDesc, rigidBody);

    const [running, start, stop] = createRAF(({ dt }) => {
      // Step the physics world.
      world.step();
      setSteate('rigidBody', 'translation', rigidBody.translation());
      setSteate('rigidBody', 'rotation', rigidBody.rotation());

      setSteate('collider', 'translation', collider.translation());
      setSteate('collider', 'rotation', collider.rotation());

      {
        const { vertices, colors } = world.debugRender();
        ctx.clearRect(0, 0, 600, 800);

        for (let i = 0; i < vertices.length / 4; i += 1) {
          ctx.beginPath();
          ctx.strokeStyle = `#${colors[i].toString(16).padStart(6, '0')}`;
          ctx.moveTo(300 + vertices[i * 4] * 40, 400 + -vertices[i * 4 + 1] * 40);
          ctx.lineTo(300 + vertices[i * 4 + 2] * 40, 400 + -vertices[i * 4 + 3] * 40);
          ctx.stroke();
        }
      }

      const isSleeping = world.bodies.getAll().every((b) => b.isSleeping());
      if (isSleeping) {
        stop();
      }
    });
    start();

    return (
      <div>
        <span>2D Physics Engine with Rapier</span>
        <pre>
          Is running: {running() ? 'Yes' : 'No'}
          {state.rigidBody.translation.y}
          {state.collider.translation.y}
        </pre>
        <svg width="800" height="600" viewBox="-15 -20 40 30" style="border:1px solid black">
          <rect
            x={state.groundCollider.translation.x - state.groundCollider.hx}
            y={-state.groundCollider.translation.y - state.groundCollider.hy}
            width={state.groundCollider.hx * 2}
            height={state.groundCollider.hy * 2}
            fill="blue"
          />
          <rect
            style={{
              transform: `rotate(${-state.rigidBody.rotation}rad) translate(${state.rigidBody.translation.x}px, ${-state.rigidBody.translation.y}px)  `,
              'transform-origin': `${state.rigidBody.translation.x + state.rigidBody.hx}px ${-(state.rigidBody.translation.y - state.rigidBody.hy)}px`
            }}
            width={state.rigidBody.hx * 2}
            height={state.rigidBody.hy * 2}
            fill="blue"
          />
        </svg>
        {canvas}
      </div>
    );
  }

  return { default: TestCube };
});

export default function Rapier2DPhysicsEnginePage() {
  return (
    <div>
      <TestRapier2D />
    </div>
  );
}
