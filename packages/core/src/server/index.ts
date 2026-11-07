// Rendering to a string, for static generation (#160): `@pdxui/core/server`. Kept out of the barrel,
// so that a client bundle carries none of it.
//
// In Node, install the server DOM first — before the app's modules are imported — then render:
//
//   installServerDom();
//   const { renderToString } = await import('@pdxui/core/server');
//   const html = renderToString(() => html`<app-shell></app-shell>`);

export { installServerDom } from './dom-shim';
export { renderToString, renderToStringWithReport, registerServerElement, type ServerRender, type SkippedComponent } from './render-string';
export { serverElement, type ServerElement } from './mode';
