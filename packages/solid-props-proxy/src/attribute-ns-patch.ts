import type { AttributeValue, Cleanup } from './types';
import {
  namespaceAttributeKey,
  removeArrayItem,
  restoreNamespacedAttribute,
  runCleanupUpdate,
  withCleanupUpdate
} from './utils';

/** One active namespaced attribute overlay layer. */
type AttributeNSLayer = {
  /** Value requested by the overlay layer. */
  value: unknown;
};

/** Base value plus all active layers for one namespaced attribute. */
type AttributeNSState = {
  /** Attribute value that existed before the top proxy layer was applied. */
  base: AttributeValue;
  /** Active proxy layers in application order. */
  layers: AttributeNSLayer[];
  /** Most recent qualified name, preserving prefixes such as xlink. */
  qualifiedName: string;
};

/** Attribute state keyed by namespace plus local name. */
type AttributeNSStateMap = Map<string, AttributeNSState>;

/** Native namespaced attribute methods patched while a proxy layer is active. */
type AttributeNSMethodMap = {
  setAttributeNS: Element['setAttributeNS'];
  removeAttributeNS: Element['removeAttributeNS'];
};

/** Key of a native namespaced attribute method. */
type AttributeNSMethodKey = keyof AttributeNSMethodMap;

/** Patched native namespaced attribute method with restore metadata. */
type PatchedAttributeNSMethod<Key extends AttributeNSMethodKey> = {
  /** Original method captured from the element. */
  original: AttributeNSMethodMap[Key];
  /** Own descriptor present before patching, if any. */
  descriptor: PropertyDescriptor | undefined;
  /** Proxy method that bypasses interception for internal writes. */
  proxy: AttributeNSMethodMap[Key];
  /** Descriptor installed while the patch is active. */
  property: PropertyDescriptor;
  /** Whether the method descriptor is currently installed on the element. */
  patched: boolean;
  /** Installs the patched method when it is not already active. */
  ensure: () => void;
  /** Restores the original method descriptor. */
  restore: () => void;
};

/** Patch controller for stackable setAttributeNS/removeAttributeNS overlays. */
export type AttributeNSPatch = Pick<AttributeNSPatchRecord, 'setAttributeNS' | 'removeAttributeNS' | 'lock'>;

const attributeNSPatches = new WeakMap<Element, AttributeNSPatchRecord>();

/** Returns the shared namespaced attribute patch controller for an element. */
export function getAttributeNSPatch(element: Element): AttributeNSPatch {
  const existing = attributeNSPatches.get(element);

  if (existing) {
    return existing;
  }

  const patch = new AttributeNSPatchRecord(element);

  attributeNSPatches.set(element, patch);
  return patch;
}

/**
 * Applies a namespaced attribute overlay and returns a cleanup that restores the previous value.
 *
 * Cleanup updates can replace the value without recreating the native method patch.
 */
export function setAttributeNS(
  element: Element,
  namespace: string,
  name: string,
  value: unknown
): Cleanup {
  const nextValue = value == null ? null : String(value);
  const cleanup = getAttributeNSPatch(element).lock(namespace, name, nextValue);

  return withCleanupUpdate(cleanup, (nextValue) =>
    runCleanupUpdate(cleanup, nextValue == null ? null : String(nextValue))
  );
}

/** Own-property patch record for one namespaced attribute method. */
class PatchedAttributeNSMethodRecord<Key extends AttributeNSMethodKey> implements PatchedAttributeNSMethod<Key> {
  readonly original: AttributeNSMethodMap[Key];
  readonly descriptor: PropertyDescriptor | undefined;
  readonly property: PropertyDescriptor;
  patched = false;

  constructor(
    private readonly element: Element,
    private readonly key: Key,
    readonly proxy: AttributeNSMethodMap[Key],
    value: PropertyDescriptor['value']
  ) {
    this.original = element[key] as AttributeNSMethodMap[Key];
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

/** Coordinates stackable namespaced attribute overlays for one element. */
class AttributeNSPatchRecord {
  private proxyDepth = 0;
  private readonly states: AttributeNSStateMap = new Map();
  readonly setAttributeNS: PatchedAttributeNSMethod<'setAttributeNS'>;
  readonly removeAttributeNS: PatchedAttributeNSMethod<'removeAttributeNS'>;

  constructor(readonly element: Element) {
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    const self = this;

    const originalSetAttributeNS = element.setAttributeNS;
    const originalRemoveAttributeNS = element.removeAttributeNS;

    this.setAttributeNS = new PatchedAttributeNSMethodRecord(
      element,
      'setAttributeNS',
      ((namespace: string | null, name: string, value: string) =>
        self.runAsProxy(() =>
          originalSetAttributeNS.call(element, namespace, name, value)
        )) as Element['setAttributeNS'],
      function (this: Element, namespace: string | null, name: string, value: string) {
        const localName = toNamespacedAttributeLocalName(name);

        if (this !== element || self.proxyDepth > 0) {
          originalSetAttributeNS.call(this, namespace, name, value);
          return;
        }

        const state = self.states.get(namespaceAttributeKey(namespace, localName));

        if (!state || state.layers.length === 0) {
          originalSetAttributeNS.call(this, namespace, name, value);
          return;
        }

        state.base = String(value);
        state.qualifiedName = name;
        self.applyState(namespace, localName, state);
      }
    );

    this.removeAttributeNS = new PatchedAttributeNSMethodRecord(
      element,
      'removeAttributeNS',
      ((namespace: string | null, name: string) =>
        self.runAsProxy(() =>
          originalRemoveAttributeNS.call(element, namespace, name)
        )) as Element['removeAttributeNS'],
      function (this: Element, namespace: string | null, name: string) {
        const localName = toNamespacedAttributeLocalName(name);

        if (this !== element || self.proxyDepth > 0) {
          originalRemoveAttributeNS.call(this, namespace, name);
          return;
        }

        const state = self.states.get(namespaceAttributeKey(namespace, localName));

        if (!state || state.layers.length === 0) {
          originalRemoveAttributeNS.call(this, namespace, name);
          return;
        }

        state.base = null;
        self.applyState(namespace, localName, state);
      }
    );
  }

  /** Adds one overlay layer for a namespaced attribute and returns its cleanup. */
  lock(namespace: string | null, name: string, value: AttributeValue): Cleanup {
    this.setAttributeNS.ensure();
    this.removeAttributeNS.ensure();

    const localName = toNamespacedAttributeLocalName(name);
    const key = namespaceAttributeKey(namespace, localName);
    const state = this.states.get(key) ?? {
      base: this.element.getAttributeNS(namespace, localName),
      layers: [],
      qualifiedName: name
    };
    const layer: AttributeNSLayer = { value };

    state.qualifiedName = name;
    state.layers.push(layer);
    this.states.set(key, state);
    this.applyState(namespace, localName, state);

    return withCleanupUpdate(
      () => {
        removeArrayItem(state.layers, layer);
        this.applyState(namespace, localName, state);

        if (state.layers.length === 0) {
          this.states.delete(key);
          this.maybeRestore();
        }
      },
      (nextValue) => {
        layer.value = nextValue;
        this.applyState(namespace, localName, state);
        return true;
      }
    );
  }

  /** Applies the resolved value for a namespaced attribute state. */
  private applyState(namespace: string | null, localName: string, state: AttributeNSState): void {
    const value = resolveAttributeStateValue(state);

    this.runAsProxy(() => {
      restoreNamespacedAttribute(this.element, namespace, state.qualifiedName, localName, value);
    });
  }

  /** Restores native methods when no namespaced attribute states remain. */
  private maybeRestore(): void {
    if (this.states.size > 0) {
      return;
    }

    this.setAttributeNS.restore();
    this.removeAttributeNS.restore();
    attributeNSPatches.delete(this.element);
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

/** Resolves the top namespaced attribute layer to the string value expected by the DOM. */
function resolveAttributeStateValue(state: AttributeNSState): AttributeValue {
  const value = state.layers[state.layers.length - 1]?.value ?? state.base;

  return value == null ? null : String(value);
}

/** Extracts the local name from a qualified namespaced attribute. */
function toNamespacedAttributeLocalName(name: string): string {
  const separator = name.indexOf(':');

  return separator >= 0 ? name.slice(separator + 1) : name;
}
