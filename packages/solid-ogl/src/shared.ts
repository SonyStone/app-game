import { Transform } from 'ogl';
import type { AnyInstance, OglParent } from './types';

export const getRoot = (parent: OglParent) =>
  parent.kind === 'root' ? parent : parent.root;

export const insertChildAt = <T>(children: T[], child: T, anchor?: T) => {
  if (!anchor) {
    children.push(child);
    return;
  }

  const index = children.indexOf(anchor);
  if (index === -1) {
    children.push(child);
    return;
  }

  children.splice(index, 0, child);
};

export const parsePath = (value: string) => value.split('.').filter(Boolean);

export const getValueAtPath = (owner: AnyInstance, path: string[]) =>
  path.reduce<unknown>((current, segment) => {
    if (current == null || typeof current !== 'object') {
      return undefined;
    }

    return (current as AnyInstance)[segment];
  }, owner);

export const setValueAtPath = (
  owner: AnyInstance,
  path: string[],
  value: unknown,
) => {
  if (path.length === 0) {
    return;
  }

  let current: AnyInstance = owner;
  for (const segment of path.slice(0, -1)) {
    const next = current[segment];
    if (next == null || typeof next !== 'object') {
      current[segment] = {};
    }
    current = current[segment] as AnyInstance;
  }

  current[path[path.length - 1]] = value;
};

export const isTransform = (value: unknown): value is Transform =>
  value instanceof Transform;

const normalizeVectorValue = (value: unknown) => {
  if (Array.isArray(value)) {
    return value;
  }

  if (typeof Element !== 'undefined' && value instanceof Element) {
    return value;
  }

  if (value && typeof value === 'object' && 'x' in (value as AnyInstance)) {
    const objectValue = value as {
      x?: unknown;
      y?: unknown;
      z?: unknown;
      w?: unknown;
    };
    const vectorEntries = [
      objectValue.x,
      objectValue.y,
      objectValue.z,
      objectValue.w,
    ].filter((entry): entry is number => typeof entry === 'number');

    if (vectorEntries.length >= 2) {
      return vectorEntries;
    }
  }

  return value;
};

export const applyPropertyValue = (
  target: AnyInstance,
  property: string,
  value: unknown,
) => {
  const current = target[property] as AnyInstance | undefined;

  if (value === undefined) {
    return;
  }

  if (
    property === 'lookAt' &&
    typeof (target as { lookAt?: (arg: unknown) => void }).lookAt === 'function'
  ) {
    (target as { lookAt: (arg: unknown) => void }).lookAt(value);
    return;
  }

  const normalizedValue = normalizeVectorValue(value);

  if (
    current &&
    typeof current === 'object' &&
    typeof (current as { set?: (...args: unknown[]) => void }).set ===
      'function'
  ) {
    if (Array.isArray(normalizedValue)) {
      (current as { set: (...args: unknown[]) => void }).set(
        ...normalizedValue,
      );
      return;
    }

    if (typeof normalizedValue === 'number') {
      (current as { set: (...args: unknown[]) => void }).set(normalizedValue);
      return;
    }
  }

  if (
    current &&
    typeof current === 'object' &&
    typeof (current as { copy?: (input: unknown) => void }).copy ===
      'function' &&
    normalizedValue &&
    typeof normalizedValue === 'object'
  ) {
    (current as { copy: (input: unknown) => void }).copy(normalizedValue);
    return;
  }

  target[property] = normalizedValue;
};
