// @vitest-environment jsdom
import { render } from '@solidjs/web';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createSignal, flush } from 'solid-js';
import { afterEach, expect, it } from 'vitest';
import { SettingsList, type SettingsListItem } from './SettingsList';

let dispose: (() => void) | undefined;
afterEach(() => {
  dispose?.();
  dispose = undefined;
  document.body.replaceChildren();
});

it('heads each group once where it starts, marks the selected item and selects the pressed one', () => {
  const [items, setItems] = createSignal<readonly SettingsListItem[]>([
    { id: 'general', label: 'General' },
    { id: 'painting', label: 'Painting', icon: 'sliders', trailing: '32 px · 100%', group: 'basics' },
    { id: 'tip', label: 'Brush tip', group: 'basics' },
    { id: 'stroke', label: 'Stroke correction', trailing: 'Stabilizer · 6', group: 'advanced' }
  ]);
  const [selected, setSelected] = createSignal('painting');
  const host = document.createElement('div');
  document.body.append(host);
  dispose = render(
    () => (
      <SettingsList
        label="Categories"
        items={items()}
        groups={[
          { id: 'advanced', label: 'Advanced' },
          { id: 'basics', label: 'Basics' }
        ]}
        selected={selected()}
        onSelect={setSelected}
      />
    ),
    host
  );
  flush();
  const nav = host.querySelector('nav[aria-label="Categories"]')!;
  const outline = () =>
    [...nav.children].map((element) =>
      element.tagName === 'H3'
        ? `# ${element.textContent}`
        : `${element.getAttribute('aria-current') ? '>' : '-'} ${element.textContent}`
    );
  expect(outline()).toEqual([
    '- General',
    '# Basics',
    '> Painting32 px · 100%',
    '- Brush tip',
    '# Advanced',
    '- Stroke correctionStabilizer · 6'
  ]);
  const stroke = [...nav.querySelectorAll('button')][3]!;
  expect(stroke.getAttribute('aria-current')).toBeNull();
  expect(document.getElementById(stroke.getAttribute('aria-describedby')!)!.textContent).toBe('Stabilizer · 6');

  stroke.click();
  flush();
  expect(selected()).toBe('stroke');
  expect(stroke.getAttribute('aria-current')).toBe('page');

  // New statuses keep the rows; the row stays the same element.
  setItems((current) => current.map((item) => (item.id === 'stroke' ? { ...item, trailing: 'Off' } : item)));
  flush();
  expect([...nav.querySelectorAll('button')][3]).toBe(stroke);
  expect(stroke.textContent).toBe('Stroke correctionOff');
});

it("insets each row's icon from the highlight's side as far as from its top, against a host's button reset", () => {
  // jsdom applies no stylesheet, so it is read as text. The brush studio resets its buttons with
  // `.frame :where(button) { padding: 0 }`, one class, loaded after the list: the row's padding needs two to win.
  const css = readFileSync(join(__dirname, 'SettingsList.module.css'), 'utf8');
  const row = /\n\.list \.row \{([\s\S]*?)\n\}/.exec(css)?.[1] ?? '';
  expect(row).toContain('min-height: var(--settings-list-row, 40px);');
  const tile = Number(/\.icon \{[^}]*?width: (\d+)px/.exec(css)![1]);
  const inset = Number(/\n\s*padding: 0 \d+px 0 (\d+)px;/.exec(row)![1]);
  expect(inset).toBe((40 - tile) / 2);
  // Selected and other rows share the padding: only colors change with `aria-current`.
  const selected = /&\[aria-current\] \{([^}]*)\}/.exec(row)?.[1];
  expect(selected).toContain('background');
  expect(selected).not.toMatch(/padding|margin|grid/);
});
