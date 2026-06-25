// @vitest-environment happy-dom

import { createEffect, createRoot, createSignal, type Setter } from 'solid-js';
import { render } from 'solid-js/web';
import { describe, expect, it, vi } from 'vitest';
import { getAttributeNSPatch } from './attribute-ns-patch';
import { getAttributePatch } from './attribute-patch';
import { PropsProxy } from './component';
import { getEventListenerPatch } from './event-listener-patch';
import { createSpread as createSpreadController } from './spread';
import type { Cleanup, Props } from './types';

/** Applies one prop bag inside a Solid root and returns the root disposer. */
function applySpread<T extends object>(target: T, props: Props<T>): Cleanup {
  return createRoot((dispose) => {
    const spread = createSpreadController(() => target);

    spread(props);
    return dispose;
  });
}

describe('createSpread', () => {
  it('restores element props on cleanup', () => {
    const button = document.createElement('button');
    button.className = 'original';
    button.style.setProperty('transform', 'translateX(1px)');
    button.style.setProperty('color', 'red');
    button.setAttribute('aria-description', 'Original');

    const cleanup = applySpread(button, {
      class: 'proxy',
      style: { transform: 'translateX(10px)' },
      'aria-description': 'Proxy'
    });

    expect(button.className).toBe('original proxy');
    expect(button.style.getPropertyValue('transform')).toBe('translateX(10px)');
    expect(button.style.getPropertyValue('color')).toBe('red');
    expect(button.getAttribute('aria-description')).toBe('Proxy');

    cleanup();

    expect(button.className).toBe('original');
    expect(button.style.getPropertyValue('transform')).toBe('translateX(1px)');
    expect(button.style.getPropertyValue('color')).toBe('red');
    expect(button.getAttribute('aria-description')).toBe('Original');
  });

  it('applies element refs by default', () => {
    const button = document.createElement('button');
    const ref = vi.fn();

    const cleanup = applySpread(button, { ref });

    expect(ref).toHaveBeenCalledTimes(1);
    expect(ref).toHaveBeenCalledWith(button);

    cleanup();
  });

  it('applies object refs by default', () => {
    const target: { ref?: (target: object) => void } = {};
    const ref = vi.fn();

    const cleanup = applySpread(target, { ref });

    expect(ref).toHaveBeenCalledTimes(1);
    expect(ref).toHaveBeenCalledWith(target);

    cleanup();
  });

  it('detects SVG targets and applies namespaced attributes', () => {
    const xlinkNamespace = 'http://www.w3.org/1999/xlink';
    const use = document.createElementNS('http://www.w3.org/2000/svg', 'use');

    use.setAttributeNS(xlinkNamespace, 'href', '#original');

    const cleanup = applySpread(use, {
      'xlink:href': '#proxy'
    });

    expect(use.getAttributeNS(xlinkNamespace, 'href')).toBe('#proxy');

    cleanup();

    expect(use.getAttributeNS(xlinkNamespace, 'href')).toBe('#original');
  });

  it('does not overwrite changes made after props are applied', () => {
    const button = document.createElement('button');
    button.className = 'original';

    const cleanup = applySpread(button, {
      class: 'proxy'
    });

    button.className = 'external';
    expect(button.className).toBe('external proxy');

    cleanup();

    expect(button.className).toBe('external');
  });

  it('combines className layers in stack order', () => {
    const button = document.createElement('button');
    button.className = 'base';

    const cleanupFirst = applySpread(button, {
      class: 'first'
    });
    const cleanupSecond = applySpread(button, {
      className: 'second'
    });

    expect(button.className).toBe('base first second');

    cleanupSecond();

    expect(button.className).toBe('base first');

    cleanupFirst();

    expect(button.className).toBe('base');
  });

  it('combines classList with the current class attribute', () => {
    const button = document.createElement('button');
    button.className = 'base muted';

    const cleanup = applySpread(button, {
      classList: {
        active: true,
        muted: false
      }
    });

    expect(button.className).toBe('base active');

    button.className = 'external muted';

    expect(button.className).toBe('external active');

    cleanup();

    expect(button.className).toBe('external muted');
  });

  it('keeps element properties overlaid while mounted and restores the latest base value on cleanup', () => {
    const input = document.createElement('input');
    const hadOwnValue = Object.prototype.hasOwnProperty.call(input, 'value');
    const originalValueDescriptor = Object.getOwnPropertyDescriptor(input, 'value');

    input.value = 'original';

    const cleanup = applySpread(input, {
      value: 'proxy'
    });

    expect(input.value).toBe('proxy');

    input.value = 'external update';

    expect(input.value).toBe('proxy');

    cleanup();

    expect(input.value).toBe('external update');
    expect(Object.prototype.hasOwnProperty.call(input, 'value')).toBe(hadOwnValue);
    expect(Object.getOwnPropertyDescriptor(input, 'value')).toEqual(originalValueDescriptor);
  });

  it('restores nested element property layers in stack order', () => {
    const input = document.createElement('input');
    input.value = 'original';

    const cleanupFirst = applySpread(input, {
      value: 'first proxy'
    });
    const cleanupSecond = applySpread(input, {
      value: 'second proxy'
    });

    input.value = 'external update';

    expect(input.value).toBe('second proxy');

    cleanupSecond();

    expect(input.value).toBe('first proxy');

    cleanupFirst();

    expect(input.value).toBe('external update');
  });

  it('records attributes set after the proxy and restores the latest base value on cleanup', () => {
    const button = document.createElement('button');
    const originalSetAttribute = button.setAttribute;
    const originalRemoveAttribute = button.removeAttribute;
    const originalSetAttributeNS = button.setAttributeNS;
    const originalRemoveAttributeNS = button.removeAttributeNS;
    const originalAddEventListener = button.addEventListener;
    const originalRemoveEventListener = button.removeEventListener;

    button.setAttribute('aria-description', 'Original');

    const cleanup = applySpread(button, {
      'aria-description': 'Proxy'
    });

    expect(button.setAttribute).not.toBe(originalSetAttribute);
    expect(button.removeAttribute).not.toBe(originalRemoveAttribute);
    expect(button.setAttributeNS).toBe(originalSetAttributeNS);
    expect(button.removeAttributeNS).toBe(originalRemoveAttributeNS);
    expect(button.addEventListener).toBe(originalAddEventListener);
    expect(button.removeEventListener).toBe(originalRemoveEventListener);

    button.setAttribute('aria-description', 'External');

    expect(button.getAttribute('aria-description')).toBe('Proxy');

    cleanup();

    expect(button.getAttribute('aria-description')).toBe('External');
    expect(button.setAttribute).toBe(originalSetAttribute);
    expect(button.removeAttribute).toBe(originalRemoveAttribute);
  });

  it('locks plain attributes through the standalone attribute patch', () => {
    const button = document.createElement('button');
    const originalSetAttribute = button.setAttribute;
    const originalRemoveAttribute = button.removeAttribute;
    const originalSetAttributeNS = button.setAttributeNS;
    const originalRemoveAttributeNS = button.removeAttributeNS;
    const originalAddEventListener = button.addEventListener;
    const originalRemoveEventListener = button.removeEventListener;

    button.setAttribute('aria-description', 'Original');

    const attributePatch = getAttributePatch(button);
    const cleanup = attributePatch.lock('aria-description', 'Proxy');

    expect(button.setAttribute).not.toBe(originalSetAttribute);
    expect(button.removeAttribute).not.toBe(originalRemoveAttribute);
    expect(button.setAttributeNS).toBe(originalSetAttributeNS);
    expect(button.removeAttributeNS).toBe(originalRemoveAttributeNS);
    expect(button.addEventListener).toBe(originalAddEventListener);
    expect(button.removeEventListener).toBe(originalRemoveEventListener);

    button.setAttribute('aria-description', 'External');

    expect(button.getAttribute('aria-description')).toBe('Proxy');

    cleanup();

    expect(button.getAttribute('aria-description')).toBe('External');
    expect(button.setAttribute).toBe(originalSetAttribute);
    expect(button.removeAttribute).toBe(originalRemoveAttribute);
  });

  it('does not patch event methods until the event listener patch is locked', () => {
    const button = document.createElement('button');
    const originalSetAttribute = button.setAttribute;
    const originalRemoveAttribute = button.removeAttribute;
    const originalSetAttributeNS = button.setAttributeNS;
    const originalRemoveAttributeNS = button.removeAttributeNS;
    const originalAddEventListener = button.addEventListener;
    const originalRemoveEventListener = button.removeEventListener;

    const eventPatch = getEventListenerPatch(button);

    expect(button.setAttribute).toBe(originalSetAttribute);
    expect(button.removeAttribute).toBe(originalRemoveAttribute);
    expect(button.setAttributeNS).toBe(originalSetAttributeNS);
    expect(button.removeAttributeNS).toBe(originalRemoveAttributeNS);
    expect(button.addEventListener).toBe(originalAddEventListener);
    expect(button.removeEventListener).toBe(originalRemoveEventListener);

    const cleanup = eventPatch.lock('pointerdown', false);

    expect(button.setAttribute).toBe(originalSetAttribute);
    expect(button.removeAttribute).toBe(originalRemoveAttribute);
    expect(button.setAttributeNS).toBe(originalSetAttributeNS);
    expect(button.removeAttributeNS).toBe(originalRemoveAttributeNS);
    expect(button.addEventListener).not.toBe(originalAddEventListener);
    expect(button.removeEventListener).not.toBe(originalRemoveEventListener);

    cleanup();

    expect(button.addEventListener).toBe(originalAddEventListener);
    expect(button.removeEventListener).toBe(originalRemoveEventListener);
  });

  it('patches only namespaced attribute methods for namespaced attribute locks', () => {
    const xlinkNamespace = 'http://www.w3.org/1999/xlink';
    const use = document.createElementNS('http://www.w3.org/2000/svg', 'use');
    const originalSetAttribute = use.setAttribute;
    const originalRemoveAttribute = use.removeAttribute;
    const originalSetAttributeNS = use.setAttributeNS;
    const originalRemoveAttributeNS = use.removeAttributeNS;
    const originalAddEventListener = use.addEventListener;
    const originalRemoveEventListener = use.removeEventListener;

    use.setAttributeNS(xlinkNamespace, 'href', '#original');

    const attributeNSPatch = getAttributeNSPatch(use);
    const cleanup = attributeNSPatch.lock(xlinkNamespace, 'href', '#proxy');

    expect(use.setAttribute).toBe(originalSetAttribute);
    expect(use.removeAttribute).toBe(originalRemoveAttribute);
    expect(use.setAttributeNS).not.toBe(originalSetAttributeNS);
    expect(use.removeAttributeNS).not.toBe(originalRemoveAttributeNS);
    expect(use.addEventListener).toBe(originalAddEventListener);
    expect(use.removeEventListener).toBe(originalRemoveEventListener);

    use.setAttributeNS(xlinkNamespace, 'href', '#external');

    expect(use.getAttributeNS(xlinkNamespace, 'href')).toBe('#proxy');

    cleanup();

    expect(use.getAttributeNS(xlinkNamespace, 'href')).toBe('#external');
    expect(use.setAttributeNS).toBe(originalSetAttributeNS);
    expect(use.removeAttributeNS).toBe(originalRemoveAttributeNS);
  });

  it('queues listeners through the standalone event listener patch', () => {
    const button = document.createElement('button');
    const originalAddEventListener = button.addEventListener;
    const originalRemoveEventListener = button.removeEventListener;
    const externalClick = vi.fn();

    const eventPatch = getEventListenerPatch(button);
    const cleanup = eventPatch.lock('click', false);

    expect(button.addEventListener).not.toBe(originalAddEventListener);
    expect(button.removeEventListener).not.toBe(originalRemoveEventListener);

    button.addEventListener('click', externalClick);
    button.click();

    expect(externalClick).not.toHaveBeenCalled();

    cleanup();
    button.click();

    expect(externalClick).toHaveBeenCalledTimes(1);
    expect(button.addEventListener).toBe(originalAddEventListener);
    expect(button.removeEventListener).toBe(originalRemoveEventListener);
  });

  it('records attribute removals and restores the removal on cleanup', () => {
    const button = document.createElement('button');
    button.setAttribute('aria-description', 'Original');

    const cleanup = applySpread(button, {
      'aria-description': 'Proxy'
    });

    button.removeAttribute('aria-description');

    expect(button.getAttribute('aria-description')).toBe('Proxy');

    cleanup();

    expect(button.getAttribute('aria-description')).toBeNull();
  });

  it('removes temporary object props on cleanup', () => {
    const target: { role?: string } = {};

    const cleanup = applySpread(target, {
      role: 'button'
    });

    expect(target.role).toBe('button');

    cleanup();

    expect('role' in target).toBe(false);
  });

  it('always skips children props', () => {
    const target: { children?: string; role?: string } = { children: 'original' };

    const cleanup = applySpread(target, {
      children: 'proxy',
      role: 'button'
    });

    expect(target.children).toBe('original');
    expect(target.role).toBe('button');

    cleanup();

    expect(target.children).toBe('original');
    expect('role' in target).toBe(false);
  });

  it('removes event listeners on cleanup', () => {
    const button = document.createElement('button');
    const onClick = vi.fn();

    const cleanup = applySpread(button, {
      'on:click': onClick
    });

    button.click();
    cleanup();
    button.click();

    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('queues event listeners added while overlaid and restores event methods on cleanup', () => {
    const button = document.createElement('button');
    const originalAddEventListener = button.addEventListener;
    const originalRemoveEventListener = button.removeEventListener;
    const proxyClick = vi.fn();
    const externalClick = vi.fn();

    const cleanup = applySpread(button, {
      'on:click': proxyClick
    });

    button.addEventListener('click', externalClick);
    button.click();

    expect(proxyClick).toHaveBeenCalledTimes(1);
    expect(externalClick).not.toHaveBeenCalled();

    cleanup();
    button.click();

    expect(proxyClick).toHaveBeenCalledTimes(1);
    expect(externalClick).toHaveBeenCalledTimes(1);
    expect(button.addEventListener).toBe(originalAddEventListener);
    expect(button.removeEventListener).toBe(originalRemoveEventListener);
  });

  it('composes delegated onClick handlers and restores the original one on cleanup', () => {
    const button = document.createElement('button');
    const originalClick = vi.fn();
    const proxyClick = vi.fn();
    const buttonRecord = button as unknown as Record<string, unknown>;
    buttonRecord.$$click = originalClick;

    const cleanup = applySpread(button, {
      onClick: proxyClick
    });

    dispatchSolidDelegatedEvent(button, 'click');
    cleanup();
    dispatchSolidDelegatedEvent(button, 'click');

    expect(originalClick).toHaveBeenCalledTimes(2);
    expect(proxyClick).toHaveBeenCalledTimes(1);
    expect(buttonRecord.$$click).toBe(originalClick);
    expect('$$clickData' in buttonRecord).toBe(false);
  });

  it('composes delegated onClick tuple handlers with their own data', () => {
    const button = document.createElement('button');
    const originalClick = vi.fn();
    const proxyClick = vi.fn();
    const buttonRecord = button as unknown as Record<string, unknown>;
    buttonRecord.$$click = originalClick;
    buttonRecord.$$clickData = 'original-data';

    const cleanup = applySpread(button, {
      onClick: [proxyClick, 'proxy-data']
    });

    dispatchSolidDelegatedEvent(button, 'click');
    cleanup();
    dispatchSolidDelegatedEvent(button, 'click');

    expect(originalClick).toHaveBeenNthCalledWith(1, 'original-data', expect.any(MouseEvent));
    expect(originalClick).toHaveBeenNthCalledWith(2, 'original-data', expect.any(MouseEvent));
    expect(proxyClick).toHaveBeenCalledTimes(1);
    expect(proxyClick).toHaveBeenCalledWith('proxy-data', expect.any(MouseEvent));
    expect(buttonRecord.$$click).toBe(originalClick);
    expect(buttonRecord.$$clickData).toBe('original-data');
  });

  it('updates class layers without changing class/classList order', () => {
    const button = document.createElement('button');
    const classList = { active: false };
    button.className = 'base';

    createRoot((dispose) => {
      const spread = createSpreadController(() => button);

      spread({
        class: 'active muted',
        classList
      });

      expect(button.className).toBe('base muted');

      spread({
        class: 'active selected',
        classList
      });

      expect(button.className).toBe('base selected');

      dispose();
    });

    expect(button.className).toBe('base');
  });

  it('tracks prop reads from the createSpread updater', async () => {
    const input = document.createElement('input');
    let setValue!: Setter<string>;

    const dispose = createRoot((dispose) => {
      const [value, nextValue] = createSignal('proxy');
      const spread = createSpreadController(() => input);
      setValue = nextValue;

      createEffect(() => {
        spread({ value: value() });
      });

      return dispose;
    });

    await Promise.resolve();

    expect(input.value).toBe('proxy');

    setValue('next proxy');
    await Promise.resolve();

    expect(input.value).toBe('next proxy');

    dispose();

    expect(input.value).toBe('');
  });
});

/** Dispatches a Solid delegated event by invoking the element handler slot directly. */
function dispatchSolidDelegatedEvent(element: Element, name: string): void {
  const elementRecord = element as unknown as Record<string, unknown>;
  const handler = elementRecord[`$$${name}`];
  const data = elementRecord[`$$${name}Data`];
  const event = new MouseEvent(name, { bubbles: true });

  if (typeof handler !== 'function') {
    return;
  }

  if (data === undefined) {
    (handler as (event: Event) => void).call(element, event);
    return;
  }

  (handler as (data: unknown, event: Event) => void).call(element, data, event);
}

describe('moving props between targets', () => {
  it('restores the old target before applying to the new target', async () => {
    const first = document.createElement('button');
    const second = document.createElement('button');
    first.className = 'first';
    second.className = 'second';
    let setTarget!: Setter<HTMLButtonElement>;

    const dispose = createRoot((dispose) => {
      const [target, nextTarget] = createSignal(first);
      const spread = createSpreadController(target);
      setTarget = nextTarget;

      spread({ class: 'proxy' });
      return dispose;
    });

    await Promise.resolve();
    expect(first.className).toBe('first proxy');
    expect(second.className).toBe('second');

    setTarget(second);
    await Promise.resolve();

    expect(first.className).toBe('first');
    expect(second.className).toBe('second proxy');

    dispose();

    expect(first.className).toBe('first');
    expect(second.className).toBe('second');
  });
});

describe('PropsProxy', () => {
  it('applies after Solid render props and reacts to proxy prop changes', async () => {
    const host = document.createElement('div');
    const calls: string[] = [];
    const baseClick = vi.fn(() => calls.push('base'));
    const proxyClick = vi.fn(() => calls.push('proxy'));
    let setProxyValue!: Setter<string>;

    const dispose = render(() => {
      const [target, setTarget] = createSignal<HTMLInputElement | null>(null);
      const [proxyValue, nextProxyValue] = createSignal('proxy');
      setProxyValue = nextProxyValue;

      return (
        <>
          <input ref={setTarget} value="base" onClick={baseClick} />
          <PropsProxy
            target={target()}
            {...({ value: proxyValue(), onClick: proxyClick } satisfies Props<HTMLInputElement>)}
          />
        </>
      );
    }, host);

    await Promise.resolve();

    const input = host.querySelector('input');
    expect(input?.value).toBe('proxy');

    if (!input) {
      dispose();
      return;
    }

    dispatchSolidDelegatedEvent(input, 'click');

    expect(calls).toEqual(['base', 'proxy']);
    expect(baseClick).toHaveBeenCalledTimes(1);
    expect(proxyClick).toHaveBeenCalledTimes(1);

    setProxyValue('next proxy');
    await Promise.resolve();

    expect(input.value).toBe('next proxy');

    dispose();

    expect(input.value).toBe('base');
  });

  it('keeps unchanged native event locks while another prop changes', async () => {
    const host = document.createElement('div');
    const proxyClick = vi.fn();
    const externalClick = vi.fn();
    let setProxyValue!: Setter<string>;

    const dispose = render(() => {
      const [target, setTarget] = createSignal<HTMLInputElement | null>(null);
      const [proxyValue, nextProxyValue] = createSignal('proxy');
      setProxyValue = nextProxyValue;

      return (
        <>
          <input ref={setTarget} value="base" />
          <PropsProxy
            target={target()}
            {...({ value: proxyValue(), 'on:click': proxyClick } satisfies Props<HTMLInputElement>)}
          />
        </>
      );
    }, host);

    await Promise.resolve();

    const input = host.querySelector('input');

    if (!input) {
      dispose();
      return;
    }

    input.addEventListener('click', externalClick);

    setProxyValue('next proxy');
    await Promise.resolve();

    input.click();

    expect(input.value).toBe('next proxy');
    expect(proxyClick).toHaveBeenCalledTimes(1);
    expect(externalClick).not.toHaveBeenCalled();

    dispose();
    input.click();

    expect(proxyClick).toHaveBeenCalledTimes(1);
    expect(externalClick).toHaveBeenCalledTimes(1);
  });
});
