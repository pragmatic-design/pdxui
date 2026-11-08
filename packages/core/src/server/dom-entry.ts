// `@pdxui/core/server-dom` (#160): the server DOM, installed before anything of core is imported —
// `PdxElement` extends the `HTMLElement` it finds when its module is evaluated. This entry and the
// module it re-exports import nothing of core; `server-dom-entry.test.ts` holds them to it.

export { installServerDom } from './dom-shim';
