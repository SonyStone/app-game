// @vitest-environment jsdom
import { brushSizeCurve, brushSpacingCurve } from '@app-game/abr-brush/sliderCurves';
import { render } from '@solidjs/web';
import { createSignal, flush } from 'solid-js';
import { expect, test } from 'vitest';
import { NonLinearSliderInput } from '../src/features/brush-detail/components/editable-input-components/NonLinearSliderInput';

test("Size and Spacing sliders follow Photoshop's breakpoints", () => {
  const host = document.createElement('div');
  document.body.append(host);
  const [size, setSize] = createSignal(102, { ownedWrite: true });
  const [spacing, setSpacing] = createSignal(25, { ownedWrite: true });
  const dispose = render(
    () => (
      <>
        <NonLinearSliderInput label="Size" value={size} setValue={setSize} curve={brushSizeCurve(2500)} unit=" px" />
        <NonLinearSliderInput label="Spacing" value={spacing} setValue={setSpacing} curve={brushSpacingCurve} />
      </>
    ),
    host
  );
  try {
    flush();
    const slider = (label: string) => host.querySelector<HTMLInputElement>(`[aria-label="${label} slider"]`)!;
    const move = (label: string, position: number) => {
      slider(label).value = String(position);
      slider(label).dispatchEvent(new Event('input', { bubbles: true }));
      flush();
    };
    expect(Number(slider('Size').value)).toBe(505);
    move('Size', 750);
    expect(size()).toBe(200);
    move('Size', 1000);
    expect(size()).toBe(2500);
    move('Spacing', 950);
    expect(spacing()).toBe(975);
    expect(Number(slider('Spacing').value)).toBe(950);
  } finally {
    dispose();
    host.remove();
  }
});
