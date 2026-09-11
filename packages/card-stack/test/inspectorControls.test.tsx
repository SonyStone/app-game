import { render } from '@solidjs/web';
import { createSignal, flush } from 'solid-js';
import { afterEach, describe, expect, it } from 'vitest';
import { Select } from '@app-game/components/ui/select';
import { Checkbox } from '@app-game/components/ui/checkbox';

const disposers: (() => void)[] = [];
afterEach(() => { disposers.splice(0).forEach(dispose => dispose()); document.body.replaceChildren(); });

describe('shared inspector controls', () => {
  it('selects with the keyboard, skips disabled options and closes on Escape without changing selection', () => {
    const host = document.createElement('div'); document.body.append(host);
    const [value, setValue] = createSignal('a');
    disposers.push(render(() => <Select aria-label="Test select" value={value()} onChange={setValue} options={[{ value: 'a', label: 'First' }, { value: 'b', label: 'Disabled', disabled: true }, { value: 'c', label: 'Last' }]} />, host));
    flush();
    const trigger = host.querySelector('button')!;
    trigger.focus();
    trigger.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true }));
    flush();
    expect(trigger.getAttribute('aria-expanded')).toBe('true');
    expect(document.getElementById(trigger.getAttribute('aria-activedescendant')!)?.textContent).toBe('Last');
    trigger.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
    flush();
    expect(value()).toBe('c');
    expect(document.querySelector('[role="listbox"]')).toBeNull();
    trigger.dispatchEvent(new KeyboardEvent('keydown', { key: 'Home', bubbles: true, cancelable: true }));
    flush();
    trigger.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    flush();
    expect(value()).toBe('c');
    expect(document.activeElement).toBe(trigger);
  });

  it('labels toggle a controlled checkbox and disabled inputs preserve state', () => {
    const host = document.createElement('div'); document.body.append(host);
    const [checked, setChecked] = createSignal(false), [disabled, setDisabled] = createSignal(false);
    disposers.push(render(() => <Checkbox checked={checked()} disabled={disabled()} onChange={event => setChecked(event.currentTarget.checked)}>Visible</Checkbox>, host));
    flush();
    host.querySelector('label')!.click();
    flush();
    expect(checked()).toBe(true);
    setDisabled(true); flush();
    host.querySelector('label')!.click(); flush();
    expect(checked()).toBe(true);
  });
});
