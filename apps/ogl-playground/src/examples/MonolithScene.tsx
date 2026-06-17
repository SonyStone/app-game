import { Box, Mesh, Program, useTime } from '@work-ilyas/solid-ogl';
import { createEffect, createMemo, createSignal } from 'solid-js';
import fragment from '../monolith.frag?raw';
import vertex from '../monolith.vert?raw';
import { ExampleControlsPortal } from './controls-context';
import type { MonolithProgramLike } from './types';

export function MonolithScene() {
  let programRef: MonolithProgramLike | undefined;
  const time = useTime();
  const [speed, setSpeed] = createSignal(0.6);
  const [pulse, setPulse] = createSignal(0.12);
  const [scale, setScale] = createSignal(1.05);
  const [tone, setTone] = createSignal(0.6);

  const palette = createMemo(() => {
    const currentTone = tone();

    return [
      [
        0.98 - currentTone * 0.22,
        0.7 - currentTone * 0.3,
        0.3 + currentTone * 0.35,
      ],
      [
        0.08 + currentTone * 0.12,
        0.12 + currentTone * 0.24,
        0.2 + currentTone * 0.4,
      ],
    ] as const;
  });

  const rotation = createMemo(() => [
    time() * speed(),
    time() * speed() * 0.72,
    0,
  ]);
  const animatedScale = createMemo(() => {
    const animatedPulse = 1 + Math.sin(time() * 1.6) * pulse();
    return scale() * animatedPulse;
  });

  createEffect(() => {
    if (!programRef) {
      return;
    }

    const currentPalette = palette();
    programRef.uniforms.uTime.value = time();
    programRef.uniforms.uColorA.value = currentPalette[0];
    programRef.uniforms.uColorB.value = currentPalette[1];
  });

  return (
    <>
      <ExampleControlsPortal id="monolith">
        <section class="grid gap-4 rounded-2xl border border-stone-800 bg-stone-900/60 p-4">
          <h2 class="text-sm font-semibold text-stone-100">
            Monolith controls
          </h2>

          <label class="grid gap-2">
            <div class="flex items-center justify-between gap-3 text-sm text-stone-300">
              <span>Rotation speed</span>
              <strong class="font-mono">{speed().toFixed(2)}x</strong>
            </div>
            <input
              class="w-full accent-amber-300"
              type="range"
              min="0.1"
              max="2"
              step="0.05"
              value={speed()}
              onInput={(event) => setSpeed(Number(event.currentTarget.value))}
            />
          </label>

          <label class="grid gap-2">
            <div class="flex items-center justify-between gap-3 text-sm text-stone-300">
              <span>Pulse</span>
              <strong class="font-mono">{pulse().toFixed(2)}</strong>
            </div>
            <input
              class="w-full accent-amber-300"
              type="range"
              min="0"
              max="0.4"
              step="0.01"
              value={pulse()}
              onInput={(event) => setPulse(Number(event.currentTarget.value))}
            />
          </label>

          <label class="grid gap-2">
            <div class="flex items-center justify-between gap-3 text-sm text-stone-300">
              <span>Scale</span>
              <strong class="font-mono">{scale().toFixed(2)}</strong>
            </div>
            <input
              class="w-full accent-amber-300"
              type="range"
              min="0.6"
              max="1.6"
              step="0.05"
              value={scale()}
              onInput={(event) => setScale(Number(event.currentTarget.value))}
            />
          </label>

          <label class="grid gap-2">
            <div class="flex items-center justify-between gap-3 text-sm text-stone-300">
              <span>Tone</span>
              <strong class="font-mono">{tone().toFixed(2)}</strong>
            </div>
            <input
              class="w-full accent-amber-300"
              type="range"
              min="0"
              max="1"
              step="0.01"
              value={tone()}
              onInput={(event) => setTone(Number(event.currentTarget.value))}
            />
          </label>
        </section>
      </ExampleControlsPortal>

      <Mesh rotation={rotation()} scale={animatedScale()}>
        <Box args={[1.45, 1.45, 1.45, 18, 18, 18]} />
        <Program
          ref={(instance) => {
            programRef = instance as unknown as MonolithProgramLike;
          }}
          args={[
            {
              vertex,
              fragment,
              uniforms: {
                uTime: { value: time() },
                uColorA: { value: palette()[0] },
                uColorB: { value: palette()[1] },
              },
              cullFace: null,
            },
          ]}
        />
      </Mesh>
    </>
  );
}
