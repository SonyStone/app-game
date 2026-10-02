import '@testing-library/jest-dom/vitest';

// jsdom has no ResizeObserver; layout is not computed there anyway.
globalThis.ResizeObserver ??= class {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
};
