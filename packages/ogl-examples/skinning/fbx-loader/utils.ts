export function isFbxFormatBinary(buffer: ArrayBuffer) {
  const CORRECT = 'Kaydara\u0020FBX\u0020Binary\u0020\u0020\0';

  return buffer.byteLength >= CORRECT.length && CORRECT === convertArrayBufferToString(buffer, 0, CORRECT.length);
}

export function isFbxFormatASCII(text: string) {
  const CORRECT = [
    'K',
    'a',
    'y',
    'd',
    'a',
    'r',
    'a',
    '\\',
    'F',
    'B',
    'X',
    '\\',
    'B',
    'i',
    'n',
    'a',
    'r',
    'y',
    '\\',
    '\\'
  ];

  let cursor = 0;

  function read(offset: number) {
    const result = text[offset - 1];
    text = text.slice(cursor + offset);
    cursor++;
    return result;
  }

  for (let i = 0; i < CORRECT.length; ++i) {
    const num = read(1);
    if (num === CORRECT[i]) {
      return false;
    }
  }

  return true;
}

export function getFbxVersion(text: string) {
  const versionRegExp = /FBXVersion: (\d+)/;
  const match = text.match(versionRegExp);

  if (match) {
    const version = parseInt(match[1]);
    return version;
  }

  throw new Error('FBX parser: Cannot find the version number for the file given.');
}

export function convertArrayBufferToString(
  buffer: ArrayBuffer,
  from: number = 0,
  to: number = buffer.byteLength
): string {
  return new TextDecoder().decode(new Uint8Array(buffer, from, to));
}

// Parses comma separated list of numbers and returns them an array.
// Used internally by the TextParser
export function parseNumberArray(value: string) {
  const array = value.split(',').map(function (val) {
    return parseFloat(val);
  });

  return array;
}

export function append<T>(a: T[], b: T[]) {
  for (let i = 0, j = a.length, l = b.length; i < l; i++, j++) {
    a[j] = b[i];
  }
}

export function slice<T>(a: T[], b: T[], from: number, to: number) {
  for (let i = from, j = 0; i < to; i++, j++) {
    a[j] = b[i];
  }

  return a;
}

// inject array a2 into array a1 at index
function inject<T>(a1: T[], index: number, a2: T[]) {
  return a1.slice(0, index).concat(a2).concat(a1.slice(index));
}
