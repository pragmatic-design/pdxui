// The network the first-paint specs measure on, and how they read a route's Largest Contentful
// Paint. Shared by `first-paint.spec.ts` (the preview server, HTTP/1.1) and
// `first-paint-http2.spec.ts` (the same build over TLS, HTTP/2), so the two numbers are one
// measurement on two protocols.
import { expect, type Page } from './fixture';

/** Slow 4G, the profile Lighthouse throttles to: 1.6 Mbps down, 150 ms RTT. */
export const SLOW_4G = {
    offline: false,
    downloadThroughput: (1.6 * 1024 * 1024) / 8,
    uploadThroughput: (750 * 1024) / 8,
    latency: 150,
    connectionType: 'cellular4g' as const,
};

export async function throttle(page: Page): Promise<void> {
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Network.enable');
    await cdp.send('Network.emulateNetworkConditions', SLOW_4G);
}

export interface Lcp {
    /** The last `largest-contentful-paint` entry's time, before any input. */
    ms: number;
    /** What the element is, for the log and the failure. */
    element: string;
    /** Whether the element is inside the route's page root. */
    insidePage: boolean;
}

/** A cold load of `route`, throttled, and its LCP once the page has settled. */
export async function lcpOf(page: Page, route: string, root: string): Promise<Lcp> {
    await page.addInitScript(() => {
        const w = window as unknown as { __lcp?: { startTime: number; element: Element | null } };
        new PerformanceObserver((list) => {
            const entries = list.getEntries() as (PerformanceEntry & { element: Element | null })[];
            const last = entries[entries.length - 1];
            if (last) w.__lcp = { startTime: last.startTime, element: last.element };
        }).observe({ type: 'largest-contentful-paint', buffered: true });
    });
    await throttle(page);
    await page.goto(route, { waitUntil: 'load' });
    await expect(page.locator(`[data-test="${root}"]`)).toBeVisible({ timeout: 30_000 });
    // Settled: a later, larger paint replaces the entry, and LCP stops at the first input.
    await page.waitForTimeout(1_500);
    return page.evaluate((rootTest) => {
        const lcp = (window as unknown as { __lcp?: { startTime: number; element: Element | null } }).__lcp;
        if (!lcp) return { ms: -1, element: 'none', insidePage: false };
        const el = lcp.element;
        const pageRoot = document.querySelector(`[data-test="${rootTest}"]`);
        const describe = (e: Element | null): string => {
            if (!e) return 'an element no longer in the page';
            const test = e.closest('[data-test]')?.getAttribute('data-test');
            return `<${e.tagName.toLowerCase()}>${test ? ` in [data-test="${test}"]` : ''} "${(e.textContent ?? '').trim().slice(0, 40)}"`;
        };
        return { ms: Math.round(lcp.startTime), element: describe(el), insidePage: !!(el && pageRoot && pageRoot.contains(el)) };
    }, root);
}
