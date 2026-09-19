import { assign, registerElementClaim, render } from '@solidjs/web';
import { createRoot, createSignal, flush, getOwner } from 'solid-js';
import { describe, expect, expectTypeOf, it, vi } from 'vitest';
import { createPropsProxy, PropsProxy } from './component';
import { setEventListener } from './event-listener-patch';
import { createSpread } from './spread';
import type { Props } from './types';

/** Creates an independently disposable proxy with an imperative prop updater. */
function overlay<T extends object>(target: T, props: Props<T>) {
  let update!: ReturnType<typeof createSpread<T>>;
  const dispose = createRoot((dispose) => {
    update = createSpread(target);
    update(props);
    return dispose;
  });
  return { update, dispose };
}

describe('Solid 2 DOM assignment', () => {
  it('matches Solid boolean attribute handling and restores removed base values', () => {
    const actual = document.createElement('button');
    const expected = document.createElement('button');
    actual.setAttribute('disabled', 'original');
    const proxy = overlay(actual, { disabled: false });
    assign(expected, { disabled: false });
    expect(actual.hasAttribute('disabled')).toBe(expected.hasAttribute('disabled'));
    proxy.update({ disabled: true });
    assign(expected, { disabled: true });
    expect(actual.getAttribute('disabled')).toBe(expected.getAttribute('disabled'));
    proxy.dispose();
    expect(actual.getAttribute('disabled')).toBe('original');
  });

  it('defaults custom elements to attributes and reserves prop: for properties', () => {
    const actual = document.createElement('proxy-test');
    const expected = document.createElement('proxy-test');
    const data = { value: 42 };
    const props = { enabled: true, 'data-state': false, 'prop:model': data };
    const proxy = overlay(actual, props);
    assign(expected, props);
    expect(actual.outerHTML).toBe(expected.outerHTML);
    expect(Reflect.get(actual, 'model')).toBe(data);
    expect(Reflect.get(actual, 'enabled')).toBeUndefined();
    proxy.dispose();
    expect(actual.hasAttribute('enabled')).toBe(false);
    expect(Object.hasOwn(actual, 'model')).toBe(false);
  });

  it('applies namespace booleans on SVG and HTML targets', () => {
    for (const target of [
      document.createElement('div'),
      document.createElementNS('http://www.w3.org/2000/svg', 'use')
    ]) {
      const namespace = 'http://www.w3.org/1999/xlink';
      target.setAttributeNS(namespace, 'xlink:href', '#base');
      const proxy = overlay(target, { 'xlink:href': false });
      expect(target.hasAttributeNS(namespace, 'href')).toBe(false);
      proxy.update({ 'xlink:href': true });
      expect(target.getAttributeNS(namespace, 'href')).toBe('');
      proxy.dispose();
      expect(target.getAttributeNS(namespace, 'href')).toBe('#base');
    }
  });

  it('normalizes nullable input values on both initial assignment and updates', () => {
    const input = document.createElement('input');
    input.value = 'base';
    // JavaScript callers can supply null even though JSX's value type excludes it.
    const proxy = overlay(input, { value: null } as unknown as Props<HTMLInputElement>);
    expect(input.value).toBe('');
    proxy.update({ value: 'next' });
    expect(input.value).toBe('next');
    proxy.update({ value: undefined });
    expect(input.value).toBe('');
    proxy.dispose();
    expect(input.value).toBe('base');
  });

  it('supports nested ref arrays and invokes callbacks without an owner', () => {
    const input = document.createElement('input');
    const calls: string[] = [];
    const first = vi.fn((element: HTMLInputElement) => {
      expect(element).toBe(input);
      expect(getOwner()).toBeNull();
      calls.push('first');
    });
    const second = vi.fn(() => calls.push('second'));
    const proxy = overlay(input, { ref: [first, [undefined, second]] });
    expect(calls).toEqual(['first', 'second']);
    proxy.dispose();
  });

  it('tracks nested class and style getters even when their objects keep their identity', () => {
    const button = document.createElement('button');
    const [enabled, setEnabled] = createSignal(false);
    const [offset, setOffset] = createSignal(1);
    const props = {
      class: {
        get active() {
          return enabled();
        }
      },
      style: {
        get transform() {
          return `translateX(${offset()}px)`;
        }
      }
    };
    const dispose = createRoot((dispose) => {
      createPropsProxy(button, props);
      return dispose;
    });
    flush();
    expect(button.classList.contains('active')).toBe(false);
    setEnabled(true);
    setOffset(2);
    flush();
    expect(button.classList.contains('active')).toBe(true);
    expect(button.style.transform).toBe('translateX(2px)');
    dispose();
    expect(button.className).toBe('');
    expect(button.style.transform).toBe('');
  });

  it('ignores boolean class values', () => {
    const button = document.createElement('button');
    const proxy = overlay(button, { class: [false, true, 'active', [null, undefined]] });
    expect(button.className).toBe('active');
    proxy.dispose();
  });

  it('keeps proxy classes through actual Solid string and object class updates', () => {
    const host = document.createElement('div');
    const [base, setBase] = createSignal<string | Record<string, boolean>>('base');
    const disposeRender = render(() => <button class={base()} />, host);
    const button = host.querySelector('button')!;
    const proxy = overlay(button, { class: 'proxy' });
    setBase('next');
    flush();
    expect(button.className).toBe('next proxy');
    setBase({ next: false, selected: true });
    flush();
    expect(button.className).toBe('selected proxy');
    proxy.dispose();
    expect(button.className).toBe('selected');
    disposeRender();
  });

  it('cancels delayed select writes when the proxy is disposed', async () => {
    const select = document.createElement('select');
    select.innerHTML = '<option value="base">Base</option><option value="proxy">Proxy</option>';
    select.value = 'base';
    const proxy = overlay(select, { value: 'proxy' });
    proxy.dispose();
    await Promise.resolve();
    expect(select.value).toBe('base');
  });
});

describe('Solid 2 lifecycle and events', () => {
  it('tracks props while target is absent and follows replaced/unset targets', () => {
    const first = document.createElement('input');
    const second = document.createElement('input');
    first.value = 'first';
    second.value = 'second';
    const [target, setTarget] = createSignal<HTMLInputElement | null>(null);
    const [value, setValue] = createSignal('initial');
    const dispose = createRoot((dispose) => {
      createPropsProxy(target, {
        get value() {
          return value();
        }
      });
      return dispose;
    });
    flush();
    setValue('latest');
    flush();
    setTarget(first);
    flush();
    expect(first.value).toBe('latest');
    setValue('updated');
    flush();
    expect(first.value).toBe('updated');
    setTarget(second);
    flush();
    expect(first.value).toBe('first');
    expect(second.value).toBe('updated');
    setTarget(null);
    flush();
    expect(second.value).toBe('second');
    dispose();
  });

  it('ignores updater calls after owner disposal', () => {
    const input = document.createElement('input');
    const proxy = overlay(input, { value: 'proxy' });
    proxy.dispose();
    proxy.update({ value: 'late' });
    expect(input.value).toBe('');
  });

  it('dispatches real clicks through the render root once and follows base handler updates', () => {
    const host = document.createElement('div');
    const calls: string[] = [];
    const [version, setVersion] = createSignal(1);
    const props = {
      get onClick() {
        return version() === 1 ? () => calls.push('base1') : () => calls.push('base2');
      }
    };
    const disposeRender = render(
      () => (
        <div onClick={() => calls.push('parent')}>
          <button {...props} />
        </div>
      ),
      host
    );
    const button = host.querySelector('button')!;
    const proxy = overlay(button, { onClick: () => calls.push('proxy') });
    button.click();
    expect(calls).toEqual(['base1', 'proxy', 'parent']);
    calls.length = 0;
    setVersion(2);
    flush();
    button.click();
    expect(calls).toEqual(['base2', 'proxy', 'parent']);
    proxy.dispose();
    calls.length = 0;
    button.click();
    expect(calls).toEqual(['base2', 'parent']);
    disposeRender();
  });

  it('keeps delegated layer order when a lower handler updates or disposes first', () => {
    const host = document.createElement('div');
    const calls: string[] = [];
    const disposeRender = render(() => <button onClick={() => calls.push('base')} />, host);
    const button = host.querySelector('button')!;
    const first = overlay(button, { onClick: () => calls.push('first') });
    const second = overlay(button, { onClick: () => calls.push('second') });
    first.update({ onClick: () => calls.push('updated') });
    button.click();
    expect(calls).toEqual(['base', 'updated', 'second']);
    first.dispose();
    calls.length = 0;
    button.click();
    expect(calls).toEqual(['base', 'second']);
    second.dispose();
    calls.length = 0;
    button.click();
    expect(calls).toEqual(['base']);
    disposeRender();
  });

  it('supports external targets without a render root and releases local delegation', () => {
    const button = document.createElement('button');
    const click = vi.fn();
    const proxy = overlay(button, { onClick: click });
    button.click();
    expect(click).toHaveBeenCalledTimes(1);
    proxy.dispose();
    button.click();
    expect(click).toHaveBeenCalledTimes(1);
    expect(Object.hasOwn(button, '$$click')).toBe(false);
    expect(Object.hasOwn(button, '$$clickData')).toBe(false);
  });

  it('composes handlers within a shadow render root', () => {
    const shadow = document.createElement('div').attachShadow({ mode: 'open' });
    const base = vi.fn();
    const proxyClick = vi.fn();
    const disposeRender = render(() => <button onClick={base} />, shadow);
    const button = shadow.querySelector('button')!;
    const proxy = overlay(button, { onClick: proxyClick });
    button.click();
    expect(base).toHaveBeenCalledTimes(1);
    expect(proxyClick).toHaveBeenCalledTimes(1);
    proxy.dispose();
    disposeRender();
  });

  it('passes tuple data and currentTarget through the actual delegated dispatcher', () => {
    const host = document.createElement('div');
    const base = vi.fn();
    const handler = vi.fn();
    const disposeRender = render(() => <button onClick={[base, 'base']} />, host);
    const button = host.querySelector('button')!;
    const data = { id: 1 };
    const proxy = overlay(button, { onClick: [handler, data] });
    button.click();
    expect(base).toHaveBeenCalledWith('base', expect.objectContaining({ currentTarget: button }));
    expect(handler).toHaveBeenCalledWith(data, expect.objectContaining({ currentTarget: button }));
    proxy.dispose();
    disposeRender();
  });

  it('updates JSX proxy handlers and removes them with the component owner', () => {
    const host = document.createElement('div');
    const button = document.createElement('button');
    const first = vi.fn();
    const second = vi.fn();
    const [version, setVersion] = createSignal(1);
    const dispose = render(() => <PropsProxy target={button} onClick={version() === 1 ? first : second} />, host);
    button.click();
    setVersion(2);
    flush();
    button.click();
    expect(first).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenCalledTimes(1);
    dispose();
    button.click();
    expect(second).toHaveBeenCalledTimes(1);
  });
});

/** Removed JSX spellings must not leak through the proxy's extension types. */
it('uses Solid 2 prop names and element event types', () => {
  type Removed = 'on:click' | 'oncapture:click' | 'attr:title' | 'bool:disabled' | 'className' | 'classList';
  expectTypeOf<Extract<keyof Props<HTMLButtonElement>, Removed>>().toEqualTypeOf<never>();
  expectTypeOf<Extract<keyof Props<SVGElement>, Removed>>().toEqualTypeOf<never>();
  const props = {
    onClick(event) {
      expectTypeOf(event.currentTarget).toExtend<HTMLButtonElement>();
    }
  } satisfies Props<HTMLButtonElement>;
  expectTypeOf(props).toExtend<Props<HTMLButtonElement>>();
});

it('notifies Solid element claims when href is applied, updated, and restored', () => {
  const link = document.createElement('a');
  link.setAttribute('href', '/base');
  const values: (string | null)[] = [];
  const unregister = registerElementClaim((element) => {
    if (element === link) values.push(element.getAttribute('href'));
  });
  try {
    const proxy = overlay(link, { href: '/proxy' });
    proxy.update({ href: '/next' });
    proxy.dispose();
    expect(values).toEqual(['/proxy', '/next', '/base']);
  } finally {
    unregister();
  }
});

it('preserves native capture, once, abort and explicit cleanup options', () => {
  const parent = document.createElement('div');
  const button = document.createElement('button');
  parent.append(button);
  const capture = vi.fn((event: Event) => {
    expect(event.eventPhase).toBe(Event.CAPTURING_PHASE);
  });
  const controller = new AbortController();
  const cleanup = setEventListener(
    parent,
    'click',
    { handleEvent: capture, once: true, signal: controller.signal },
    true
  );
  button.click();
  button.click();
  expect(capture).toHaveBeenCalledTimes(1);
  cleanup();
  const aborted = vi.fn();
  const dispose = setEventListener(button, 'click', { handleEvent: aborted, signal: controller.signal }, false);
  controller.abort();
  button.click();
  expect(aborted).not.toHaveBeenCalled();
  dispose();
});
