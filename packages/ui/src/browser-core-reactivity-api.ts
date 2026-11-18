// Core's reactivity for a page that loads components one module at a time from a CDN (#1203):
// `dist/browser/core/reactivity.js`. It costs what it uses, where `core.js` is all of core's API, and
// it shares the browser build's one core with every component module and with `core.js`.
export * from '@pdxui/core/reactivity';
