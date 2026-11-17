// The browser entry: what `https://unpkg.com/@pdxui/ui` serves, through the `unpkg` field (#1163).
//
// A page with no bundler cannot load the library's own modules: they import @pdxui/core and their
// stylesheets by bare name. This entry is built on its own (vite.config.browser.ts) with core bundled
// in and no stylesheet imported — the page links @pdxui/design's single sheet, which carries every
// component's styles. Importing it registers every <pdx-*>.
//
// It re-exports core's API, so a page that also needs `signal` or `html` takes it from here: a second
// copy of core from another URL would keep a registry and a reactive graph of its own.
export * from '@pdxui/core';
export * from './index';
