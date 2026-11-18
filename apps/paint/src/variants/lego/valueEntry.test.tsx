// @vitest-environment jsdom
import { defaultBrush } from '@app-game/paint-core/brush';
import { render } from '@solidjs/web';
import { createRoot, flush } from 'solid-js';
import { afterEach, expect, it, vi } from 'vitest';
import { LegoServicesContext } from './LegoServices';
import { PartFrame } from './PartFrame';
import { editDraft, NumberKeypad, parseDraft, settleValue } from './parts/ValueEntry';
import { createTestServices } from './testServices';

const disposers: (() => void)[] = [];
afterEach(() => {
  for (const dispose of disposers.splice(0)) {
    dispose();
  }

  flush();
  document.body.replaceChildren();
  localStorage.clear();
});

it('opens the keypad on a tap on the value chip, and slides the value on a drag from it', () => {
  const { host, brush, update } = mountPart('value:brush:flow');
  const chip = host.querySelector<HTMLElement>('[data-value-chip]')!;
  expect(chip.textContent).toBe('35%');

  pointer(chip, 'pointerdown', 0);
  pointer(chip, 'pointerup', 3);
  expect(card()).not.toBeNull();
  expect(card()!.textContent).toContain('1–100%');
  expect(brush().flow).toBe(0.35);
  expect(update).not.toHaveBeenCalled();

  // A press outside closes it without a change.
  pointer(document.body, 'pointerdown', 0);
  expect(card()).toBeNull();

  // jsdom lays out nothing, so the track is a pixel wide: a drag of 20 px slides to the end.
  pointer(chip, 'pointerdown', 0);
  pointer(chip, 'pointermove', 20);
  pointer(chip, 'pointerup', 20);
  expect(card()).toBeNull();
  expect(brush().flow).toBe(1);
});

it('a tap on the track sets the value there and opens no keypad', () => {
  const { host, brush } = mountPart('value:brush:flow');
  const slider = host.querySelector<HTMLElement>('[role="slider"]')!;
  pointer(slider, 'pointerdown', 0.5);
  pointer(slider, 'pointerup', 0.5);
  expect(card()).toBeNull();
  expect(brush().flow).toBe(0.51);
});

it('commits a typed value once, clamped to the range, on OK, and takes keys from a hardware keyboard', () => {
  const { host, brush, update } = mountPart('value:brush:flow');
  const open = () => {
    const chip = host.querySelector<HTMLElement>('[data-value-chip]')!;
    pointer(chip, 'pointerdown', 0);
    pointer(chip, 'pointerup', 0);
    return card()!;
  };

  let keypad = open();
  // No decimal point for a whole step, no sign for a range that starts above zero.
  expect(keypad.querySelector('[data-key="."]')).toBeNull();
  expect(keypad.querySelector('[data-key="sign"]')).toBeNull();
  press(keypad, '2');
  press(keypad, '5');
  press(keypad, '0');
  expect(keypad.querySelector('output')!.textContent).toBe('250%');
  expect(update).not.toHaveBeenCalled();
  button(keypad, 'OK').click();
  flush();
  expect(card()).toBeNull();
  expect(update).toHaveBeenCalledTimes(1);
  expect(brush().flow).toBe(1);

  update.mockClear();
  keypad = open();
  for (const key of ['4', '7', 'Backspace', '2', 'ArrowDown']) {
    keypad.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
    flush();
  }
  expect(keypad.querySelector('output')!.textContent).toBe('41%');
  keypad.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
  flush();
  expect(update).toHaveBeenCalledTimes(1);
  expect(brush().flow).toBe(0.41);

  // Cancel and Escape change nothing.
  update.mockClear();
  keypad = open();
  press(keypad, '9');
  button(keypad, 'Cancel').click();
  flush();
  keypad = open();
  press(keypad, '9');
  const escape = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
  const outside = vi.fn();
  document.addEventListener('keydown', outside);
  keypad.dispatchEvent(escape);
  document.removeEventListener('keydown', outside);
  flush();
  expect(escape.defaultPrevented).toBe(true);
  expect(outside).not.toHaveBeenCalled();
  expect(card()).toBeNull();
  expect(update).not.toHaveBeenCalled();
  expect(brush().flow).toBe(0.41);
});

it('snaps a typed value to a fractional step and offers the point and sign only where the value takes them', () => {
  const committed = vi.fn();
  const host = document.createElement('div');
  document.body.append(host);
  disposers.push(
    render(
      () => (
        <NumberKeypad
          label="Angle"
          value={10}
          min={-180}
          max={180}
          step={0.5}
          unit="°"
          onCommit={committed}
          onCancel={() => {}}
        />
      ),
      host
    )
  );
  flush();
  for (const key of ['sign', '1', '2', '.', '3', 'nudge-up']) {
    press(host, key);
  }
  expect(host.querySelector('output')!.textContent).toBe('-12°');
  press(host, 'backspace');
  press(host, '.');
  press(host, '7');
  press(host, '4');
  expect(host.querySelector('output')!.textContent).toBe('-1.74°');
  button(host, 'OK').click();
  expect(committed).toHaveBeenCalledTimes(1);
  expect(committed).toHaveBeenCalledWith(-1.5);
});

it('edits, reads and settles drafts as a calculator does', () => {
  const takes = { decimal: true, signed: true };
  expect(editDraft('0', '7', takes)).toBe('7');
  expect(editDraft('', '.', takes)).toBe('0.');
  expect(editDraft('1.5', '.', takes)).toBe('1.5');
  expect(editDraft('12', '.', { decimal: false, signed: false })).toBe('12');
  expect(editDraft('12', 'sign', takes)).toBe('-12');
  expect(editDraft('-12', 'sign', takes)).toBe('12');
  expect(editDraft('-1', 'backspace', takes)).toBe('');
  expect(editDraft('123456789', '1', takes)).toBe('123456789');
  expect(parseDraft('')).toBeUndefined();
  expect(parseDraft('-')).toBeUndefined();
  expect(parseDraft('3.')).toBe(3);
  expect(settleValue(0.1 + 0.2, { min: 0, max: 1, step: 0.1 })).toBe(0.3);
  expect(settleValue(7.4, { min: 1, max: 5, step: 1 })).toBe(5);
  expect(settleValue(-3, { min: 1, max: 5, step: 1 })).toBe(1);
});

it('draws the stabilizer level with a tick per level and an S zone, and its chip opens a level picker', () => {
  const { host, brush, setBrush, update } = mountPart('value:brush:stabilizer-level');
  setBrush({ ...defaultBrush(), stroke: { ...defaultBrush().stroke, mode: 'stabilizer', stabilizer: 6 } });
  flush();
  const slider = host.querySelector<HTMLElement>('[role="slider"]')!;
  expect(slider.hasAttribute('data-levels')).toBe(true);
  expect(slider.querySelectorAll('[aria-hidden="true"] > :not([data-zone])')).toHaveLength(23);
  expect(slider.querySelectorAll('[data-zone="S"]')).toHaveLength(1);
  expect(slider.getAttribute('aria-valuetext')).toBe('6');

  const chip = host.querySelector<HTMLElement>('[data-value-chip]')!;
  pointer(chip, 'pointerdown', 0);
  pointer(chip, 'pointerup', 0);
  const picker = card()!;
  const options = [...picker.querySelectorAll<HTMLButtonElement>('[role="option"]')];
  expect(options.map((option) => option.textContent)).toEqual([
    ...Array.from({ length: 16 }, (_, level) => `${level}`),
    ...Array.from({ length: 7 }, (_, level) => `S-${level + 1}`)
  ]);
  expect(options.filter((option) => option.getAttribute('aria-selected') === 'true').map((o) => o.textContent)).toEqual([
    '6'
  ]);
  expect(picker.querySelector('[role="listbox"]')).not.toBeNull();
  expect(picker.querySelector('[data-key]')).toBeNull();

  options.find((option) => option.textContent === 'S-3')!.click();
  flush();
  expect(card()).toBeNull();
  expect(update).toHaveBeenCalledTimes(1);
  expect(brush().stroke.stabilizer).toBe(18);
  expect(chip.textContent).toBe('S-3');

  // A drag on the track snaps to whole levels.
  pointer(slider, 'pointerdown', 0.52);
  pointer(slider, 'pointerup', 0.52);
  expect(brush().stroke.stabilizer).toBe(11);
});

it('opens no entry on a part that does not apply now, nor while the board is being edited', () => {
  const inactive = mountPart('value:brush:stabilizer-level');
  const chip = inactive.host.querySelector<HTMLElement>('[data-value-chip]')!;
  expect(chip.textContent).toBe('—');
  pointer(chip, 'pointerdown', 0);
  pointer(chip, 'pointerup', 0);
  expect(card()).toBeNull();

  const editing = mountPart('value:brush:flow', 'edit');
  expect(editing.host.querySelector('[data-part-kind]')!.hasAttribute('inert')).toBe(true);
});

/** The open number entry card, if any. */
function card() {
  return document.querySelector<HTMLElement>('[popover][role="dialog"]');
}

function press(root: Element, key: string) {
  root.querySelector<HTMLButtonElement>(`[data-key="${key}"]`)!.click();
  flush();
}

function button(root: Element, text: string) {
  return [...root.querySelectorAll<HTMLButtonElement>('button')].find((element) => element.textContent === text)!;
}

/** Mounts the real value part of `kind` as a four-cell slider against test services. */
function mountPart(kind: string, mode: 'live' | 'edit' = 'live') {
  const { services, brush, setBrush } = createRoot((dispose) => {
    disposers.push(dispose);
    return createTestServices();
  });
  const update = vi.spyOn(services.brushEditor, 'update');
  const host = document.createElement('div');
  document.body.append(host);
  disposers.push(
    render(
      () => (
        <LegoServicesContext value={services}>
          <PartFrame kind={kind} span={{ columns: 4, rows: 1 }} look="slider" mode={mode} />
        </LegoServicesContext>
      ),
      host
    )
  );
  flush();
  return { host, services, brush, setBrush, update };
}

/** Flushes between real pointer events, preserving Solid 2's event-local write timing. */
function pointer(target: EventTarget, type: string, x: number) {
  const event = new MouseEvent(type, { bubbles: true, cancelable: true, clientX: x });
  Object.defineProperties(event, { pointerId: { value: 1 }, pointerType: { value: 'pen' } });
  target.dispatchEvent(event);
  flush();
}
