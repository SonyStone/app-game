import { createRenderEffect, onCleanup, type Component } from 'solid-js';
import { useOgl } from './context';
import { resolveRegistration, toTagName } from './registry';
import { createElement as createOglElement, spread } from './renderer';
import { applyPropertyValue } from './shared';
import type { AnyInstance, OglAttachProps, OglNode } from './types';

const RESERVED_PROPS = new Set([
  'args',
  'attach',
  'children',
  'makeDefault',
  'ref',
]);
const OPTION_BAG_TYPES = new Set([
  'box',
  'cylinder',
  'plane',
  'program',
  'sphere',
  'torus',
]);

const applySharedProp = (instance: unknown, name: string, value: unknown) => {
  if (name === 'ref') {
    if (typeof value === 'function') {
      value(instance);
    }
    return;
  }

  if (RESERVED_PROPS.has(name)) {
    return;
  }

  applyPropertyValue(instance as AnyInstance, name, value);
};

const createSharedNodeError = () =>
  new Error(
    'createShared() expects a single solid-ogl intrinsic without children.',
  );

const getConstructorConfig = (node: OglNode) => {
  if (Array.isArray(node.props.args)) {
    return {
      args: [...node.props.args],
      constructorProps: new Set<string>(['args']),
    };
  }

  const type = toTagName(node.type);
  if (!OPTION_BAG_TYPES.has(type)) {
    return {
      args: [] as unknown[],
      constructorProps: new Set<string>(),
    };
  }

  const optionEntries = Object.entries(node.props).filter(
    ([name]) => !RESERVED_PROPS.has(name),
  );

  return {
    args: optionEntries.length > 0 ? [Object.fromEntries(optionEntries)] : [],
    constructorProps: new Set(optionEntries.map(([name]) => name)),
  };
};

export const createShared = (
  factory: () => unknown,
): Component<OglAttachProps> => {
  const { gl } = useOgl();
  const value = factory();

  if (
    !value ||
    typeof value !== 'object' ||
    (value as OglNode).kind !== 'node'
  ) {
    throw createSharedNodeError();
  }

  const node = value as OglNode;
  if (node.children.length > 0) {
    throw createSharedNodeError();
  }

  const registration =
    resolveRegistration(node.type) ?? resolveRegistration(toTagName(node.type));
  if (!registration) {
    throw new Error(
      `Unknown OGL intrinsic "${node.type}". Register it with extend().`,
    );
  }

  const { args, constructorProps } = getConstructorConfig(node);
  const constructorArgs = registration.requiresGl ? [gl, ...args] : args;
  const instance = new registration.constructor(...constructorArgs);
  const previousProps = new Map<string, unknown>();
  let warnedAboutConstructorProps = false;

  for (const [name, value] of Object.entries(node.props)) {
    previousProps.set(name, value);

    if (constructorProps.has(name)) {
      continue;
    }

    applySharedProp(instance, name, value);
  }

  createRenderEffect(() => {
    for (const [name, value] of Object.entries(node.props)) {
      const previous = previousProps.get(name);
      if (value === previous) {
        continue;
      }

      previousProps.set(name, value);

      if (constructorProps.has(name)) {
        if (!warnedAboutConstructorProps) {
          warnedAboutConstructorProps = true;
          console.warn(
            `createShared(${node.type}) ignores constructor prop updates after creation. Create a new shared resource instead.`,
          );
        }
        continue;
      }

      applySharedProp(instance, name, value);
    }
  });

  onCleanup(() => {
    const disposable = instance as {
      remove?: () => void;
      dispose?: () => void;
    };
    if (typeof disposable.remove === 'function') {
      disposable.remove();
      return;
    }

    disposable.dispose?.();
  });

  const SharedResource: Component<OglAttachProps> = (props) => {
    const proxyNode = createOglElement(node.type) as OglNode;
    proxyNode.instance = instance;

    spread(proxyNode, () => ({ attach: props.attach, ref: props.ref }));

    return proxyNode as any;
  };

  return SharedResource;
};
