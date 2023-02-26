const CORRECT = "Kaydara\u0020FBX\u0020Binary\u0020\u0020\0";

export function isFbxFormatBinary(buffer: Buffer) {
  return CORRECT === String.fromCharCode(...buffer.slice(0, CORRECT.length));
}
