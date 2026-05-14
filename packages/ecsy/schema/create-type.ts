
type TypeStorage = Record<string, unknown>;

export interface TypeDefinition<T> {
  baseType?: T;
  isType?: boolean;
  isSimpleType?: boolean;
  create(defaultValue?: unknown): unknown;
  reset(src: TypeStorage, key: string, defaultValue?: unknown): void;
  clear(src: TypeStorage, key: string): void;
  copy?(src: TypeStorage, dst: TypeStorage, key: string): void;
}

export function createType<T>(typeDefinition: TypeDefinition<T>): TypeDefinition<T> {
  const mandatoryFunctions = [
    'create',
    'reset',
    'clear'
    /*"copy"*/
  ] as const;

  const undefinedFunctions = mandatoryFunctions.filter((fn) => {
    return !typeDefinition[fn];
  });

  if (undefinedFunctions.length > 0) {
    throw new Error(
      `createType expect type definition to implements the following functions: ${undefinedFunctions.join(
        ', '
      )}`
    );
  }

  typeDefinition.isType = true;

  return typeDefinition;
}
