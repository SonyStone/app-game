import { ChildProperties, DOMWithState, Namespaces, ref } from '@solidjs/web';
import { setAttributeNS } from './attribute-ns-patch';
import { setAttribute, setClassName, setProperty, setStyle } from './attribute-patch';
import { setSolidEvent } from './event-listener-patch';
import type { Cleanup } from './types';
import { noop, runCleanupUpdate, withCleanupUpdate } from './utils';

/**
 * Reversible counterpart of Solid 2 client.ts's private assignProp function.
 *
 * Keep dispatch order and property exceptions aligned with the installed runtime.
 * Each branch acquires a prop layer instead of performing an irreversible write.
 * Children and value diffing belong to the spread controller; refs use Solid directly.
 * @see https://github.com/solidjs/solid/blob/solid-js%402.0.0-rc.4/packages/web/src/client.ts
 */
export function assignDOMProp(element: Element, prop: string, value: unknown): Cleanup {
  if (prop === 'style') return setStyle(element, value);
  if (prop === 'class') return setClassName(element, value);
  if (prop === 'ref') {
    if (typeof value === 'function' || Array.isArray(value)) {
      ref(() => value as ReturnType<Parameters<typeof ref>[0]>, element);
    }
    return noop;
  }

  const hasNamespace = prop.includes(':');
  if (!hasNamespace && prop.startsWith('on')) {
    return setSolidEvent(element, prop.slice(2).toLowerCase(), value);
  }

  const forced = hasNamespace && prop.startsWith('prop:');
  if (forced || ChildProperties.has(prop) || DOMWithState[element.nodeName]?.[prop]) {
    return setDOMProperty(element, forced ? prop.slice(5) : prop, value);
  }

  const namespace = hasNamespace ? Namespaces[prop.split(':')[0] ?? ''] : undefined;
  return namespace ? setAttributeNS(element, namespace, prop, value) : setAttribute(element, prop, value);
}

/** Preserves client.ts's form-control writes while owning delayed select updates. */
function setDOMProperty(element: Element, name: string, value: unknown): Cleanup {
  const nodeName = element.nodeName;
  const normalize = (next: unknown) =>
    (name === 'value' || name === 'defaultValue') && (nodeName === 'INPUT' || nodeName === 'TEXTAREA')
      ? (next ?? '')
      : next;
  const cleanup = setProperty(element, name, normalize(value), true);
  let active = true;
  let revision = 0;
  const scheduleSelect = (next: unknown) => {
    if (name !== 'value' || nodeName !== 'SELECT') return;
    const scheduled = ++revision;
    queueMicrotask(() => {
      if (active && scheduled === revision) runCleanupUpdate(cleanup, next);
    });
  };
  scheduleSelect(value);
  return withCleanupUpdate(
    () => {
      active = false;
      cleanup();
    },
    (next) => {
      runCleanupUpdate(cleanup, normalize(next));
      scheduleSelect(next);
      return true;
    }
  );
}
