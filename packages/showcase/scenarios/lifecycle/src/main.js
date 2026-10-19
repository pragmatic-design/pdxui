// The lifecycle scenario's host (#269): a mock transport that counts requests by path, a counter of
// document.title writes, and `window.__lc` — the probe the spec reads and drives.
import { invalidate } from '@pdxui/core';
import { navigate } from '@pdxui/router';
import { lc } from './probe';
import './lc-app.pdx';
import './lc-view-a.pdx';
import './lc-view-b.pdx';

window.fetch = async (input) => {
    const path = new URL(typeof input === 'string' ? input : input.url, location.href).pathname;
    lc.requests[path] = (lc.requests[path] ?? 0) + 1;
    return new Response(JSON.stringify(`${path} #${lc.requests[path]}`), { headers: { 'content-type': 'application/json' } });
};

// The title's text node is replaced on every write: one mutation each.
new MutationObserver(() => { lc.titleWrites++; })
    .observe(document.querySelector('title'), { childList: true, characterData: true, subtree: true });

window.__lc = lc;
window.__go = (path) => navigate(path);
window.__invalidate = (tags) => invalidate(tags);
window.__newWait = () => lc.wait.set(new Promise(() => {}));
window.__ready = true;
