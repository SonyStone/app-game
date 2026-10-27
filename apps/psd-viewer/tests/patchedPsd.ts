// Copies of the bundled examples with one setting changed, made at test time.

/**
 * A copy of `bytes` whose last Normal layer record, the topmost, takes the blend-mode key `key`, a four-character
 * code such as `mul `.
 */
export function withTopBlendKey(bytes: ArrayBuffer, key: string): ArrayBuffer {
  const patched = new Uint8Array(bytes.slice(0));
  // windows-1252 decodes every byte to one character, so string indices are byte offsets.
  const at = new TextDecoder('latin1').decode(patched).lastIndexOf('8BIMnorm');
  patched.set(new TextEncoder().encode(key), at + 4);
  return patched.buffer;
}

/** Gives the flat-writer top record a modern version, avoiding Photoshop's historical Fill reinterpretation. */
export function withModernTop(bytes: Uint8Array): ArrayBuffer {
  const input = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let at = 26;
  at += 4 + input.getUint32(at);
  at += 4 + input.getUint32(at);
  const section = at;
  const layerInfo = at + 4;
  at += 8;
  const count = Math.abs(input.getInt16(at));
  at += 2;
  let extra = 0;
  for (let i = 0; i < count; i++) {
    at += 16;
    const channels = input.getUint16(at);
    at += 2 + channels * 6 + 12;
    extra = at;
    at += 4 + input.getUint32(at);
  }
  const output = new Uint8Array(bytes.length + 16);
  output.set(bytes.subarray(0, at));
  output.set([56, 66, 73, 77, 108, 121, 118, 114, 0, 0, 0, 4, 0, 0, 0, 70], at);
  output.set(bytes.subarray(at), at + 16);
  const view = new DataView(output.buffer);
  for (const offset of [section, layerInfo, extra]) {
    view.setUint32(offset, input.getUint32(offset) + 16);
  }
  return output.buffer;
}

/** Appends one tagged block to the top flat-writer record, preserving all enclosing section lengths. */
export function withTopBlock(bytes: Uint8Array, key: string, data: Uint8Array): Uint8Array<ArrayBuffer> {
  return withLayerBlock(bytes, key, data);
}

/** Adds a tagged block to a flat-writer record by bottom-to-top position; omission selects the top record. */
export function withLayerBlock(
  bytes: Uint8Array,
  key: string,
  data: Uint8Array,
  index?: number
): Uint8Array<ArrayBuffer> {
  const input = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let at = 26;
  at += 4 + input.getUint32(at);
  at += 4 + input.getUint32(at);
  const section = at;
  const layerInfo = at + 4;
  at += 8;
  const count = Math.abs(input.getInt16(at));
  at += 2;
  let extra = 0;
  for (let i = 0; i < (index === undefined ? count : index + 1); i++) {
    at += 16;
    const channels = input.getUint16(at);
    at += 2 + channels * 6 + 12;
    extra = at;
    at += 4 + input.getUint32(at);
  }
  const block = new Uint8Array(12 + data.length + (data.length % 2));
  block.set(new TextEncoder().encode(`8BIM${key}`));
  new DataView(block.buffer).setUint32(8, data.length);
  block.set(data, 12);
  const result = new Uint8Array(bytes.length + block.length);
  result.set(bytes.subarray(0, at));
  result.set(block, at);
  result.set(bytes.subarray(at), at + block.length);
  const output = new DataView(result.buffer);
  for (const offset of [section, layerInfo, extra]) {
    output.setUint32(offset, input.getUint32(offset) + block.length);
  }
  return result;
}
