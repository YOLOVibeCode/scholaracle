/** Globals injected before every page function in the Hermes smoke harness. */
export const HERMES_BROWSER_PRELUDE = `
var __domNode = function() {
  return {
    textContent: '',
    innerHTML: '',
    children: [],
    childNodes: [],
    classList: { contains: function() { return false; } },
    className: '',
    getAttribute: function() { return null; },
    setAttribute: function() {},
    querySelector: function() { return null; },
    querySelectorAll: function() { return []; },
    click: function() {},
    getBoundingClientRect: function() {
      return { width: 0, height: 0, top: 0, left: 0, right: 0, bottom: 0 };
    }
  };
};
var document = {
  querySelector: function() { return null; },
  querySelectorAll: function() { return []; },
  body: __domNode(),
  documentElement: (function() {
    var el = __domNode();
    el.tagName = 'HTML';
    el.attributes = [];
    el.outerHTML = '<html></html>';
    return el;
  })(),
  open: function() {},
  write: function() {},
  close: function() {},
  dispatchEvent: function() {}
};
var KeyboardEvent = function(type, opts) {
  this.type = type;
  this.key = opts ? opts.key : '';
  this.keyCode = opts ? opts.keyCode : 0;
  this.bubbles = opts ? opts.bubbles : false;
};
var window = {
  document: document,
  location: { pathname: '/' },
  getComputedStyle: function() {
    return { display: 'none', visibility: 'hidden' };
  }
};
var fetch = function() {
  return Promise.resolve({
    ok: false,
    status: 404,
    headers: { get: function() { return null; } },
    arrayBuffer: function() { return Promise.resolve(new ArrayBuffer(0)); },
    json: function() { return Promise.resolve([]); }
  });
};
var btoa = function(s) { return s; };
var TextDecoder = function() { this.decode = function() { return ''; }; };
var AbortController = function() { this.signal = {}; this.abort = function() {}; };
var setTimeout = function(fn) { fn(); return 0; };
var clearTimeout = function() {};
var URL = function(u) { this.pathname = String(u); this.href = String(u); };
var crypto = {
  subtle: {
    digest: function() {
      return Promise.resolve(new Uint8Array(32).buffer);
    }
  }
};
var globalThis = { crypto: crypto };
var TextEncoder = function() {
  this.encode = function(text) {
    var out = [];
    for (var i = 0; i < text.length; i++) out.push(text.charCodeAt(i));
    return new Uint8Array(out);
  };
};
`;
