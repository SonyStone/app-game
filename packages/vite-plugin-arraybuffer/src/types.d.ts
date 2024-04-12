declare module '*?ArrayBuffer' {
  const value: () => Promice<ArrayBuffer>;

  export default value;
}

declare module '*?Uint8Array' {
  const value: () => Promise<Uint8Array>;

  export default value;
}

declare module '*?Uint16Array' {
  const value: () => Promise<Uint8Array>;

  export default value;
}

declare module '*?Uint32Array' {
  const value: () => Promise<Uint32Array>;

  export default value;
}

declare module '*?Int32Array' {
  const value: () => Promise<Int32Array>;

  export default value;
}

declare module '*?Float32Array' {
  const value: () => Promise<Float32Array>;

  export default value;
}
