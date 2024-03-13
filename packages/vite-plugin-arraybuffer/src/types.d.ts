declare module '*?ArrayBuffer' {
  const value: () => Promice<ArrayBuffer>;

  export default value;
}

declare module '*?Uint8Array' {
  const value: () => Promise<Uint8Array>;

  export default value;
}

declare module '*?Float32Array' {
  const value: () => Promise<Float32array>;

  export default value;
}
