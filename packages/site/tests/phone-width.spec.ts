/**
 * The site at phone width: nothing is cut off, everything is reachable, the page starts with itself.
 *
 * What goes wrong at 390 × 844 when the layout is not built for it:
 * - `/components/pdx-col` lays its single column out at 660 px. Under 1100 px a grid of `1fr`,
 *   which is `minmax(auto, 1fr)`, grows the track to the gallery's min-content width, and
 *   `overflow-x: clip` on html/body hides the right 270 px of every demo with no way to scroll to it.
 * - The header links run to x = 778: Components, Design, Playground, Integration, Search and Builder
 *   cannot be reached.
 * - The 120-link component list wraps into rows ABOVE the content: the title comes after a screen
 *   and a half of links.
 *
 * `overflow-x: clip` is why nothing notices: a page that clips never scrolls sideways, so it looks
 * fine until you look for what is missing. The checks below measure what is missing.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { test, expect, type Page } from './fixture';
import { discoverComponentPackages } from '../../compiler/src/discover-component-packages.mjs';
import { LIBRARY_TAGS } from './library-tags';
import { PHONE, expectFitsPhone, settledAtPhone } from './phone-checks';

// Every route of the site: a hand-picked handful misses the pages that run past the edge. The pages
// come from the sources the site builds them from: every component package's manifest (the router's
// too), and the showcase's design pages. A library component's page is measured by
// component-pages.spec.ts, in the one load it makes of it (#322); the others are measured here.
const SITE = fileURLToPath(new URL('..', import.meta.url));
const COMPONENTS = discoverComponentPackages(SITE, SITE)
    .flatMap((p) => (JSON.parse(readFileSync(p.manifest, 'utf8')) as { modules: { declarations?: { tagName: string }[] }[] }).modules)
    .map((m) => m.declarations?.[0]?.tagName).filter((t): t is string => !!t);
const DESIGN_TOPICS = readdirSync(fileURLToPath(new URL('../../compiler/demo/showcase-new/pages/', import.meta.url)))
    .filter((f) => /^design-[a-z-]+\.pdx$/.test(f))
    .map((f) => f.slice('design-'.length, -'.pdx'.length));

type Route = { path: string; title: string; gallery?: string };
const PAGES: Route[] = [
    { path: '/', title: 'main h1' },
    { path: '/components', title: 'main h1' },
    { path: '/docs', title: 'main h1' },
    { path: '/docs/router', title: 'main h1' },
    { path: '/design', title: 'main h1' },
    { path: '/playground', title: 'main h1' },
    { path: '/integrations', title: 'main h1' },
    { path: '/search', title: 'main h1' },
    ...COMPONENTS.filter((tag) => !LIBRARY_TAGS.includes(tag))
        .map((tag) => ({ path: `/components/${tag}`, title: '.cmp-title', gallery: '.cmp-gallery' })),
    ...DESIGN_TOPICS.map((t) => ({ path: `/design/${t}`, title: 'main h1', gallery: '.design-gallery' })),
];

const HEADER_LINKS = ['/docs', '/components', '/design', '/playground', '/integrations', '/search', 'https://themebuilder.pdxui.com/'];

async function open(page: Page, path: string, gallery?: string): Promise<void> {
    await page.setViewportSize(PHONE);
    await page.goto(path, { waitUntil: gallery ? 'networkidle' : 'domcontentloaded' });
    await settledAtPhone(page, gallery);
}

test('a library component\'s page is measured at phone width once, by component-pages, not here too', () => {
    // component-pages.spec.ts loads each library component page once and runs these checks on it
    // (#322): loading it again here doubled the suite's cost for the same measure.
    const twice = PAGES.filter((p) => LIBRARY_TAGS.some((t) => p.path === `/components/${t}`)).map((p) => p.path);
    expect(twice).toEqual([]);
    // What stays here: the component pages no library manifest lists — the router's.
    expect(PAGES.map((p) => p.path)).toEqual(expect.arrayContaining(['/components/pdx-link', '/components/pdx-router-outlet']));
});

test('the route list covers the site', () => {
    // The list is read from sources; if one of them moved, this file would measure a handful of pages.
    expect(COMPONENTS.length, 'component tags from the component packages\' manifests').toBeGreaterThan(100);
    expect(COMPONENTS, 'the router\'s elements have pages too').toEqual(expect.arrayContaining(['pdx-router-outlet', 'pdx-link']));
    expect(DESIGN_TOPICS.length, 'design-*.pdx pages').toBeGreaterThan(20);
});

// One page load per route, three measures on it. The library's component pages get the same three
// in component-pages.spec.ts, during the one load that file makes of each.
for (const p of PAGES) {
    test(`${p.path} at 390 × 844: not wider than the screen, nothing past the edge, title on the first screen`, async ({ page }) => {
        await open(page, p.path, p.gallery);
        await expectFitsPhone(page, p.title);
    });
}

test('every header link is reachable at 390 × 844, directly or from the menu', async ({ page }) => {
    await open(page, '/components/pdx-col');
    const onScreen = (href: string) => page.locator(`header a[href="${href}"]`).first().evaluate((el) => {
        const r = el.getBoundingClientRect();
        const visible = r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== 'hidden';
        return visible && r.left >= 0 && r.right <= window.innerWidth && r.top >= 0 && r.bottom <= window.innerHeight;
    });

    const missing: string[] = [];
    for (const href of HEADER_LINKS) if (!(await onScreen(href))) missing.push(href);
    if (missing.length === 0) return;

    // Not all on screen: a menu button must bring the rest.
    const menu = page.locator('header button[aria-expanded]');
    await expect(menu, `links off screen with no menu button: ${missing.join(', ')}`).toHaveCount(1);
    await menu.click();
    await expect(menu).toHaveAttribute('aria-expanded', 'true');
    for (const href of HEADER_LINKS) expect(await onScreen(href), `${href} after opening the menu`).toBe(true);
});

test('the header menu closes on Escape and gives focus back to its button', async ({ page }) => {
    await open(page, '/components/pdx-col');
    const menu = page.locator('header button[aria-expanded]');
    await expect(menu).toHaveCount(1);
    await menu.click();
    await expect(menu).toHaveAttribute('aria-expanded', 'true');
    await page.keyboard.press('Escape');
    await expect(menu).toHaveAttribute('aria-expanded', 'false');
    await expect(menu).toBeFocused();
});

test('the header needs no menu on a desktop screen', async ({ page }) => {
    // The control: the menu is a phone affordance, and the desktop header keeps its links in the bar.
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/components/pdx-col', { waitUntil: 'domcontentloaded' });
    await page.locator('main h1').first().waitFor();
    await expect(page.locator('header button[aria-expanded]')).toBeHidden();
    for (const href of HEADER_LINKS) await expect(page.locator(`header a[href="${href}"]`).first()).toBeVisible();
});
