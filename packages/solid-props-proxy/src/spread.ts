import type { MaybeAccessor } from '@solid-primitives/utils';
import { access } from '@solid-primitives/utils';
import { createEffect, createMemo, onCleanup, untrack } from 'solid-js';
import { Aliases, ChildProperties, getPropAlias, Properties, SVGNamespace } from 'solid-js/web';
import { setAttributeNS } from './attribute-ns-patch';
import { setAttribute, setBoolAttribute, setClassList, setClassName, setProperty, setStyle } from './attribute-patch';
import { setEventListener, setSolidEvent } from './event-listener-patch';
import type { Cleanup, Props } from './types';
import { cleanupAll, isEqual, noop, readProps, runCleanupUpdate, toPropertyName } from './utils';

/** Applied prop state tracked so updates can diff and restore in reverse order. */
type AppliedProp = {
  /** Last value applied for the prop key. */
  value: unknown;
  /** Cleanup that removes or updates the applied prop layer. */
  cleanup: Cleanup;
};

/**
 * Creates a Solid-aware spread function for an existing target.
 *
 * The returned function applies props using DOM-expression-style assignment, tracks
 * the current target accessor, and restores prior values when props or targets change.
 */
export function createSpread<T extends object>(
  target: MaybeAccessor<T | null | undefined>
): (props: Props<T>) => void {
  let currentTarget: T | undefined;
  let latestProps: Props<T> | undefined;
  const applied = new Map<string, AppliedProp>();

  const disposeCurrent = () => {
    const cleanup = cleanupAll(Array.from(applied.values(), ({ cleanup }) => cleanup));

    cleanup();
    applied.clear();
    currentTarget = undefined;
  };

  const ensureCurrent = createMemo(() => {
    const nextTarget = access(target);

    if (!nextTarget) {
      disposeCurrent();
      return undefined;
    }

    if (currentTarget !== nextTarget) {
      disposeCurrent();
      currentTarget = nextTarget;
    }

    return currentTarget;
  });

  onCleanup(disposeCurrent);

  createEffect(() => {
    const currentTarget = ensureCurrent();

    if (currentTarget && latestProps) {
      const props = latestProps;

      untrack(() => assign(currentTarget, props, applied));
    }
  });

  return (props: Props<T>) => {
    const nextProps = props ?? {};

    latestProps = nextProps;
    const currentTarget = untrack(ensureCurrent);

    if (currentTarget) {
      assign(currentTarget, nextProps, applied);
    }
  };
}

/**
 * Synchronizes a prop bag onto a target and disposes props that disappeared.
 *
 * This mirrors dom-expressions' assign step while keeping cleanup state for
 * reversible overlays on existing DOM nodes or plain objects.
 */
function assign<T extends object>(
  target: T,
  props: Props<T>,
  applied: Map<string, AppliedProp>
): void {
  const entries = readProps(props);
  const nextKeys = new Set(Object.keys(entries));
  const syncProp = (prop: string, value: unknown, apply: () => Cleanup): void => {
    const current = applied.get(prop);

    if (current && isEqual(current.value, value)) {
      return;
    }

    if (current && runCleanupUpdate(current.cleanup, value)) {
      current.value = value;
      return;
    }

    current?.cleanup();
    applied.set(prop, {
      value,
      cleanup: apply()
    });
  };

  for (const prop of Array.from(applied.keys()).reverse()) {
    if (nextKeys.has(prop)) {
      continue;
    }

    applied.get(prop)?.cleanup();
    applied.delete(prop);
  }

  if (typeof Element !== 'undefined' && target instanceof Element) {
    const isSVG = typeof SVGElement !== 'undefined' && target instanceof SVGElement;

    for (const [prop, value] of Object.entries(entries)) {
      syncProp(prop, value, () => assignProp(target, prop, value, entries, isSVG));
    }

    return;
  }

  for (const [prop, value] of Object.entries(entries)) {
    if (prop === 'ref') {
      syncProp(prop, value, () => {
        if (typeof value === 'function') {
          (value as (target: object) => void)(target);
        }

        return noop;
      });

      continue;
    }

    syncProp(prop, value, () => setProperty(target, prop, value, false));
  }
}

/** Applies a single DOM prop through Solid-compatible property, attribute, or event handling. */
function assignProp(element: Element, prop: string, value: unknown, props: object, isSVG: boolean): Cleanup {
  if (prop === 'ref') {
    if (typeof value === 'function') {
      (value as (element: Element) => void)(element);
    }

    return noop;
  }

  if (prop === 'style') {
    return setStyle(element, value);
  }

  if (prop === 'classList') {
    return setClassList(element, value);
  }

  if (prop === 'class' || prop === 'className') {
    return setClassName(element, value);
  }

  if (prop.startsWith('on:')) {
    return setEventListener(element, prop.slice(3), value, false);
  }

  if (prop.startsWith('oncapture:')) {
    return setEventListener(element, prop.slice(10), value, true);
  }

  if (prop.startsWith('on')) {
    return setSolidEvent(element, prop.slice(2).toLowerCase(), value);
  }

  if (prop.startsWith('attr:')) {
    return setAttribute(element, prop.slice(5), value);
  }

  if (prop.startsWith('bool:')) {
    return setBoolAttribute(element, prop.slice(5), value);
  }

  const isForcedProp = prop.startsWith('prop:');
  const childProp = ChildProperties.has(prop);
  const propAlias = getPropAlias(prop, element.tagName);
  const elementProp = Properties.has(prop);
  const customElement = element.nodeName.includes('-') || 'is' in props;

  if (isForcedProp || childProp || (!isSVG && (propAlias || elementProp)) || customElement) {
    const propertyName = isForcedProp
      ? prop.slice(5)
      : customElement && !elementProp && !childProp
        ? toPropertyName(prop)
        : propAlias || prop;
    return setProperty(element, propertyName, value, true);
  }

  const namespace = isSVG && prop.includes(':') ? SVGNamespace[prop.split(':')[0] ?? ''] : undefined;

  if (namespace) {
    return setAttributeNS(element, namespace, prop, value);
  }

  return setAttribute(element, Aliases[prop] ?? prop, value);
}
