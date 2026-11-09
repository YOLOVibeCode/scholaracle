/**
 * jsdom does not always provide TextEncoder (used by studio-core fixture PDFs).
 */
const { TextEncoder, TextDecoder } = require('node:util');

if (typeof global.TextEncoder === 'undefined') {
  global.TextEncoder = TextEncoder;
}
if (typeof global.TextDecoder === 'undefined') {
  global.TextDecoder = TextDecoder;
}

/**
 * jsdom has no ResizeObserver; Radix form controls (Switch inside a <form>) measure themselves
 * with it. A no-op observer is enough for component tests.
 */
if (typeof global.ResizeObserver === 'undefined') {
  global.ResizeObserver = class ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}
