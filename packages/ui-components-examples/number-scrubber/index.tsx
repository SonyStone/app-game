import { Title } from '@solidjs/meta';
import type { JSX } from '@solidjs/web';
import { createSignal } from 'solid-js';
import { BRUSH_SIZE_CURVE, BRUSH_SIZE_PRESETS } from './brush-size';
import { NumberScrubber, type NumberScrubberProps } from './number-scrubber';
import { Segmented } from './segmented';

/** Inspector panel whose scrubbers drive a live preview; the footer shows which value was committed last. */
export default function NumberScrubberExample() {
  const [x, setX] = createSignal(40);
  const [y, setY] = createSignal(24);
  const [rotation, setRotation] = createSignal(15);
  const [scale, setScale] = createSignal(1);
  const [radius, setRadius] = createSignal(12);
  const [opacity, setOpacity] = createSignal(0.9);
  const [brushSize, setBrushSize] = createSignal(24);
  const [lastCommit, setLastCommit] = createSignal('nothing yet');
  const [ruler, setRuler] = createSignal<NonNullable<NumberScrubberProps['ruler']>>('arc');
  const [hand, setHand] = createSignal<NonNullable<NumberScrubberProps['hand']>>('left');
  const [dialRadius, setDialRadius] = createSignal(80);
  const [snapStyle, setSnapStyle] = createSignal<NonNullable<NumberScrubberProps['snapStyle']>>('panel');

  /**
   * Previews every drag step, records the value committed at the end of the gesture, and applies the toolbar's
   * ruler, hand, and dial radius. Getters keep them reactive through the JSX spread.
   */
  const bind = (name: string, set: (value: number) => void) => ({
    get ruler() {
      return ruler();
    },
    get hand() {
      return hand();
    },
    get radius() {
      return ruler() === 'dial' ? dialRadius() : undefined;
    },
    onTemporaryChange: set,
    onChange: (value: number) => {
      set(value);
      setLastCommit(`${name} = ${value}`);
    }
  });

  return (
    <>
      <Title>Number Scrubber</Title>
      <div class="flex flex-wrap items-center gap-6 px-6 pt-6 text-sm text-slate-600">
        <Segmented label="Ruler" options={['line', 'arc', 'dial', 'vertical']} value={ruler()} onChange={setRuler} />
        <Segmented label="Hand" options={['left', 'right']} value={hand()} onChange={setHand} />
        <Segmented label="Presets" options={['dots', 'panel', 'grid']} value={snapStyle()} onChange={setSnapStyle} />
        <div class="flex items-center gap-2">
          <span>Dial radius</span>
          <NumberScrubber
            aria-label="Dial radius"
            value={dialRadius()}
            min={40}
            max={400}
            step={5}
            displayValue={(v) => `${v}px`}
            onTemporaryChange={setDialRadius}
            onChange={setDialRadius}
          />
        </div>
      </div>
      <div class="flex flex-wrap items-start gap-8 p-6">
        <section class="flex w-72 flex-col gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4">
          <h2 class="text-sm font-semibold text-slate-700">Transform</h2>
          <Row label="X">
            <NumberScrubber
              aria-label="X"
              value={x()}
              min={-200}
              max={200}
              displayValue={(v) => `${v}px`}
              {...bind('X', setX)}
            />
          </Row>
          <Row label="Y">
            <NumberScrubber
              aria-label="Y"
              value={y()}
              min={-200}
              max={200}
              displayValue={(v) => `${v}px`}
              {...bind('Y', setY)}
            />
          </Row>
          <Row label="Rotation">
            <NumberScrubber
              aria-label="Rotation"
              value={rotation()}
              min={-180}
              max={180}
              displayValue={(v) => `${v}°`}
              {...bind('Rotation', setRotation)}
            />
          </Row>
          <Row label="Scale">
            <NumberScrubber
              aria-label="Scale"
              value={scale()}
              min={0.1}
              max={4}
              step={0.01}
              displayValue={(v) => `×${v.toFixed(2)}`}
              {...bind('Scale', setScale)}
            />
          </Row>

          <h2 class="mt-2 text-sm font-semibold text-slate-700">Appearance</h2>
          <Row label="Radius">
            <NumberScrubber
              aria-label="Radius"
              value={radius()}
              max={64}
              displayValue={(v) => `${v}px`}
              {...bind('Radius', setRadius)}
            />
          </Row>
          <Row label="Opacity">
            <NumberScrubber
              aria-label="Opacity"
              value={opacity()}
              max={1}
              step={0.01}
              displayValue={(v) => `${Math.round(v * 100)}%`}
              {...bind('Opacity', setOpacity)}
            />
          </Row>
          <Row label="Brush size">
            <NumberScrubber
              aria-label="Brush size"
              value={brushSize()}
              min={1}
              max={5000}
              curve={BRUSH_SIZE_CURVE}
              snapPoints={BRUSH_SIZE_PRESETS}
              snapStyle={snapStyle()}
              displayValue={(v) => `${v}px`}
              {...bind('Brush size', setBrushSize)}
            />
          </Row>
          <Row label="Read-only">
            <NumberScrubber aria-label="Read-only" value={42} readOnly />
          </Row>
          <Row label="Disabled">
            <NumberScrubber aria-label="Disabled" value={7} disabled />
          </Row>

          <p class="text-xs text-slate-500">Last commit: {lastCommit()}</p>
        </section>

        <div class="flex flex-col gap-3">
          <div class="relative h-80 w-96 overflow-hidden rounded-xl border border-slate-200 bg-[linear-gradient(#f1f5f9_1px,transparent_1px),linear-gradient(90deg,#f1f5f9_1px,transparent_1px)] bg-[length:16px_16px]">
            <div
              class="absolute top-1/2 left-1/2 size-24 bg-gradient-to-br from-sky-400 to-indigo-500 shadow-lg"
              style={{
                transform: `translate(calc(-50% + ${x()}px), calc(-50% + ${y()}px)) rotate(${rotation()}deg) scale(${scale()})`,
                'border-radius': `${radius()}px`,
                opacity: opacity()
              }}
            />
          </div>
          <ul class="max-w-96 list-disc pl-5 text-sm text-slate-600">
            <li>
              Line: drag a value left or right; the needle follows the pointer. Arc and Dial: the same wheel centred up
              the pen's body turns under a window beside the tip; Arc is wide for moving the hand, Dial is tight for the
              fingers and takes its radius from the field above. Vertical: a tape moves up and down with the pen. Values
              grow up the wheels and the tape. A tilted stylus places the wheel's centre from its lean at the first
              touch.
            </li>
            <li>
              Brush size follows Paint's Photoshop Size curve: below 100px every tick is 2px, above 500px it is 500px.
              Its presets are CLIP STUDIO PAINT's Brush Size palette. Dots: the pen scrubs freely beside the band, and
              on the band the value sticks to the nearest dot. Panel: a grid opens beside the wheel or tape, away from
              the hand; point at a size and release the pen to pick it.
            </li>
            <li>Hold Shift while dragging for coarse steps, Escape cancels the drag.</li>
            <li>Click or tap to type a value, Enter commits, Escape cancels.</li>
            <li>Arrow keys step, Shift + arrows step by ten, Home and End jump to the bounds.</li>
          </ul>
        </div>
      </div>
    </>
  );
}

/** Labelled inspector row. */
function Row(props: { label: string; children: JSX.Element }) {
  return (
    <div class="flex items-center justify-between gap-3 text-sm text-slate-600">
      <span>{props.label}</span>
      {props.children}
    </div>
  );
}
