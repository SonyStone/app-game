import { createType } from './create-type';

function cloneArrayValue(defaultValue: unknown): unknown[] {
  return Array.isArray(defaultValue) ? defaultValue.slice() : [];
}

function clearArrayValue(target: Record<string, unknown>, key: string): void {
  const currentValue = target[key];
  if (Array.isArray(currentValue)) {
    currentValue.length = 0;
  } else {
    target[key] = [];
  }
}

/**
 * Standard types
 */
export const standardTypes = {
  number: createType({
    baseType: Number,
    isSimpleType: true,
    create: defaultValue => {
      return typeof defaultValue !== 'undefined' ? defaultValue : 0;
    },
    reset: (src, key, defaultValue) => {
      if (typeof defaultValue !== 'undefined') {
        src[key] = defaultValue;
      } else {
        src[key] = 0;
      }
    },
    clear: (src, key) => {
      src[key] = 0;
    }
  }),
  boolean: createType({
    baseType: Boolean,
    isSimpleType: true,
    create: defaultValue => {
      return typeof defaultValue !== 'undefined' ? defaultValue : false;
    },
    reset: (src, key, defaultValue) => {
      if (typeof defaultValue !== 'undefined') {
        src[key] = defaultValue;
      } else {
        src[key] = false;
      }
    },
    clear: (src, key) => {
      src[key] = false;
    }
  }),
  string: createType({
    baseType: String,
    isSimpleType: true,
    create: defaultValue => {
      return typeof defaultValue !== 'undefined' ? defaultValue : '';
    },
    reset: (src, key, defaultValue) => {
      if (typeof defaultValue !== 'undefined') {
        src[key] = defaultValue;
      } else {
        src[key] = '';
      }
    },
    clear: (src, key) => {
      src[key] = '';
    }
  }),
  array: createType({
    baseType: Array,
    create: defaultValue => {
      if (typeof defaultValue !== 'undefined') {
        return cloneArrayValue(defaultValue);
      }

      return [];
    },
    reset: (src, key, defaultValue) => {
      if (typeof defaultValue !== 'undefined') {
        src[key] = cloneArrayValue(defaultValue);
      } else {
        clearArrayValue(src, key);
      }
    },
    clear: (src, key) => {
      clearArrayValue(src, key);
    },
    copy: (src, dst, key) => {
      src[key] = cloneArrayValue(dst[key]);
    }
  })
};

