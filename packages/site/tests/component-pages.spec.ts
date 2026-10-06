/**
 * Every component page on the built site must load without the browser complaining.
 *
 * A page of the published site can serve broken JavaScript that nothing else in the repository sees
 * — a `ReferenceError` from a generated binding, a `HierarchyRequestError` from an `insertBefore` —
 * and a page that throws is not merely erroring, it can be TRUNCATED: a few of its sections rendered,
 * and it looks fine to anyone not scrolling. `pnpm test` does not touch `packages/site`; `certify`
 * measures components in isolation, not pages; and a module that still PARSES is a successful build.
 * The causes have contract tests in their own packages; this is the net that catches them here.
 *
 * The page list comes from `packages/ui/custom-elements.json`, so it cannot drift from the library:
 * a component added tomorrow is tested tomorrow, with no fixture to remember to update.
 */
import { test, expect, type ConsoleMessage, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { unstyledScaffolding } from './scaffolding';

interface Decl { tagName: string }

const manifestUrl = new URL('../../ui/custom-elements.json', import.meta.url);
const manifest = JSON.parse(readFileSync(manifestUrl, 'utf8')) as {
    modules: { declarations: Decl[] }[];
};
const tags = manifest.modules.map(m => m.declarations?.[0]).filter(Boolean).map(d => d.tagName);

/**
 * Floors measured across all 112 pages: the thinnest page is `overlay-outlet` at 1454 characters
 * and 3 sections.
 *
 * These catch a page that renders nothing while throwing nothing — a route that resolves into an
 * empty shell. They deliberately do NOT catch truncation: a truncated carousel still has 2492
 * characters and 3 sections, comfortably above any floor that all 112 pages can clear. Truncation
 * is caught by the page-error assertion, which is where it shows. A floor that passes is not a page
 * that is whole.
 */
const MIN_TEXT = 1200;
const MIN_SECTIONS = 3;

interface Complaints {
    pageErrors: string[];
    consoleErrors: string[];
    failedOwnRequests: string[];
    foreignImages: string[];
}

/**
 * Collect what the browser objects to, and every image the page asks another host for.
 *
 * Forgiving any failed request that is not ours — so as not to fail on a machine without DNS for a
 * third-party host — is right for a check about our code, and it also hides the dependency itself:
 * someone else's uptime and privacy terms, and empty frames offline. The images are served by the
 * site, and an image from another host is a defect. A JavaScript exception is always one.
 */
function watch(page: Page, origin: string): Complaints {
    const c: Complaints = { pageErrors: [], consoleErrors: [], failedOwnRequests: [], foreignImages: [] };
    page.on('pageerror', e => c.pageErrors.push(String(e).slice(0, 200)));
    page.on('console', (m: ConsoleMessage) => {
        if (m.type() !== 'error') return;
        // A resource that failed to load is a request: ours show up in failedOwnRequests, and the
        // image galleries break one on purpose, against a missing file of this site.
        if (/Failed to load resource/i.test(m.text())) return;
        c.consoleErrors.push(m.text().slice(0, 200));
    });
    // `blob:` is the page's own: the image gallery's fetch-fn demos hand pdx-image a blob URL.
    page.on('request', r => {
        const url = r.url();
        if (r.resourceType() === 'image' && !/^(data|blob):/.test(url) && !url.startsWith(origin)) c.foreignImages.push(url);
    });
    page.on('requestfailed', r => {
        if (r.url().startsWith(origin)) c.failedOwnRequests.push(`${r.url()} — ${r.failure()?.errorText}`);
    });
    return c;
}

/**
 * The router's elements have pages too: the site reads every component package's
 * manifest, not only the library's. They render only inside the app's router, so the page is the API —
 * no live demo, no playground.
 */
test.describe('the router\'s elements', () => {
    for (const [tag, attrs] of [['pdx-link', ['to', 'exact', 'active-class', 'prefetch', 'params']], ['pdx-router-outlet', ['name']]] as const) {
        test(`/components/${tag}: its page, with its attribute table`, async ({ page, baseURL }) => {
            const c = watch(page, baseURL!);
            await page.goto(`/components/${tag}`, { waitUntil: 'networkidle' });
            await expect(page.locator('.cmp-tag')).toHaveText(`<${tag}>`);
            await expect(page.locator('.cmp-summary')).not.toBeEmpty();
            const names = page.locator('#api .api td:first-child');
            await expect.poll(() => names.allTextContents().then(t => t.map(s => s.trim())), 'the attribute table').toEqual(expect.arrayContaining([...attrs]));
            await expect(page.locator('#playground')).toHaveCount(0);
            // Its site-authored gallery (src/demos-authored/), not the placeholder.
            await expect(page.locator(`.cmp-gallery pdx-comp-${tag.slice(4)} section`).first()).toBeVisible();
            await expect(page.locator('.cmp-placeholder')).toHaveCount(0);
            // It is listed in the component list, under its category.
            await expect(page.locator(`.cmp-nav-link[href="/components/${tag}"]`)).toHaveCount(1);
            expect(c.pageErrors, `${tag} threw`).toEqual([]);
            expect(c.consoleErrors, `${tag} logged an error`).toEqual([]);
        });
    }
});

test.describe('every component page loads', () => {
    test('the manifest lists components to test', () => {
        // Without this, an empty or unreadable manifest would make the whole file pass by running
        // no tests at all — green, and measuring nothing.
        expect(tags.length, 'the manifest documents no components').toBeGreaterThan(100);
    });

    for (const tag of tags) {
        const short = tag.replace(/^pdx-/, '');
        test(`${short} — no page error, and something on the page`, async ({ page, baseURL }) => {
            const c = watch(page, baseURL!);

            await page.goto(`/components/${tag}`, { waitUntil: 'networkidle' });
            // The page mounts its gallery lazily; give the outlet a beat to put it in the DOM.
            await expect(page.locator('pdx-router-outlet > *')).toHaveCount(1);
            await page.waitForTimeout(500);

            const seen = await page.evaluate(() => {
                const main = document.querySelector('main') ?? document.body;
                // A form field that adds its own margin inside a parent that already spaces its
                // children with a gap: the two add up. A field leaves --pdx-form-field-gap below
                // itself except in the design system's containers, so a demo's own gap container
                // doubles the distance (14px becomes 30).
                const doubled: string[] = [];
                for (const field of document.querySelectorAll<HTMLElement>('main pdx-form-field')) {
                    const parent = field.parentElement;
                    if (!parent || !field.nextElementSibling) continue;
                    const ps = getComputedStyle(parent);
                    const stacks = ps.display.includes('grid')
                        || (ps.display.includes('flex') && ps.flexDirection.startsWith('column'));
                    const gap = parseFloat(ps.rowGap) || 0;
                    const margin = parseFloat(getComputedStyle(field).marginBlockEnd) || 0;
                    if (stacks && gap > 0 && margin > 0) {
                        doubled.push(`${parent.tagName.toLowerCase()}${parent.className ? '.' + String(parent.className).trim().split(/\s+/).join('.') : ''} (gap ${gap}px + margin ${margin}px)`);
                    }
                }
                return {
                    sections: document.querySelectorAll('main section, .cmp-gallery section').length,
                    textLength: (main as HTMLElement).innerText.replace(/\s+/g, ' ').trim().length,
                    doubled: [...new Set(doubled)],
                };
            });

            expect(c.pageErrors, `${short} threw`).toEqual([]);
            expect(c.consoleErrors, `${short} logged an error`).toEqual([]);
            expect(c.failedOwnRequests, `${short} asked this site for something it does not serve`).toEqual([]);
            expect(c.foreignImages, `${short} loads images from another host`).toEqual([]);
            expect(seen.sections, `${short} rendered ${seen.sections} sections`).toBeGreaterThanOrEqual(MIN_SECTIONS);
            expect(seen.textLength, `${short} rendered ${seen.textLength} characters`).toBeGreaterThanOrEqual(MIN_TEXT);
            expect(seen.doubled, `${short}: form fields spaced twice, by the container's gap and their own margin`).toEqual([]);
            // The API section renders inline code as code: no backtick left in a cell.
            const backticked = await page.locator('.api td').evaluateAll((tds) => tds.map((td) => td.textContent ?? '').filter((t) => t.includes('`')));
            expect(backticked, `${short}: API descriptions with literal backticks`).toEqual([]);
            // The demo scaffolding is styled — Reference tables, grids, cards.
            expect(await page.evaluate(unstyledScaffolding), `${short}: demo scaffolding with the browser's default style`).toEqual([]);
            // A real demo: not the "being finalized" placeholder, and not the last-resort hero — the
            // element with its own name as its only content, `<pdx-x>x</pdx-x>`.
            await expect(page.locator('.cmp-placeholder'), `${short}: the "demos are being finalized" placeholder`).toHaveCount(0);
            const heroCode = await page.locator('#overview pdx-demo').evaluateAll((els) => els.map((e) => (e as HTMLElement & { code?: string }).code ?? ''));
            expect(heroCode, `${short}: the demo is the bare element`).not.toContain(`<${tag}>${short}</${tag}>`);
        });
    }
});
