import { components } from '@app-game/ecsy/entity';
import { Component, Constructor } from '../component.interface';
import { OperatorComponent, Operators } from '../data';

const createKey = (operator: Operators, component: Constructor<Component>) => `${operator}(${component.name})`;

export const archetypes: Array<Array<[Operators, number | undefined]> | [Operators, number | undefined]> = [];

/**
 * Get a key from a list of components
 * @param Components Array of components to generate the key
 */
export function queryKey(operatorComponents: OperatorComponent[] | OperatorComponent) {
  console.log(`operatorComponents`, operatorComponents);

  if (Array.isArray(operatorComponents)) {
    const names: string[] = [];

    const archetype: Array<[Operators, number | undefined]> = [];

    for (const { operator, component } of operatorComponents) {
      archetype.push([operator, components.get(component)]);

      names.push(createKey(operator, component));
    }

    archetypes.push(archetype);

    return names.join('-');
  } else {
    const { operator, component } = operatorComponents;

    archetypes.push([operator, components.get(component)]);

    return createKey(operator, component);
  }
}

/**
 * operator name
 * class name
 */
