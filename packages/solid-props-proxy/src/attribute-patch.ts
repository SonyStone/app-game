import type { AnyRecord, AttributeValue, Cleanup, ProxyValueCombiner } from './types';
import {
  findPropertyDescriptor,
  hasOwn,
  isEqual,
  isHTMLElement,
  isRecord,
  noop,
  removeArrayItem,
  restoreAttribute,
  runCleanupUpdate,
  splitClassNames,
  withCleanupUpdate
} from './utils';

/** One active normal attribute overlay layer. */
type AttributeLayer = {
  /** Value requested by the overlay layer. */
  value: unknown;
};

/** Base value plus all active layers for one normal attribute. */
type AttributeState = {
  /** Attribute value that existed before the top proxy layer was applied. */
  base: AttributeValue;
  /** Active proxy layers in application order. */
  layers: AttributeLayer[];
  /** Optional combiner used for stackable values such as class names. */
  combine?: ProxyValueCombiner;
};

/** Attribute state keyed by attribute name. */
type AttributeStateMap = Map<string, AttributeState>;

/** One active property overlay layer. */
type PropertyLayer = {
  /** Value requested by the overlay layer. */
  value: unknown;
};

/** Snapshot of one CSS declaration value and priority. */
type StyleSnapshot = {
  /** CSS property value. */
  value: string;
  /** CSS property priority such as important. */
  priority: string;
};

/** Descriptor and layer state for a patched DOM property. */
type PropertyPatch = {
  /** Element whose property descriptor is patched. */
  target: Element;
  /** Property key being patched. */
  key: string;
  /** Own descriptor captured before patching, if any. */
  ownDescriptor: PropertyDescriptor | undefined;
  /** Native descriptor found on the prototype chain, if any. */
  nativeDescriptor: PropertyDescriptor | undefined;
  /** User-owned base value beneath proxy layers. */
  base: unknown;
  /** Active proxy layers in application order. */
  layers: PropertyLayer[];
  /** Optional combiner used for stackable values such as className. */
  combine?: ProxyValueCombiner;
  /** Applies the currently resolved top value through the native setter path. */
  applyTopValue: () => void;
  /** Restores the original descriptor and removes this property patch. */
  dispose: () => void;
};

/** Native attribute methods patched while a proxy attribute layer is active. */
type AttributeMethodMap = {
  setAttribute: Element['setAttribute'];
  removeAttribute: Element['removeAttribute'];
};

/** Key of a native attribute method. */
type AttributeMethodKey = keyof AttributeMethodMap;

/** Patched native attribute method with restore metadata. */
type PatchedAttributeMethod<Key extends AttributeMethodKey> = {
  /** Original method captured from the element. */
  original: AttributeMethodMap[Key];
  /** Own descriptor present before patching, if any. */
  descriptor: PropertyDescriptor | undefined;
  /** Proxy method that bypasses interception for internal writes. */
  proxy: AttributeMethodMap[Key];
  /** Descriptor installed while the patch is active. */
  property: PropertyDescriptor;
  /** Whether the method descriptor is currently installed on the element. */
  patched: boolean;
  /** Installs the patched method when it is not already active. */
  ensure: () => void;
  /** Restores the original method descriptor. */
  restore: () => void;
};

/** Patch controller for stackable setAttribute/removeAttribute overlays. */
export type AttributePatch = Pick<AttributePatchRecord, 'setAttribute' | 'removeAttribute' | 'lock'>;

const attributePatches = new WeakMap<Element, AttributePatchRecord>();
const propertyPatches = new WeakMap<Element, Map<string, PropertyPatch>>();

/** Returns the shared normal attribute patch controller for an element. */
export function getAttributePatch(element: Element): AttributePatch {
  const existing = attributePatches.get(element);

  if (existing) {
    return existing;
  }

  const patch = new AttributePatchRecord(element);

  attributePatches.set(element, patch);
  return patch;
}

/**
 * Applies an attribute overlay and returns a cleanup that restores the previous value.
 *
 * Cleanup updates can replace the value without recreating the native method patch.
 */
export function setAttribute(
  element: Element,
  name: string,
  value: unknown,
  combine?: ProxyValueCombiner
): Cleanup {
  const nextValue = value == null ? null : String(value);
  const cleanup = getAttributePatch(element).lock(name, nextValue, combine);

  return withCleanupUpdate(cleanup, (nextValue) =>
    runCleanupUpdate(cleanup, nextValue == null ? null : String(nextValue))
  );
}

/** Applies a boolean attribute overlay, using an empty string for truthy values. */
export function setBoolAttribute(element: Element, name: string, value: unknown): Cleanup {
  const cleanup = setAttribute(element, name, value ? '' : null);

  return withCleanupUpdate(cleanup, (nextValue) => runCleanupUpdate(cleanup, nextValue ? '' : null));
}

/** Applies a class value as a stackable className/property or class attribute overlay. */
export function setClassName(element: Element, value: unknown): Cleanup {
  if (!isHTMLElement(element)) {
    return setAttribute(element, 'class', value, combineClassValue);
  }

  const cleanup = lockProperty(element, 'className', value, combineClassValue);

  if (cleanup) {
    return cleanup;
  }

  return setProperty(element, 'className', combineClassValue(element.className, [value]), true);
}

/** Applies a Solid classList object as a stackable class overlay. */
export function setClassList(element: Element, value: unknown): Cleanup {
  if (!isRecord(value)) {
    return noop;
  }

  if (isHTMLElement(element)) {
    const cleanup = lockProperty(element, 'className', value, combineClassValue);

    if (cleanup) {
      return cleanup;
    }
  }

  return getAttributePatch(element).lock('class', value, combineClassValue);
}

/** Applies a style prop as either a style attribute or per-declaration style overlay. */
export function setStyle(element: Element, value: unknown): Cleanup {
  const htmlElement = element as HTMLElement | SVGElement;

  if (!isRecord(value)) {
    const cleanup = setAttribute(element, 'style', value);

    return withCleanupUpdate(cleanup, (nextValue) => {
      if (isRecord(nextValue)) {
        return false;
      }

      return runCleanupUpdate(cleanup, nextValue);
    });
  }

  const style = htmlElement.style;
  const original = new Map<string, StyleSnapshot>();
  const applied = new Map<string, StyleSnapshot>();

  applyStyleRecord(style, value, original, applied);

  return withCleanupUpdate(
    () => {
      for (const name of Array.from(original.keys())) {
        restoreAppliedStyle(style, name, original, applied);
      }
    },
    (nextValue) => {
      if (!isRecord(nextValue)) {
        return false;
      }

      applyStyleRecord(style, nextValue, original, applied);
      return true;
    }
  );
}

/** Applies an object style record while tracking original declarations for restoration. */
function applyStyleRecord(
  style: CSSStyleDeclaration,
  value: Record<string, unknown>,
  original: Map<string, StyleSnapshot>,
  applied: Map<string, StyleSnapshot>
): void {
  const nextNames = new Set(Object.keys(value));

  for (const name of Array.from(applied.keys())) {
    if (nextNames.has(name)) {
      continue;
    }

    restoreAppliedStyle(style, name, original, applied);
    original.delete(name);
    applied.delete(name);
  }

  for (const [name, styleValue] of Object.entries(value)) {
    const previousApplied = applied.get(name);
    const current = readStyleSnapshot(style, name);

    if (!previousApplied || current.value !== previousApplied.value || current.priority !== previousApplied.priority) {
      original.set(name, current);
    }

    if (styleValue == null) {
      style.removeProperty(name);
    } else {
      style.setProperty(name, String(styleValue));
    }

    applied.set(name, readStyleSnapshot(style, name));
  }
}

/** Restores one style declaration only if the proxy-applied value is still present. */
function restoreAppliedStyle(
  style: CSSStyleDeclaration,
  name: string,
  original: Map<string, StyleSnapshot>,
  applied: Map<string, StyleSnapshot>
): void {
  const originalStyle = original.get(name);
  const appliedStyle = applied.get(name);

  if (!originalStyle || !appliedStyle) {
    return;
  }

  if (
    style.getPropertyValue(name) !== appliedStyle.value ||
    style.getPropertyPriority(name) !== appliedStyle.priority
  ) {
    return;
  }

  if (originalStyle.value === '') {
    style.removeProperty(name);
    return;
  }

  style.setProperty(name, originalStyle.value, originalStyle.priority);
}

/** Reads one CSS declaration value and priority. */
function readStyleSnapshot(style: CSSStyleDeclaration, name: string): StyleSnapshot {
  return {
    value: style.getPropertyValue(name),
    priority: style.getPropertyPriority(name)
  };
}

/**
 * Applies a property overlay to an element or plain object and returns a cleanup.
 *
 * Element properties use descriptor patches when possible so external writes update
 * the base value below the proxy layer.
 */
export function setProperty(
  target: object,
  key: string,
  value: unknown,
  alwaysSetOnRestore: boolean
): Cleanup {
  if (typeof Element !== 'undefined' && target instanceof Element) {
    const cleanup = lockProperty(target, key, value);

    if (cleanup) {
      return cleanup;
    }
  }

  const record = target as Record<string, unknown>;
  const hadOwnProperty = hasOwn(record, key);
  let original = record[key];

  record[key] = value;
  let applied = record[key];

  return withCleanupUpdate(
    () => {
      if (!isEqual(record[key], applied)) {
        return;
      }

      if (alwaysSetOnRestore || hadOwnProperty) {
        record[key] = original;
        return;
      }

      delete record[key];
    },
    (nextValue) => {
      if (!isEqual(record[key], applied)) {
        original = record[key];
      }

      record[key] = nextValue;
      applied = record[key];
      return true;
    }
  );
}

/** Locks an element property as a stackable overlay when its descriptor can be patched. */
export function lockProperty(
  target: Element,
  key: string,
  value: unknown,
  combine?: ProxyValueCombiner
): Cleanup | undefined {
  const patch = getPropertyPatch(target, key);

  if (!patch) {
    return undefined;
  }

  patch.combine ??= combine;

  const layer: PropertyLayer = { value };
  patch.layers.push(layer);
  patch.applyTopValue();

  return withCleanupUpdate(
    () => {
      const layerIndex = patch.layers.indexOf(layer);

      if (layerIndex >= 0) {
        patch.layers.splice(layerIndex, 1);
      }

      patch.applyTopValue();

      if (patch.layers.length === 0) {
        patch.dispose();
      }
    },
    (nextValue) => {
      layer.value = nextValue;
      patch.applyTopValue();
      return true;
    }
  );
}

/** Own-property patch record for one native attribute method. */
class PatchedAttributeMethodRecord<Key extends AttributeMethodKey> implements PatchedAttributeMethod<Key> {
  readonly original: AttributeMethodMap[Key];
  readonly descriptor: PropertyDescriptor | undefined;
  readonly property: PropertyDescriptor;
  patched = false;

  constructor(
    private readonly element: Element,
    private readonly key: Key,
    readonly proxy: AttributeMethodMap[Key],
    value: PropertyDescriptor['value']
  ) {
    this.original = element[key] as AttributeMethodMap[Key];
    this.descriptor = Object.getOwnPropertyDescriptor(element, key);
    this.property = { configurable: true, value };
  }

  /** Installs the patched method on the element. */
  ensure(): void {
    if (this.patched) {
      return;
    }

    Object.defineProperty(this.element, this.key, this.property);
    this.patched = true;
  }

  /** Restores the method descriptor that existed before patching. */
  restore(): void {
    if (!this.patched) {
      return;
    }

    if (this.descriptor) {
      Object.defineProperty(this.element, this.key, this.descriptor);
    } else {
      Reflect.deleteProperty(this.element, this.key);
    }

    this.patched = false;
  }
}

/** Coordinates stackable normal attribute overlays for one element. */
class AttributePatchRecord {
  private proxyDepth = 0;
  private readonly states: AttributeStateMap = new Map();
  readonly setAttribute: PatchedAttributeMethod<'setAttribute'>;
  readonly removeAttribute: PatchedAttributeMethod<'removeAttribute'>;

  constructor(readonly element: Element) {
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    const self = this;

    const originalSetAttribute = element.setAttribute;
    const originalRemoveAttribute = element.removeAttribute;

    this.setAttribute = new PatchedAttributeMethodRecord(
      element,
      'setAttribute',
      ((name: string, value: string) =>
        self.runAsProxy(() => originalSetAttribute.call(element, name, value))) as Element['setAttribute'],
      function (this: Element, name: string, value: string) {
        if (this !== element || self.proxyDepth > 0) {
          originalSetAttribute.call(this, name, value);
          return;
        }

        const state = self.states.get(name);

        if (!state || state.layers.length === 0) {
          originalSetAttribute.call(this, name, value);
          return;
        }

        state.base = String(value);
        self.applyState(name, state);
      }
    );

    this.removeAttribute = new PatchedAttributeMethodRecord(
      element,
      'removeAttribute',
      ((name: string) =>
        self.runAsProxy(() => originalRemoveAttribute.call(element, name))) as Element['removeAttribute'],
      function (this: Element, name: string) {
        if (this !== element || self.proxyDepth > 0) {
          originalRemoveAttribute.call(this, name);
          return;
        }

        const state = self.states.get(name);

        if (!state || state.layers.length === 0) {
          originalRemoveAttribute.call(this, name);
          return;
        }

        state.base = null;
        self.applyState(name, state);
      }
    );
  }

  /** Adds one overlay layer for an attribute and returns its cleanup. */
  lock(name: string, value: unknown, combine?: ProxyValueCombiner): Cleanup {
    this.setAttribute.ensure();
    this.removeAttribute.ensure();

    const state = this.states.get(name) ?? { base: this.element.getAttribute(name), layers: [] };
    const layer: AttributeLayer = { value };

    state.combine ??= combine;
    state.layers.push(layer);
    this.states.set(name, state);
    this.applyState(name, state);

    return withCleanupUpdate(
      () => {
        removeArrayItem(state.layers, layer);
        this.applyState(name, state);

        if (state.layers.length === 0) {
          this.states.delete(name);
          this.maybeRestore();
        }
      },
      (nextValue) => {
        layer.value = nextValue;
        this.applyState(name, state);
        return true;
      }
    );
  }

  /** Applies the resolved value for one attribute state. */
  private applyState(name: string, state: AttributeState): void {
    const value = resolveAttributeStateValue(state);

    this.runAsProxy(() => {
      restoreAttribute(this.element, name, value);
    });
  }

  /** Restores native methods when no attribute states remain. */
  private maybeRestore(): void {
    if (this.states.size > 0) {
      return;
    }

    this.setAttribute.restore();
    this.removeAttribute.restore();
    attributePatches.delete(this.element);
  }

  /** Runs an internal native write without re-entering the interception path. */
  private runAsProxy<T>(run: () => T): T {
    this.proxyDepth += 1;

    try {
      return run();
    } finally {
      this.proxyDepth -= 1;
    }
  }
}

/** Returns the shared property patch for one element/key, creating it when possible. */
function getPropertyPatch(target: Element, key: string): PropertyPatch | undefined {
  let patches = propertyPatches.get(target);

  if (!patches) {
    patches = new Map();
    propertyPatches.set(target, patches);
  }

  const existing = patches.get(key);

  if (existing) {
    return existing;
  }

  const patch = createPropertyPatch(target, key);

  if (patch) {
    patches.set(key, patch);
  }

  return patch;
}

/** Creates a property descriptor overlay that keeps user writes as the base value. */
function createPropertyPatch(target: Element, key: string): PropertyPatch | undefined {
  const ownDescriptor = Object.getOwnPropertyDescriptor(target, key);

  if (ownDescriptor && !ownDescriptor.configurable) {
    return undefined;
  }

  const nativeDescriptor = findPropertyDescriptor(target, key);
  const base = (target as unknown as AnyRecord)[key];
  const patch: PropertyPatch = {
    target,
    key,
    ownDescriptor,
    nativeDescriptor,
    base,
    layers: [],
    applyTopValue: () => {
      writeNativeProperty(patch, topPropertyValue(patch));
    },
    dispose: () => {
      const finalValue = patch.base;
      restorePropertyDescriptor(patch);
      writeRestoredPropertyValue(target, key, ownDescriptor, finalValue);
      propertyPatches.get(target)?.delete(key);
    }
  };

  try {
    Object.defineProperty(target, key, {
      configurable: true,
      enumerable: ownDescriptor?.enumerable ?? nativeDescriptor?.enumerable ?? true,
      get: () => topPropertyValue(patch),
      set: (nextValue: unknown) => {
        patch.base = nextValue;
        patch.applyTopValue();
      }
    });
  } catch {
    return undefined;
  }

  return patch;
}

/** Resolves the top property value, combining layers when a combiner is present. */
function topPropertyValue(patch: PropertyPatch): unknown {
  if (patch.combine) {
    return patch.combine(
      patch.base,
      patch.layers.map((layer) => layer.value)
    );
  }

  return patch.layers[patch.layers.length - 1]?.value ?? patch.base;
}

/** Writes a resolved value through the native setter path while preserving the proxy descriptor. */
function writeNativeProperty(patch: PropertyPatch, value: unknown): void {
  if (patch.nativeDescriptor?.set) {
    patch.nativeDescriptor.set.call(patch.target, value);
    return;
  }

  restorePropertyDescriptor(patch);
  try {
    (patch.target as unknown as AnyRecord)[patch.key] = value;
  } finally {
    Object.defineProperty(patch.target, patch.key, {
      configurable: true,
      enumerable: patch.ownDescriptor?.enumerable ?? patch.nativeDescriptor?.enumerable ?? true,
      get: () => topPropertyValue(patch),
      set: (nextValue: unknown) => {
        patch.base = nextValue;
        patch.applyTopValue();
      }
    });
  }
}

/** Restores the property descriptor that existed before the proxy descriptor was installed. */
function restorePropertyDescriptor(patch: PropertyPatch): void {
  if (patch.ownDescriptor) {
    Object.defineProperty(patch.target, patch.key, patch.ownDescriptor);
    return;
  }

  delete (patch.target as unknown as AnyRecord)[patch.key];
}

/** Writes the base value back after a property descriptor patch is disposed. */
function writeRestoredPropertyValue(
  target: Element,
  key: string,
  ownDescriptor: PropertyDescriptor | undefined,
  value: unknown
): void {
  if (ownDescriptor?.set) {
    ownDescriptor.set.call(target, value);
    return;
  }

  if (ownDescriptor && 'value' in ownDescriptor) {
    Object.defineProperty(target, key, { ...ownDescriptor, value });
    return;
  }

  (target as unknown as AnyRecord)[key] = value;
}

/** Resolves the top attribute layer to the string value expected by the DOM. */
function resolveAttributeStateValue(state: AttributeState): AttributeValue {
  const value = state.combine
    ? state.combine(
        state.base,
        state.layers.map((layer) => layer.value)
      )
    : (state.layers[state.layers.length - 1]?.value ?? state.base);

  return value == null ? null : String(value);
}

/** Combines class/classList overlay layers with a base class string. */
export function combineClassValue(base: unknown, layers: readonly unknown[]): string {
  const classNames = splitClassNames(String(base ?? ''));

  for (const layer of layers) {
    applyClassLayer(classNames, layer);
  }

  return classNames.join(' ');
}

/** Applies one class overlay layer to a mutable class name list. */
function applyClassLayer(classNames: string[], layer: unknown): void {
  if (isRecord(layer)) {
    for (const [key, enabled] of Object.entries(layer)) {
      for (const className of splitClassNames(key)) {
        if (enabled) {
          addClassName(classNames, className);
        } else {
          removeClassName(classNames, className);
        }
      }
    }
    return;
  }

  if (layer == null) {
    return;
  }

  for (const className of splitClassNames(String(layer))) {
    addClassName(classNames, className);
  }
}

/** Adds a class name if it is not already present. */
function addClassName(classNames: string[], className: string): void {
  if (!classNames.includes(className)) {
    classNames.push(className);
  }
}

/** Removes a class name if it is present. */
function removeClassName(classNames: string[], className: string): void {
  const index = classNames.indexOf(className);

  if (index >= 0) {
    classNames.splice(index, 1);
  }
}
