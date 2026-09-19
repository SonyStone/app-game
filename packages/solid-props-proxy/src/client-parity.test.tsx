// @vitest-environment jsdom
// Happy DOM retains stale cssText after these attribute/style transitions.
// The expected CSSOM results were also verified in Chromium.

import { assign as solidAssign } from '@solidjs/web';
import { createRoot, createSignal, flush } from 'solid-js';
import { describe, expect, it } from 'vitest';
import { createPropsProxy } from './component';
import { createSpread } from './spread';
import type { Props } from './types';

/** Compares observable updates with the installed client.ts through its assign export. */
describe('client.ts assignment parity', () => {
  it('does not turn an is attribute into custom-element property assignment', () => {
    const actual = document.createElement('button');
    const expected = document.createElement('button');
    const dispose = createRoot((dispose) => {
      const update = createSpread(actual);
      const previous = {};
      for (const props of [
        { is: 'custom-button', title: 'first', disabled: true },
        { title: 'second', disabled: false }
      ]) {
        update(props);
        solidAssign(expected, props, true, previous);
        expect(actual.outerHTML).toBe(expected.outerHTML);
        expect(Object.hasOwn(actual, 'is')).toBe(false);
      }
      return dispose;
    });
    dispose();
    expect(actual.outerHTML).toBe('<button></button>');
  });

  it('uses inherited prop getters and removes props that disappear from the prototype', () => {
    const actual = document.createElement('button');
    const expected = document.createElement('button');
    const [title, setTitle] = createSignal('first');
    const props = Object.create({
      get title() {
        return title();
      }
    }) as Props<HTMLButtonElement>;
    const dispose = createRoot((dispose) => {
      createPropsProxy(actual, props);
      return dispose;
    });
    flush();
    solidAssign(expected, props);
    expect(actual.outerHTML).toBe(expected.outerHTML);
    setTitle('second');
    flush();
    solidAssign(expected, props);
    expect(actual.outerHTML).toBe(expected.outerHTML);
    dispose();
    expect(actual.hasAttribute('title')).toBe(false);

    createRoot((dispose) => {
      const update = createSpread(actual);
      const previous = {};
      update(props);
      solidAssign(expected, props, true, previous);
      update({});
      solidAssign(expected, {}, true, previous);
      expect(actual.outerHTML).toBe(expected.outerHTML);
      dispose();
    });
  });

  it('preserves an own __proto__ prop when collecting a spread snapshot', () => {
    const actual = document.createElement('div');
    const expected = document.createElement('div');
    const props = { ['__proto__']: 'attribute-value' };
    const dispose = createRoot((dispose) => {
      createSpread(actual)(props as Props<HTMLDivElement>);
      solidAssign(expected, props);
      return dispose;
    });
    expect(actual.getAttribute('__proto__')).toBe(expected.getAttribute('__proto__'));
    dispose();
    expect(actual.hasAttribute('__proto__')).toBe(false);
  });

  it('matches string/object style transitions and in-place style mutations', () => {
    const actual = document.createElement('div');
    const expected = document.createElement('div');
    const inherited = { color: 'red', '--offset': '4px' };
    const style = Object.assign(Object.create(inherited), { transform: 'translateX(1px)' });
    const dispose = createRoot((dispose) => {
      const update = createSpread(actual);
      const previous = {};
      const apply = (value: Props<HTMLDivElement>['style']) => {
        update({ style: value });
        solidAssign(expected, { style: value }, true, previous);
        if (value === undefined) expect(actual.getAttribute('style')).toBeNull();
        expect(actual.style.cssText).toBe(expected.style.cssText);
      };
      apply('color: blue; opacity: 0.5');
      apply(style);
      style.transform = 'translateX(2px)';
      inherited.color = 'green';
      apply(style);
      apply({ color: 'purple' });
      apply('opacity: 1');
      apply(undefined);
      return dispose;
    });
    dispose();
    expect(actual.style.cssText).toBe('');
  });

  it('assigns stateful textarea properties and explicit DOM properties like client.ts', () => {
    const actual = document.createElement('textarea');
    const expected = document.createElement('textarea');
    const dispose = createRoot((dispose) => {
      const update = createSpread(actual);
      const previous = {};
      for (const props of [
        { value: 'first', defaultValue: 'default', 'prop:scrollTop': 12 },
        { value: undefined, defaultValue: undefined, 'prop:scrollTop': 0 }
      ]) {
        update(props);
        solidAssign(expected, props, true, previous);
        expect(actual.value).toBe(expected.value);
        expect(actual.defaultValue).toBe(expected.defaultValue);
        expect(actual.scrollTop).toBe(expected.scrollTop);
      }
      return dispose;
    });
    dispose();
  });

  it('reapplies select values after options are inserted', async () => {
    const actual = document.createElement('select');
    const expected = document.createElement('select');
    const dispose = createRoot((dispose) => {
      createSpread(actual)({ value: 'second' });
      solidAssign(expected, { value: 'second' });
      return dispose;
    });
    const markup = '<option value="first">First</option><option value="second">Second</option>';
    actual.innerHTML = markup;
    expected.innerHTML = markup;
    await Promise.resolve();
    // Inspect the browser's selected option, not the proxy's value getter.
    expect(actual.selectedIndex).toBe(1);
    expect(actual.selectedIndex).toBe(expected.selectedIndex);
    dispose();
  });
});
