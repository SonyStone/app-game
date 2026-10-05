import { For, Show } from 'solid-js';
import { createHoverHints } from '../../shared/ui/createHoverHints';
import { FloatingBar, FloatingBarSeparator, floatingBarPrimary } from '../../shared/ui/FloatingBar';
import { HintCard, hintDemo, type Hint } from '../../shared/ui/HintCard';
import { SketchIcon } from '../../shared/ui/SketchIcon';
import type { TransformSettings } from './createTransform';
import styles from './Transform.module.css';
import { maxWarpCells } from './warp';

/**
 * Compact transform actions next to the box: flips, a quarter turn, distort and warp, exact values, the proportions and
 * pixel-art settings, reset, cancel and apply. The options of distort (perspective) and warp (its grid) appear in a
 * second row below. A pen or mouse resting on a button shows what it does; see `HintCard`.
 */
export function TransformActions(props: {
  /** Where the bar goes; see `placeBeside`. */
  placement: { left: number; top: number };
  settings: TransformSettings;
  onSettings: (patch: Partial<TransformSettings>) => void;
  onFlip: (axis: 'x' | 'y') => void;
  onRotate: () => void;
  /** Whether the box is distorted by its corners. */
  distorted: boolean;
  /** Whether a distortion foreshortens in perspective rather than stretching bilinearly; see `TransformSettings`. */
  perspective: boolean;
  onDistort: (on: boolean) => void;
  /** Whether the pixels are warped by a grid of points. */
  warped: boolean;
  onWarp: (on: boolean) => void;
  /** The warp's patches per side, and the change of it; see `Warp`. */
  warpCells: number;
  onWarpGrid: (cells: number) => void;
  /** Whether the exact values are shown. */
  numbers: boolean;
  onNumbers: (shown: boolean) => void;
  onReset: () => void;
  onCancel: () => void;
  onDone: () => void;
}) {
  const hints = createHoverHints<keyof typeof actionHints>();
  // Handlers created once, outside the JSX, so that re-applied attributes keep them.
  const on = Object.fromEntries(
    Object.keys(actionHints).map((id) => [id, hints.on(id as keyof typeof actionHints)])
  ) as { [id in keyof typeof actionHints]: ReturnType<typeof hints.on> };
  const hasOptions = () => props.distorted || props.warped;
  /** The hint goes above the bars, or below them near the top of the view. */
  const hintStyle = (element: HTMLElement) => ({
    left: `${element.offsetLeft + element.offsetWidth / 2}px`,
    transform: 'translateX(-50%)',
    ...(props.placement.top > hintRoom
      ? { bottom: 'calc(100% + 8px)' }
      : { top: `calc(100% + ${hasOptions() ? optionsGap + barHeight + 8 : 8}px)` })
  });

  return (
    <>
      <FloatingBar placement={props.placement} label="Transform actions">
        <button aria-label="Flip horizontal" onClick={() => props.onFlip('x')} {...on.flipX}>
          <SketchIcon name="mirror" size={20} />
        </button>
        <button aria-label="Flip vertical" onClick={() => props.onFlip('y')} {...on.flipY}>
          <SketchIcon name="flipVertical" size={20} />
        </button>
        <button aria-label="Rotate 90°" onClick={() => props.onRotate()} {...on.rotate}>
          <SketchIcon name="rotate" size={20} />
        </button>
        <button
          aria-label="Distort"
          aria-pressed={props.distorted ? 'true' : 'false'}
          onClick={() => props.onDistort(!props.distorted)}
          {...on.distort}
        >
          <SketchIcon name="distort" size={20} />
        </button>
        <button
          aria-label="Warp"
          aria-pressed={props.warped ? 'true' : 'false'}
          onClick={() => props.onWarp(!props.warped)}
          {...on.warp}
        >
          <SketchIcon name="warp" size={20} />
        </button>
        <button
          aria-label="Exact values"
          aria-pressed={props.numbers ? 'true' : 'false'}
          onClick={() => props.onNumbers(!props.numbers)}
          {...on.numbers}
        >
          <SketchIcon name="numbers" size={20} />
        </button>
        <FloatingBarSeparator />
        <button
          aria-label="Keep proportions"
          aria-pressed={props.settings.proportional ? 'true' : 'false'}
          onClick={() => props.onSettings({ proportional: !props.settings.proportional })}
          {...on.proportions}
        >
          <SketchIcon name="proportions" size={20} />
        </button>
        <button
          aria-label="Pixel art"
          aria-pressed={props.settings.interpolation === 'pixels' ? 'true' : 'false'}
          onClick={() =>
            props.onSettings({ interpolation: props.settings.interpolation === 'pixels' ? 'smooth' : 'pixels' })
          }
          {...on.pixels}
        >
          <SketchIcon name="pixels" size={20} />
        </button>
        <FloatingBarSeparator />
        <button aria-label="Reset" onClick={() => props.onReset()} {...on.reset}>
          <SketchIcon name="reset" size={20} />
        </button>
        <button aria-label="Cancel" onClick={() => props.onCancel()} {...on.cancel}>
          <SketchIcon name="close" size={20} />
        </button>
        <button class={floatingBarPrimary} aria-label="Done" onClick={() => props.onDone()} {...on.done}>
          <SketchIcon name="check" size={20} />
        </button>
        <Show when={hints.shown()}>
          {(shown) => <HintCard hint={actionHints[shown().id]} style={hintStyle(shown().element)} />}
        </Show>
      </FloatingBar>
      <Show when={hasOptions()}>
        <FloatingBar
          placement={{ left: props.placement.left, top: props.placement.top + barHeight + optionsGap }}
          label="Transform options"
        >
          <Show when={props.distorted}>
            <span>Distort</span>
            <button
              class={styles.textOption}
              aria-pressed={props.perspective ? 'true' : 'false'}
              onClick={() => props.onSettings({ perspective: !props.perspective })}
            >
              Perspective
            </button>
          </Show>
          <Show when={props.warped}>
            <span>Grid</span>
            <For each={warpGrids}>
              {(cells) => (
                <button
                  class={styles.textOption}
                  aria-label={`Warp grid ${cells}×${cells}`}
                  aria-pressed={props.warpCells === cells ? 'true' : 'false'}
                  onClick={() => props.onWarpGrid(cells)}
                >
                  {cells}×{cells}
                </button>
              )}
            </For>
          </Show>
        </FloatingBar>
      </Show>
    </>
  );
}

/** Height of a `FloatingBar` of icon buttons, and the gap to the options row below it. */
export const barHeight = 48;
const optionsGap = 6;

/** Space a hint needs above the bars; nearer the top of the view it goes below them. */
const hintRoom = 170;

/** Patches per side the warp grid offers. */
const warpGrids = Array.from({ length: maxWarpCells }, (_, index) => index + 1);

/** What each action does, shown when a pen or mouse rests on it. */
const actionHints = {
  flipX: {
    title: 'Flip horizontal',
    description: 'Mirrors the pixels left to right within the box.',
    demo: () => (
      <g class={hintDemo.flip}>
        <path class={hintDemo.ink} d="M44 54c0-22 10-36 28-36-6 8-8 16-4 24" />
      </g>
    )
  },
  flipY: {
    title: 'Flip vertical',
    description: 'Mirrors the pixels top to bottom within the box.',
    demo: () => (
      <g class={hintDemo.flipY}>
        <path class={hintDemo.ink} d="M38 50c18 0 32-10 32-28 8 6 16 8 24 4" />
      </g>
    )
  },
  rotate: { title: 'Rotate 90°', description: 'Turns the box a quarter turn clockwise.' },
  distort: {
    title: 'Distort',
    description: 'Drag each corner on its own; the pixels follow. Below: in perspective or evenly.',
    demo: () => (
      <path
        class={hintDemo.morph}
        d="M30 16h60v40H30Z"
        style={{ '--from': "path('M30 16h60v40H30Z')", '--to': "path('M42 14h40l16 44H22Z')" }}
      />
    )
  },
  warp: {
    title: 'Warp',
    description: 'Bend the pixels: drag inside the grid where it should bend, or its points. Below: the grid size.',
    demo: () => (
      <path
        class={hintDemo.morph}
        d="M24 16C44 16 76 16 96 16L96 56C76 56 44 56 24 56Z"
        style={{
          '--from': "path('M24 16C44 16 76 16 96 16L96 56C76 56 44 56 24 56Z')",
          '--to': "path('M24 22C44 6 76 30 96 14L96 54C76 70 44 46 24 62Z')"
        }}
      />
    )
  },
  numbers: { title: 'Exact values', description: 'Type the width and height in percent, the angle and the offset.' },
  proportions: {
    title: 'Keep proportions',
    shortcut: 'Shift: opposite',
    description: 'Corner handles scale both sides together.'
  },
  pixels: {
    title: 'Pixel art',
    description: 'Keeps hard pixel edges by taking the nearest pixel instead of smoothing.'
  },
  reset: { title: 'Reset', description: 'Puts the pixels back where they started, keeping the transform open.' },
  cancel: { title: 'Cancel', shortcut: 'Esc', description: 'Leaves the pixels as they were.' },
  done: { title: 'Done', shortcut: 'Enter', description: 'Applies the transform as one undo step.' }
} as const satisfies Record<string, Hint>;
