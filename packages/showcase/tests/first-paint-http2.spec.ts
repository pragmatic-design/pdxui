/**
 * The same three routes as `first-paint.spec.ts`, over HTTP/2: the number a real host gives (#407).
 *
 * The suite's preview server speaks HTTP/1.1, and a browser opens six connections to it: a route
 * whose first screen needs fifty modules waits for them six at a time, one round trip per batch. A
 * production host serving HTTP/2 multiplexes them on one connection. Measured on the same build,
 * `/tickets` painted at 2.93 s over HTTP/1.1 and at 1.95 s over HTTP/2, so a budget held only on
 * HTTP/1.1 holds the test server more than the app. Both are held: this one is the target, the
 * HTTP/1.1 one the second, looser number.
 *
 * The server is Vite's own preview of the suite's build, over TLS, which Vite serves as HTTP/2 —
 * the same `dist`, the same mock API. The certificate is made for the run, self-signed, with
 * `openssl` (on the CI runners and in Git for Windows), into `test-results/`. Every resource is
 * checked to have come over `h2`: a server that fell back to HTTP/1.1 would measure the other spec
 * again under this one's name.
 */
import { test, expect, type Browser } from './fixture';
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { preview, type PreviewServer } from 'vite';
import { lcpOf } from './lcp';

const PORT = 5313;
const ORIGIN = `https://localhost:${PORT}`;
const PACKAGE = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const CERT_DIR = join(PACKAGE, 'test-results', '.h2-cert');

/**
 * Each budget is the highest measurement + 10%, rounded up to 50 ms, as in `first-paint.spec.ts`.
 * A budget of null is reported and not held. Measured 2026-10-16, slow 4G, cold, locally: three
 * runs of this spec alone, and one beside the HTTP/1.1 spec with four workers, which is the load
 * the pre-push gate puts it under.
 *
 *                 alone (three runs)        four workers     budget
 *   /             932, 936, 944 ms          940 ms           1050 ms
 *   /tickets      1976, 1984, 1992 ms       2220 ms          2450 ms
 *   /tickets/1    1356, 1364, 1408 ms       1360 ms          1550 ms
 *
 * `/tickets` meets #407's 2.0 s on its own; the budget leaves room for the gate's load, as the
 * HTTP/1.1 ones do.
 */
const LCP_ROUTES: { route: string; root: string; budgetMs: number | null }[] = [
    { route: '/', root: 'dashboard', budgetMs: 1050 },
    { route: '/tickets', root: 'tickets', budgetMs: 2450 },
    { route: '/tickets/1', root: 'ticket', budgetMs: 1550 },
];

/** A self-signed certificate for localhost, for this run only. */
function makeCertificate(): { key: Buffer; cert: Buffer } {
    mkdirSync(CERT_DIR, { recursive: true });
    const key = join(CERT_DIR, 'key.pem');
    const cert = join(CERT_DIR, 'cert.pem');
    execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-days', '1',
        '-subj', '/CN=localhost', '-keyout', key, '-out', cert], {
        stdio: 'ignore',
        // Git for Windows' openssl would rewrite `/CN=localhost` as a Windows path.
        env: { ...process.env, MSYS_NO_PATHCONV: '1' },
    });
    return { key: readFileSync(key), cert: readFileSync(cert) };
}

/** A context signed in the way the suite's is (`session.ts`), against this server. */
async function signedIn(browser: Browser) {
    const context = await browser.newContext({ baseURL: ORIGIN, ignoreHTTPSErrors: true, locale: 'en-US' });
    const res = await context.request.post('/api/auth/login', { data: { username: 'admin', password: 'pdx' } });
    expect(res.ok(), `the suite could not sign in over HTTP/2: ${res.status()}`).toBe(true);
    const { access, refresh } = await res.json() as { access: string; refresh: string | null };
    await context.addInitScript(([a, r]) => {
        localStorage.setItem('showcase.auth', JSON.stringify({ access: a, refresh: r }));
    }, [access, refresh] as const);
    return context;
}

test.describe('each route\'s main content paints within its budget, over HTTP/2', () => {
    // One server for the group, on one port: the cases run one after another in one worker.
    test.describe.configure({ mode: 'serial' });
    let server: PreviewServer;

    test.beforeAll(async () => {
        server = await preview({
            root: PACKAGE,
            configFile: join(PACKAGE, 'vite.config.ts'),
            logLevel: 'warn',
            preview: { port: PORT, strictPort: true, https: makeCertificate() },
        });
    });

    test.afterAll(async () => {
        await server?.close();
    });

    for (const { route, root, budgetMs } of LCP_ROUTES) {
        test(`LCP of ${route} over HTTP/2 is inside its page, and within its budget`, async ({ browser }) => {
            const context = await signedIn(browser);
            const page = await context.newPage();
            const lcp = await lcpOf(page, route, root);
            const protocols = await page.evaluate(() => [...new Set(
                (performance.getEntriesByType('resource') as PerformanceResourceTiming[]).map((e) => e.nextHopProtocol))]);
            await context.close();

            console.log(`[first-paint] slow 4G, HTTP/2, LCP ${route}: ${lcp.ms}ms (${lcp.element})${budgetMs === null ? ' — no budget yet' : ` against ${budgetMs}ms`}`);
            expect(protocols, `the resources did not all come over HTTP/2: ${protocols.join(', ')}`).toEqual(['h2']);
            expect(lcp.ms, `no largest-contentful-paint entry for ${route}`).toBeGreaterThan(0);
            expect(lcp.insidePage, `the LCP of ${route} is ${lcp.element}, not inside [data-test="${root}"]: it measures the shell, not the page`)
                .toBe(true);
            if (budgetMs !== null) {
                expect(lcp.ms, `the LCP of ${route} over HTTP/2 is ${lcp.ms}ms against a ${budgetMs}ms budget`).toBeLessThanOrEqual(budgetMs);
            }
        });
    }
});
