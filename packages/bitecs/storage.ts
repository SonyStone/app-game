import { TYPES, TYPES_ENUM, TYPES_NAMES, Type, UNSIGNED_MAX } from './constants';
import { Entity } from './entity';
// import { createAllocator } from './Allocator.js'

const roundToMultiple = (mul: number) => (x: number) => Math.ceil(x / mul) * mul;
const roundToMultiple4 = roundToMultiple(4);

export const $storeRef = Symbol('storeRef');
export const $storeSize = Symbol('storeSize');
export const $storeMaps = Symbol('storeMaps');
export const $storeFlattened = Symbol('storeFlattened');
export const $storeBase = Symbol('storeBase');
export const $storeType = Symbol('storeType');

export const $storeArrayElementCounts = Symbol('storeArrayElementCounts');
export const $storeSubarrays = Symbol('storeSubarrays');
export const $subarrayCursors = Symbol('subarrayCursors');
export const $subarray = Symbol('subarray');
export const $subarrayFrom = Symbol('subarrayFrom');
export const $subarrayTo = Symbol('subarrayTo');
export const $parentArray = Symbol('parentArray');
export const $tagStore = Symbol('tagStore');

export const $queryShadow = Symbol('queryShadow');
export const $serializeShadow = Symbol('serializeShadow');

export const $indexType = Symbol('indexType');
export const $indexBytes = Symbol('indexBytes');

export const $isEidType = Symbol('isEidType');

interface Store {
  [$storeRef]: symbol;
  [$storeSize]: number;
  [$storeMaps]: any;
  [$storeFlattened]: any[];
  [$storeBase]: () => Store;
  [$storeType]: Type;
  [$storeArrayElementCounts]: any;
  [$storeSubarrays]: any;
  [$subarrayCursors]: any;
  [$tagStore]: boolean;
  [$parentArray]: any;
  [key: string]: any;
}

const stores: Partial<Store> = {};

// const alloc = createAllocator()

export const resize = (ta: any, size: number): ArrayBufferView => {
  const newBuffer = new ArrayBuffer(size * ta.BYTES_PER_ELEMENT);
  const newTa = new ta.constructor(newBuffer);
  newTa.set(ta, 0);
  return newTa;
};

export const createShadow = (store: any, key: any) => {
  if (!ArrayBuffer.isView(store)) {
    const shadowStore = store[$parentArray].slice(0);
    store[key] = store.map((_: any, eid: Entity) => {
      const { length } = store[eid];
      const start = length * eid;
      const end = start + length;
      return shadowStore.subarray(start, end);
    });
  } else {
    (store as any)[key] = (store as any).slice(0) as any;
  }
};

const resizeSubarray = (metadata: any, store: any, storeSize: number) => {
  const cursors = metadata[$subarrayCursors];
  let type: Type = store[$storeType];
  const length = store[0].length;
  const indexType: Type =
    length <= UNSIGNED_MAX.uint8 ? TYPES_ENUM.ui8 : length <= UNSIGNED_MAX.uint16 ? TYPES_ENUM.ui16 : TYPES_ENUM.ui32;

  if (cursors[type] === 0) {
    const arrayElementCount = metadata[$storeArrayElementCounts][type];

    // // for threaded impl
    // // const summedBytesPerElement = Array(arrayCount).fill(0).reduce((a, p) => a + TYPES[type].BYTES_PER_ELEMENT, 0)
    // // const totalBytes = roundToMultiple4(summedBytesPerElement * summedLength * size)
    // // const buffer = new SharedArrayBuffer(totalBytes)

    let array = new TYPES[type](roundToMultiple4(arrayElementCount * storeSize));

    array.set(metadata[$storeSubarrays][type]);

    metadata[$storeSubarrays][type] = Object.assign(array, {
      [$indexType]: TYPES_NAMES[indexType],
      [$indexBytes]: TYPES[indexType].BYTES_PER_ELEMENT
    });
  }

  const start = cursors[type];
  const end = start + storeSize * length;
  cursors[type] = end;

  store[$parentArray] = metadata[$storeSubarrays][type].subarray(start, end);

  // pre-generate subarrays for each eid
  for (let eid = 0; eid < storeSize; eid++) {
    const start = length * eid;
    const end = start + length;
    store[eid] = store[$parentArray].subarray(start, end);
    store[eid][$indexType] = TYPES_NAMES[indexType];
    store[eid][$indexBytes] = TYPES[indexType].BYTES_PER_ELEMENT;
    store[eid][$subarray] = true;
  }
};

const resizeRecursive = (metadata: any, store: Store, size: number) => {
  for (const key of Object.keys(store)) {
    const ta = store[key];

    if (Array.isArray(ta)) {
      resizeSubarray(metadata, ta, size);
      store[$storeFlattened].push(ta);
    } else if (ArrayBuffer.isView(ta)) {
      store[key] = resize(ta, size);
      store[$storeFlattened].push(store[key]);
    } else if (typeof ta === 'object') {
      resizeRecursive(metadata, store[key], size);
    }
  }
};

export const resizeStore = (store: Store, size: number) => {
  if (store[$tagStore]) return;
  store[$storeSize] = size;
  store[$storeFlattened].length = 0;
  Object.keys(store[$subarrayCursors]).forEach((k) => {
    store[$subarrayCursors][k] = 0;
  });
  resizeRecursive(store, store, size);
};

export const resetStore = (store: Store) => {
  if (store[$storeFlattened]) {
    for (const ta of store[$storeFlattened]) {
      ta.fill(0);
    }
    for (const key of Object.keys(store[$storeSubarrays])) {
      store[$storeSubarrays][key].fill(0);
    }
  }
};

export const resetStoreFor = (store: Store, eid: Entity) => {
  if (store[$storeFlattened]) {
    for (const ta of store[$storeFlattened]) {
      if (ArrayBuffer.isView(ta)) {
        // @ts-ignore
        ta[eid] = 0;
      } else {
        ta[eid].fill(0);
      }
    }
  }
};

const createTypeStore = (type: Type, length: number) => {
  const totalBytes = length * TYPES[type].BYTES_PER_ELEMENT;
  const buffer = new ArrayBuffer(totalBytes);
  const store = new TYPES[type](buffer);
  // @ts-ignore
  store[$isEidType] = type === TYPES_ENUM.eid;
  return store;
};

export const parentArray = (store: Store) => store[$parentArray];

// @ts-ignore
const createArrayStore = (metadata, type, length) => {
  const storeSize = metadata[$storeSize];
  const store = Array(storeSize).fill(0);
  // @ts-ignore
  store[$storeType] = type;
  // @ts-ignore
  store[$isEidType] = type === TYPES_ENUM.eid;

  const cursors = metadata[$subarrayCursors];
  const indexType =
    length <= UNSIGNED_MAX.uint8 ? TYPES_ENUM.ui8 : length <= UNSIGNED_MAX.uint16 ? TYPES_ENUM.ui16 : TYPES_ENUM.ui32;

  if (!length) throw new Error('bitECS - Must define component array length');
  // @ts-ignore
  if (!TYPES[type]) throw new Error(`bitECS - Invalid component array property type ${type}`);

  // create buffer for type if it does not already exist
  if (!metadata[$storeSubarrays][type]) {
    const arrayElementCount = metadata[$storeArrayElementCounts][type];

    // for threaded impl
    // const summedBytesPerElement = Array(arrayCount).fill(0).reduce((a, p) => a + TYPES[type].BYTES_PER_ELEMENT, 0)
    // const totalBytes = roundToMultiple4(summedBytesPerElement * summedLength * size)
    // const buffer = new SharedArrayBuffer(totalBytes)

    // @ts-ignore
    const array = new TYPES[type](roundToMultiple4(arrayElementCount * storeSize));
    array[$indexType] = TYPES_NAMES[indexType];
    array[$indexBytes] = TYPES[indexType].BYTES_PER_ELEMENT;

    metadata[$storeSubarrays][type] = array;
  }

  const start = cursors[type];
  const end = start + storeSize * length;
  cursors[type] = end;

  // @ts-ignore
  store[$parentArray] = metadata[$storeSubarrays][type].subarray(start, end);

  // pre-generate subarrays for each eid
  for (let eid = 0; eid < storeSize; eid++) {
    const start = length * eid;
    const end = start + length;
    // @ts-ignore
    store[eid] = store[$parentArray].subarray(start, end);
    store[eid][$indexType] = TYPES_NAMES[indexType];
    store[eid][$indexBytes] = TYPES[indexType].BYTES_PER_ELEMENT;
    store[eid][$subarray] = true;
  }

  return store;
};

const isArrayType = (x: unknown): x is Array<any> =>
  Array.isArray(x) && typeof x[0] === 'string' && typeof x[1] === 'number';

export const createStore = (schema: any, size: number) => {
  const $store = Symbol('store');

  if (!schema || !Object.keys(schema).length) {
    // tag component
    (stores as any)[$store] = {
      [$storeSize]: size,
      [$tagStore]: true,
      [$storeBase]: () => (stores as any)[$store]
    };
    return (stores as any)[$store];
  }

  schema = structuredClone(schema);

  const arrayElementCounts = {};
  // @ts-ignore
  const collectArrayElementCounts = (s) => {
    const keys = Object.keys(s);
    for (const k of keys) {
      if (isArrayType(s[k])) {
        // @ts-ignore
        if (!arrayElementCounts[s[k][0]]) {
          // @ts-ignore
          arrayElementCounts[s[k][0]] = 0;
        }
        // @ts-ignore
        arrayElementCounts[s[k][0]] += s[k][1];
      } else if (s[k] instanceof Object) {
        collectArrayElementCounts(s[k]);
      }
    }
  };
  collectArrayElementCounts(schema);

  const metadata = {
    [$storeSize]: size,
    [$storeMaps]: {},
    [$storeSubarrays]: {},
    [$storeRef]: $store,
    [$subarrayCursors]: Object.keys(TYPES).reduce((a, type) => ({ ...a, [type]: 0 }), {}),
    [$storeFlattened]: [],
    [$storeArrayElementCounts]: arrayElementCounts
  };

  if (schema instanceof Object && Object.keys(schema).length) {
    const recursiveTransform = (a: any, k: any) => {
      if (typeof a[k] === 'string') {
        a[k] = createTypeStore(a[k], size);
        a[k][$storeBase] = () => (stores as any)[$store];
        // @ts-ignore
        metadata[$storeFlattened].push(a[k]);
      } else if (isArrayType(a[k])) {
        const [type, length] = a[k];
        a[k] = createArrayStore(metadata, type, length);
        // @ts-ignore
        a[k][$storeBase] = () => stores[$store];
        // @ts-ignore
        metadata[$storeFlattened].push(a[k]);
        // Object.seal(a[k])
      } else if (a[k] instanceof Object) {
        a[k] = Object.keys(a[k]).reduce(recursiveTransform, a[k]);
        // Object.seal(a[k])
      }

      return a;
    };

    (stores as any)[$store] = Object.assign(Object.keys(schema).reduce(recursiveTransform, schema), metadata);
    (stores as any)[$store][$storeBase] = () => (stores as any)[$store];

    // Object.seal(stores[$store])

    return (stores as any)[$store];
  }
};

export const free = (store: Store) => {
  delete (stores as any)[store[$storeRef]];
};
