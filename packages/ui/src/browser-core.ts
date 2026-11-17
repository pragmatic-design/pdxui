// Core's API for a page that loads components one module at a time from a CDN (#1163):
// `dist/browser/core.js`. The browser build gives this entry, `pdx-ui.js` and every component module
// one shared chunk of core, so a page that takes `signal` from here and `<pdx-button>` from
// `button/pdx-button.js` still has one core.
export * from '@pdxui/core';
