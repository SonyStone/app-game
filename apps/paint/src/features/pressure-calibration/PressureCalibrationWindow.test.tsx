// @vitest-environment jsdom
import { defaultBrush, type Brush } from '@app-game/paint-core/brush';
import { createPressureCalibration } from '@app-game/pressure-calibration';
import { render } from '@solidjs/web';
import { ok, type Ok } from 'neverthrow';
import { createRoot, createSignal, flush } from 'solid-js';
import { afterEach, expect, it, vi } from 'vitest';
import { PressureCalibrationWindow } from './PressureCalibrationWindow';

/** The `preview` the panel hands to the calibration block; read through `props`, whose getters follow the panel. */
const block = vi.hoisted(() => ({
  props: undefined as { preview?: { brush?: Brush; resources?: readonly { id: string }[] } } | undefined
}));
vi.mock('@app-game/pressure-calibration', async (original) => ({
  ...(await original<typeof import('@app-game/pressure-calibration')>()),
  PressureCalibration: (props: NonNullable<typeof block.props>) => {
    block.props = props;
    return <div />;
  }
}));

const disposals: (() => void)[] = [];
afterEach(() => {
  block.props = undefined;
  disposals.splice(0).forEach((dispose) => dispose());
  document.body.replaceChildren();
  localStorage.clear();
});

it('follows the brush, and switches presets only once their images are read', async () => {
  const calibration = createRoot((dispose) => {
    disposals.push(dispose);
    return createPressureCalibration();
  });
  calibration.save({
    points: [
      { x: 0.05, y: 0 },
      { x: 0.42, y: 0.5 },
      { x: 0.8, y: 1 }
    ]
  });
  const [brush, setBrush] = createSignal<Brush>(defaultBrush());
  const [preset, setPreset] = createSignal<string | undefined>('round');
  let release!: () => void;
  const resources = vi.fn((id: string | undefined) =>
    id === 'abr'
      ? new Promise<Ok<{ id: string }[], never>>((resolve) => {
          release = () => resolve(ok([{ id: 'tip' }]));
        })
      : Promise.resolve(ok([]))
  );
  disposals.push(
    render(
      () => (
        <PressureCalibrationWindow
          position={{ x: 0, y: 0 }}
          onMove={() => undefined}
          onClose={() => undefined}
          calibration={calibration}
          brush={brush()}
          preset={preset()}
          resources={resources as never}
        />
      ),
      document.body
    )
  );
  await vi.waitFor(() => {
    flush();
    expect(block.props).toBeDefined();
  });
  // Calibrated strokes reach a brush with the default 5%–80% range as 0%–100%.
  expect(block.props!.preview!.brush).toMatchObject({ size: 32, stroke: { minimum: 0, maximum: 1 } });
  expect(document.querySelector('[role="dialog"][aria-label="Pen pressure"]')).not.toBeNull();

  setBrush({ ...brush(), size: 80 });
  flush();
  expect(block.props!.preview!.brush!.size).toBe(80);

  setPreset('abr');
  setBrush({ ...brush(), size: 12, engine: { id: 'abr', settings: {} } });
  flush();
  expect(block.props!.preview!.brush!.size).toBe(80);
  release();
  await vi.waitFor(() => {
    flush();
    expect(block.props!.preview!.brush).toMatchObject({ size: 12, engine: { id: 'abr' } });
  });
  expect(block.props!.preview!.resources).toEqual([{ id: 'tip' }]);
});
