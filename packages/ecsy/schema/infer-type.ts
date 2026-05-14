import { TypeDefinition } from './create-type';
import { standardTypes } from './standard-types';

type InferableType = TypeDefinition<NumberConstructor | BooleanConstructor | StringConstructor | ArrayConstructor>;

/**
 * Try to infer the type of the value
 * @return Type of the attribute
 */
export function inferType(value: unknown): InferableType | undefined {
  if (Array.isArray(value)) {
    return standardTypes.array;
  }

  if (typeof value === 'number') {
    return standardTypes.number;
  }

  if (typeof value === 'boolean') {
    return standardTypes.boolean;
  }

  if (typeof value === 'string') {
    return standardTypes.string;
  }

  return undefined;
}
