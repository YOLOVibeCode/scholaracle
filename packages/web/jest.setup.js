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
