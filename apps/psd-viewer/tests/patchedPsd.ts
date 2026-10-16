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
