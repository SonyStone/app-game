// @vitest-environment jsdom

import { assign as solidAssign } from '@solidjs/web';
import { createRoot, createSignal, flush } from 'solid-js';
import { describe, expect, it } from 'vitest';
import { createSpread } from './spread';
import type { Props } from './types';

/** Gives each style layer an independent owner and updater. */
function layer(target: HTMLElement | SVGElement, style: Props<HTMLDivElement>['style']) {
  return createRoot((dispose) => {
    const update = createSpread(target);
    update({ style });
    return { dispose, update: (style: Props<HTMLDivElement>['style']) => update({ style }) };
  });
}

describe('shared style layers', () => {
  it.each(['lower first', 'upper first'])('restores the latest base with %s disposal', (order) => {
    const element = document.createElement('div');
    element.style.setProperty('transform', 'translateX(0px)');
    element.style.setProperty('color', 'red');
    const a = layer(element, { transform: 'translateX(10px)' });
    const b = layer(element, { transform: 'translateX(20px)' });
    a.update({ transform: 'translateX(15px)' });
    expect(element.style.transform).toBe('translateX(20px)');
    element.style.setProperty('transform', 'translateX(5px)');
    element.style.setProperty('color', 'green');
    expect(element.style.transform).toBe('translateX(20px)');
    expect(element.style.color).toBe('green');
    if (order === 'lower first') {
      a.dispose();
      expect(element.style.transform).toBe('translateX(20px)');
      b.dispose();
    } else {
      b.dispose();
      expect(element.style.transform).toBe('translateX(15px)');
      a.dispose();
    }
    expect(element.style.transform).toBe('translateX(5px)');
    expect(element.style.color).toBe('green');
  });

  it('keeps string/object transitions in their original layer position', () => {
    const element = document.createElement('div');
    element.style.cssText = 'color: black; opacity: 0.5';
    const a = layer(element, 'color: red; --offset: 2px');
    const b = layer(element, { color: 'blue' });
    a.update({ color: 'green', '--offset': '3px' });
    expect(element.style.color).toBe('blue');
    expect(element.style.opacity).toBe('0.5');
    a.update('color: purple');
    expect(element.style.getPropertyValue('--offset')).toBe('');
    expect(element.style.color).toBe('blue');
    b.dispose();
    expect(element.style.color).toBe('purple');
    a.dispose();
    expect(element.style.color).toBe('black');
  });

  it('distinguishes a missing declaration from an explicit undefined mask', () => {
    const element = document.createElement('div');
    element.style.color = 'black';
    const a = layer(element, { color: 'red' });
    const b = layer(element, { color: undefined });
    expect(element.style.color).toBe('');
    b.update({});
    expect(element.style.color).toBe('red');
    b.update(undefined);
    expect(element.style.color).toBe('red');
    b.dispose();
    a.dispose();
    expect(element.style.color).toBe('black');
  });

  it('replays shorthand and longhand declarations with their priorities', () => {
    const element = document.createElement('div');
    element.style.setProperty('margin', '1px', 'important');
    const a = layer(element, 'margin: 10px !important');
    const b = layer(element, { 'margin-left': '20px' });
    a.update('margin: 15px !important');
    expect(element.style.marginTop).toBe('15px');
    expect(element.style.marginLeft).toBe('20px');
    expect(element.style.getPropertyPriority('margin-left')).toBe('');
    a.dispose();
    expect(element.style.marginTop).toBe('1px');
    expect(element.style.marginLeft).toBe('20px');
    b.dispose();
    expect(element.style.margin).toBe('1px');
    expect(element.style.getPropertyPriority('margin')).toBe('important');
  });

  it('keeps renderer style updates below layers through all Solid write paths', () => {
    const element = document.createElement('div');
    const previous = {};
    solidAssign(element, { style: { color: 'black' } }, true, previous);
    const overlay = layer(element, { color: 'red' });
    solidAssign(element, { style: { color: 'blue', opacity: '0.5' } }, true, previous);
    expect(element.style.color).toBe('red');
    expect(element.style.opacity).toBe('0.5');
    solidAssign(element, { style: 'color: green; padding: 2px' }, true, previous);
    expect(element.style.color).toBe('red');
    expect(element.style.opacity).toBe('');
    expect(element.style.padding).toBe('2px');
    solidAssign(element, { style: { color: 'purple' } }, true, previous);
    expect(element.style.color).toBe('red');
    expect(element.style.padding).toBe('');
    overlay.dispose();
    expect(element.style.color).toBe('purple');
  });

  it('tracks cssText, attribute replacement, and removal as base mutations', () => {
    const element = document.createElement('div');
    const overlay = layer(element, { color: 'red' });
    element.style.cssText = 'color: green !important; opacity: 0.5';
    expect(element.style.color).toBe('red');
    expect(element.style.getPropertyPriority('color')).toBe('');
    expect(element.style.removeProperty('color')).toBe('green');
    expect(element.style.color).toBe('red');
    element.setAttribute('style', 'padding: 4px');
    expect(element.style.padding).toBe('4px');
    element.removeAttribute('style');
    expect(element.style.color).toBe('red');
    expect(element.style.padding).toBe('');
    overlay.dispose();
    expect(element.hasAttribute('style')).toBe(false);
  });

  it('restores exact native method descriptors after the final owner leaves', () => {
    const element = document.createElement('div');
    const style = element.style;
    const original = style.setProperty;
    Object.defineProperty(style, 'setProperty', { configurable: true, value: original, writable: true });
    const descriptors = Object.getOwnPropertyDescriptors(style);
    const a = layer(element, { color: 'red' });
    const b = layer(element, { color: 'blue' });
    a.dispose();
    expect(style.setProperty).not.toBe(original);
    b.dispose();
    for (const key of ['setProperty', 'removeProperty', 'cssText']) {
      expect(Object.getOwnPropertyDescriptor(style, key)).toEqual(descriptors[key]);
    }
    expect(element.style).toBe(style);
    style.setProperty('color', 'green');
    expect(style.color).toBe('green');
    b.dispose();
  });

  it('forwards borrowed CSSOM methods to their actual receiver', () => {
    const element = document.createElement('div');
    const other = document.createElement('div');
    const overlay = layer(element, { color: 'red' });
    element.style.setProperty.call(other.style, 'color', 'green', 'important');
    expect(other.style.color).toBe('green');
    expect(element.style.removeProperty.call(other.style, 'color')).toBe('green');
    expect(element.style.color).toBe('red');
    overlay.dispose();
  });

  it('moves one owner between targets without resurrecting it on the previous target', () => {
    const first = document.createElement('div');
    const second = document.createElement('div');
    const [target, setTarget] = createSignal(first);
    const a = createRoot((dispose) => {
      createSpread(target)({ style: { color: 'red' } });
      return dispose;
    });
    const b = layer(first, { color: 'blue' });
    setTarget(second);
    flush();
    expect(first.style.color).toBe('blue');
    expect(second.style.color).toBe('red');
    b.dispose();
    expect(first.hasAttribute('style')).toBe(false);
    a();
    expect(second.hasAttribute('style')).toBe(false);
  });

  it('shares the same declaration semantics on SVG targets', () => {
    const element = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    element.style.fill = 'black';
    const a = layer(element, { fill: 'red' });
    const b = layer(element, 'fill: blue !important');
    a.dispose();
    expect(element.style.fill).toBe('blue');
    expect(element.style.getPropertyPriority('fill')).toBe('important');
    b.dispose();
    expect(element.style.fill).toBe('black');
  });
});
