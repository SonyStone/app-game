import { Component as IComponent, Constructor } from '../component.interface';
import { inferType } from './infer-type';
import type { TypeDefinition } from './create-type';

type SchemaAttribute = {
  type?: TypeDefinition<unknown>;
  default: unknown;
};

type ComponentSchema = Record<string, SchemaAttribute>;

type ComponentInstance = IComponent & Record<string, unknown> & {
  schema?: ComponentSchema;
};

export function createComponentClass(schema: ComponentSchema, name: string): Constructor<IComponent> {
  // var Component = new Function(`return function ${name}() {}`)();

  for (const key in schema) {
    if (schema.hasOwnProperty(key)) {

      const type = schema[key].type;
      if (!type) {
        schema[key].type = inferType(schema[key].default);
      }
    }
  }

  const Component = function(this: ComponentInstance) {
    for (const key in schema) {
      if (schema.hasOwnProperty(key)) {

        const attr = schema[key];
        const type = attr.type;
        if (type && type.isType) {
          this[key] = type.create(attr.default);
        } else {
          this[key] = attr.default;
        }

      }
    }
  } as unknown as Constructor<IComponent> & { prototype: ComponentInstance };

  if (typeof name !== 'undefined') {
    Object.defineProperty(Component, 'name', { value: name });
  }

  Component.prototype.schema = schema;

  let knownTypes = true;
  for (const key in schema) {
    if (schema.hasOwnProperty(key)) {

      const attr = schema[key];
      if (!attr.type) {
        attr.type = inferType(attr.default);
      }

      const type = attr.type;
      if (!type) {
        console.warn(`Unknown type definition for attribute '${key}'`);
        knownTypes = false;
      }

    }
  }

  if (!knownTypes) {
    console.warn(
      `This component can't use pooling because some data types are not registered. Please provide a type created with 'createType'`
    );

    for (const key in schema) {
      if (schema.hasOwnProperty(key)) {

        const attr = schema[key];
        Component.prototype[key] = attr.default;

      }
    }
  } else {
    Component.prototype.copy = function(this: ComponentInstance, src: ComponentInstance) {

      for (const key in schema) {
        if (src[key] !== undefined) {
          const type = schema[key].type;
          if (type?.isSimpleType) {
            this[key] = src[key];
          } else if (type?.copy) {
            type.copy(this, src, key);
          } else {
            // @todo Detect that it's not possible to copy all the attributes
            // and just avoid creating the copy function
            console.warn(
              `Unknown copy function for attribute '${key}' data type`
            );
          }
        }
      }
    };

    Component.prototype.reset = function(this: ComponentInstance) {
      for (const key in schema) {
        if (schema.hasOwnProperty(key)) {

          const attr = schema[key];
          const type = attr.type;
          if (type?.reset) { type.reset(this, key, attr.default); }

        }
      }
    };

    Component.prototype.clear = function(this: ComponentInstance) {
      for (const key in schema) {
        if (schema.hasOwnProperty(key)) {

          const type = schema[key].type;
          if (type?.clear) { type.clear(this, key); }

        }
      }
    };

    for (const key in schema) {
      if (schema.hasOwnProperty(key)) {

        const attr = schema[key];
        const type = attr.type;
        Component.prototype[key] = attr.default;

        if (type?.reset) {
          type.reset(Component.prototype, key, attr.default);
        }

      }
    }
  }

  return Component as any;
}
