// The lifecycle fixture (tests/lifecycle.spec.ts): what the page records for the test to read.
//
// `fetch` is replaced before the components load: a request to /api/lc-never never answers, and its
// AbortSignal is kept, so the test can see it aborted when its component goes. The cache entry of the
// child's @fetch is seeded (stale, so it is refetched): a cache counts the subscribers of an entry
// that exists, and an unanswered first request would leave none to count.
// The two components are imported here, not found by the plugin's scan (src/ and pages/): the dev
// server says <app-lc-child> is unresolved in lc-parent.pdx, which is true of the scan and not of
// this page, where it is registered before the parent renders.
const lc = { signals: [], probe: [], field: undefined, core: null };
window.__lc = lc;
const realFetch = window.fetch.bind(window);
window.fetch = (input, init) => {
  if (String(input).includes('/api/lc-never')) {
    lc.signals.push(init?.signal);
    return new Promise(() => {});
  }
  return realFetch(input, init);
};

const core = await import('@pdxui/core');
lc.core = core;
core.getDefaultCache().set('GET:/api/lc-never', ['seeded'], { staleTime: -1 });
await import('./lc-child.pdx');
await import('./lc-parent.pdx');
