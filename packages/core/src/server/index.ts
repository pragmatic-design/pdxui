// Rendering to a string, for static generation (#160): `@pdxui/core/server`. Kept out of the barrel,
// so that a client bundle carries none of it.
//
// In Node, the server DOM goes first, from its own entry, and only then is anything of core imported
// — this entry, the app's modules — because `PdxElement` extends the `HTMLElement` it finds when its
// module is evaluated:
//
//   const { installServerDom } = await import('@pdxui/core/server-dom');
//   installServerDom();
//   const { renderToString } = await import('@pdxui/core/server');
//   const html = renderToString(() => html`<app-shell></app-shell>`);
//
// That is why `installServerDom` is not exported here: importing this entry has already evaluated
// `PdxElement`, so a shim installed from it would come too late.

export { renderToString, renderToStringWithReport, registerServerElement, type ServerRender, type SkippedComponent } from './render-string';
export { serverElement, type ServerElement } from './mode';
export type { ServerHead } from './render-string';
