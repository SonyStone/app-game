export function toFloat32Array(buffer: Uint16Array) {
  const result = new Float32Array(buffer.length);
  for (let i = 0; i < buffer.length; i++) {
    result[i] = buffer[i] / (buffer[i] >= 0 ? 32767 : 32768);
  }
  return result;
}
