import type {
  AnyRecord,
  AttributeValue,
  Cleanup,
  EventOptions,
  EventTuple,
  Props,
  UpdatableCleanup
} from './types';

/** Reads enumerable props and removes children, which the proxy never applies post-render. */
export function readProps<T extends object>(props: Props<T>): AnyRecord {
  const propRecord = props as unknown as AnyRecord;
  const nextProps: AnyRecord = {};

  for (const key of Object.keys(propRecord)) {
    if (key === 'children') {
      continue;
    }

    nextProps[key] = propRecord[key];
  }

  return nextProps;
}

/** Combines multiple cleanups into one cleanup that runs in reverse application order. */
export function cleanupAll(cleanups: Cleanup[]): Cleanup {
  return () => {
    for (let index = cleanups.length - 1; index >= 0; index -= 1) {
      cleanups[index]?.();
    }
  };
}

/** Attaches an in-place update hook to a cleanup function. */
export function withCleanupUpdate(cleanup: Cleanup, update: (value: unknown) => boolean): UpdatableCleanup {
  const updatable = (() => cleanup()) as UpdatableCleanup;
  updatable.update = update;
  return updatable;
}

/** Runs a cleanup update hook when present and reports whether it handled the value. */
export function runCleanupUpdate(cleanup: Cleanup, value: unknown): boolean {
  return (cleanup as UpdatableCleanup).update?.(value) ?? false;
}

/** Restores a normal attribute value, removing the attribute for null. */
export function restoreAttribute(element: Element, name: string, value: AttributeValue): void {
  if (value == null) {
    element.removeAttribute(name);
    return;
  }

  element.setAttribute(name, value);
}

/** Restores a namespaced attribute using the qualified name needed by setAttributeNS. */
export function restoreNamespacedAttribute(
  element: Element,
  namespace: string | null,
  qualifiedName: string,
  localName: string,
  value: AttributeValue
): void {
  if (value == null) {
    element.removeAttributeNS(namespace, localName);
    return;
  }

  element.setAttributeNS(namespace, qualifiedName, value);
}

/** Restores or deletes an object key depending on whether the key existed originally. */
export function restoreObjectKey(record: AnyRecord, key: string, hadKey: boolean, value: unknown): void {
  if (hadKey) {
    record[key] = value;
    return;
  }

  delete record[key];
}

/** Reads a Solid event tuple and returns its normalized handler/data pair. */
export function readEventTuple(
  value: unknown
): { handler: (data: unknown, event: Event) => void; data: unknown } | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }

  const tuple = value as unknown as EventTuple;

  if (typeof tuple[0] !== 'function') {
    return undefined;
  }

  return {
    handler: tuple[0],
    data: tuple[1]
  };
}

/** Finds the first own property descriptor for a key along an object's prototype chain. */
export function findPropertyDescriptor(target: object, key: string): PropertyDescriptor | undefined {
  let current: object | null = target;

  while (current) {
    const descriptor = Object.getOwnPropertyDescriptor(current, key);

    if (descriptor) {
      return descriptor;
    }

    current = Object.getPrototypeOf(current);
  }

  return undefined;
}

/** Removes the first matching item from an array if it is present. */
export function removeArrayItem<T>(items: T[], item: T): void {
  const index = items.indexOf(item);

  if (index >= 0) {
    items.splice(index, 1);
  }
}

/** Splits a whitespace-separated class string into individual class names. */
export function splitClassNames(className: string): string[] {
  return className.trim().split(/\s+/).filter(Boolean);
}

/** Converts dashed custom-element attribute names into property names. */
export function toPropertyName(name: string): string {
  return name.toLowerCase().replace(/-([a-z])/g, (_, char: string) => char.toUpperCase());
}

/** Narrows an unknown value to a non-null object record. */
export function isRecord(value: unknown): value is AnyRecord {
  return typeof value === 'object' && value !== null;
}

/** Narrows an Element to HTMLElement in runtimes where HTMLElement exists. */
export function isHTMLElement(element: Element): element is HTMLElement {
  return typeof HTMLElement !== 'undefined' && element instanceof HTMLElement;
}

/** Compares two values using Object.is so cleanup diffs match JavaScript identity semantics. */
export function isEqual(left: unknown, right: unknown): boolean {
  return Object.is(left, right);
}

/** Checks for an own key without being affected by objects that shadow hasOwnProperty. */
export function hasOwn(record: object, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(record, key);
}

/** Creates a stable map key for namespaced attribute state. */
export function namespaceAttributeKey(namespace: string | null, name: string): string {
  return `${namespace ?? ''}\u0000${name}`;
}

/** Splits a namespaced attribute map key into namespace and name pieces. */
export function splitNamespaceAttributeKey(key: string): [string, string] {
  const [namespace = '', name = ''] = key.split('\u0000');
  return [namespace, name];
}

/** Creates a stable map key for an event name plus capture phase. */
export function eventKey(name: string, capture: boolean): string {
  return `${name}\u0000${capture ? 'capture' : 'bubble'}`;
}

/** Reads the capture flag from native event listener options. */
export function eventCapture(options: EventOptions): boolean {
  if (typeof options === 'boolean') {
    return options;
  }

  return Boolean(options?.capture);
}

/** No-op cleanup used when a prop path has nothing to restore. */
export function noop(): void {}
