declare module '*?ArrayBuffer' {
  const value: () => Promise<ArrayBuffer>;

  export default value;
}

declare module '*?Uint32Array' {
  const value: () => Promise<Uint32Array>;

  export default value;
}

declare module '*?Float32Array' {
  const value: () => Promise<Float32Array>;

  export default value;
}