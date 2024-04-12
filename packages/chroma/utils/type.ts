interface ToStringType {
  '[object Object]': 'object';
  '[object Boolean]': 'boolean';
  '[object Number]': 'number';
  '[object String]': 'string';
  '[object Function]': 'function';
  '[object Array]': 'array';
  '[object Date]': 'date';
  '[object RegExp]': 'regexp';
  '[object Undefined]': 'undefined';
  '[object Null]': 'null';
}

const classToType: ToStringType = {} as ToStringType;
for (let name of [
  'Boolean',
  'Number',
  'String',
  'Function',
  'Array',
  'Date',
  'RegExp',
  'Undefined',
  'Null',
  'Object'
]) {
  (classToType as any)[`[object ${name}]`] = name.toLowerCase();
}

function toString(obj: any) {
  return Object.prototype.toString.call(obj) as keyof ToStringType;
}

export function type(obj?: any) {
  return classToType[toString(obj)] || 'object';
}
