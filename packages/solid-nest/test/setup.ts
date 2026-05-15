import '@testing-library/jest-dom/vitest';

// Polyfill adoptedStyleSheets for jsdom (not supported natively)
if (typeof document !== 'undefined' && !document.adoptedStyleSheets) {
  Object.defineProperty(document, 'adoptedStyleSheets', {
    value: [],
    writable: true,
    configurable: true
  });
}
