// Cloudflare Web Analytics, on pdxui.com only.
//
// The beacon is the snippet Cloudflare gives, added from here rather than written into index.html:
// written there it would also run in `vite dev`, in `vite preview` and in the site's Playwright suite, which
// test a real build — localhost visits in the analytics, and a network request no test asked for.
// The CSP in public/web.config allows the beacon's two hosts by name.

const HOST = 'pdxui.com';
const BEACON = 'https://static.cloudflareinsights.com/beacon.min.js';
const TOKEN = 'bee9003c93894465ab2b9d8397939622';

/** Add the beacon when the page is served from pdxui.com; anywhere else, nothing. */
export function installAnalytics(hostname: string = location.hostname): HTMLScriptElement | null {
    if (hostname !== HOST) return null;
    const script = document.createElement('script');
    script.type = 'module';
    script.src = BEACON;
    script.setAttribute('data-cf-beacon', JSON.stringify({ token: TOKEN }));
    document.body.appendChild(script);
    return script;
}
