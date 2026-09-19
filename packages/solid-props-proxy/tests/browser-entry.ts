import { hydrate } from '@solidjs/web';
import { createRoot, flush } from 'solid-js';
import { createSpread } from '../src/index';
import { App, controls } from './hydration-app';

/** Exercises real SSR node reuse, renderer updates, delegated events, and early disposal. */
export async function checkHydration() {
  const container = document.getElementById('app')!;
  const button = document.getElementById('target') as HTMLButtonElement;
  const marker = document.getElementById('marker');
  const before = button.style.color;
  const dispose = hydrate(App, container);
  flush();
  await new Promise((resolve) => setTimeout(resolve, 0));
  const sameNodes = button === document.getElementById('target') && marker === document.getElementById('marker');
  const after = button.style.color;
  controls.setBase('green');
  flush();
  const covered = button.style.color;
  controls.setOverlay('blue');
  flush();
  const updated = button.style.color;
  button.click();
  controls.release();
  const restored = button.style.color;
  button.click();
  controls.setBase('purple');
  flush();
  const final = button.style.color;
  const calls = [...controls.calls];
  const methodsRestored = !Object.hasOwn(button.style, 'setProperty') && !Object.hasOwn(button.style, 'cssText');
  dispose();
  return { before, sameNodes, after, covered, updated, restored, final, calls, methodsRestored };
}

/** Checks CSS layering against the browser's shorthand/priority implementation. */
export function checkStyleLayers() {
  const element = document.createElement('div');
  element.style.cssText = 'margin: 1px !important; color: black';
  const a = createRoot((dispose) => {
    const update = createSpread(element);
    update({ style: 'margin: 10px !important; color: red' });
    return { dispose, update };
  });
  const b = createRoot((dispose) => {
    createSpread(element)({ style: { 'margin-left': '20px' } });
    return dispose;
  });
  a.update({ style: { margin: '15px', color: 'green' } });
  const updated = [element.style.marginTop, element.style.marginLeft];
  element.style.setProperty('color', 'blue', 'important');
  a.dispose();
  const lowerRemoved = [element.style.marginTop, element.style.marginLeft, element.style.color];
  b();
  return {
    updated,
    lowerRemoved,
    restored: [
      element.style.margin,
      element.style.getPropertyPriority('margin'),
      element.style.getPropertyPriority('color')
    ],
    methodsRestored: !Object.hasOwn(element.style, 'setProperty')
  };
}

/** Cancelling before the deferred hydration write must leave no proxy resources. */
export async function checkCancelledHydration() {
  const container = document.getElementById('app')!;
  const button = document.getElementById('target') as HTMLButtonElement;
  const dispose = hydrate(App, container);
  controls.release();
  flush();
  await new Promise((resolve) => setTimeout(resolve, 0));
  button.click();
  const result = {
    color: button.style.color,
    calls: [...controls.calls],
    methodsUntouched: !Object.hasOwn(button, 'setAttribute') && !Object.hasOwn(button.style, 'setProperty')
  };
  dispose();
  return result;
}

export { mountExamples } from './examples-entry';

/** Checks stateful properties across iframe realms and a custom element's public setter. */
export function checkForeignProperties() {
  const iframe = document.createElement('iframe');
  document.body.append(iframe);
  const input = iframe.contentDocument!.createElement('input');
  iframe.contentDocument!.body.append(input);
  input.value = 'base';
  input.className = 'base';
  const foreign = !(input instanceof Element);
  const a = createRoot((dispose) => {
    createSpread(input)({ value: 'lower', class: 'overlay' });
    return dispose;
  });
  const b = createRoot((dispose) => {
    createSpread(input)({ value: 'upper' });
    return dispose;
  });
  input.value = 'new base';
  input.className = 'new-base';
  const covered = [input.value, input.className];
  a();
  const lowerRemoved = input.value;
  b();
  const restored = [input.value, input.className, Object.hasOwn(input, 'value')];
  iframe.remove();

  class ReviewWidget extends HTMLElement {
    #readOnly = false;
    get readOnly() {
      return this.#readOnly;
    }
    set readOnly(value: boolean) {
      this.#readOnly = value;
      this.dataset.mode = value ? 'review' : 'edit';
    }
  }
  if (!customElements.get('props-proxy-review-test')) customElements.define('props-proxy-review-test', ReviewWidget);
  const widget = document.createElement('props-proxy-review-test') as ReviewWidget;
  widget.readOnly = false;
  const release = createRoot((dispose) => {
    createSpread(widget)({ 'prop:readOnly': true, style: { '--accent': 'orange' } });
    return dispose;
  });
  widget.readOnly = false;
  const widgetCovered = widget.dataset.mode;
  release();
  return {
    foreign,
    covered,
    lowerRemoved,
    restored,
    widgetCovered,
    widgetRestored: widget.dataset.mode,
    widgetStyleRestored: widget.style.getPropertyValue('--accent')
  };
}
