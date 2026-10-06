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
import { test, expect, type Page } from '@playwright/test';
import { discoverComponentPackages } from '../../compiler/src/discover-component-packages.mjs';

const PHONE = { width: 390, height: 844 };

// Every route of the site: a hand-picked handful misses the pages that run past the edge. The pages
// come from the sources the site builds them from: every component package's manifest (the router's
// too), and the showcase's design pages.
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
    ...COMPONENTS.map((tag) => ({ path: `/components/${tag}`, title: '.cmp-title', gallery: '.cmp-gallery' })),
    ...DESIGN_TOPICS.map((t) => ({ path: `/design/${t}`, title: 'main h1', gallery: '.design-gallery' })),
];

const HEADER_LINKS = ['/docs', '/components', '/design', '/playground', '/integrations', '/search', 'https://themebuilder.pdxui.com/'];

async function open(page: Page, path: string, gallery?: string): Promise<void> {
    await page.setViewportSize(PHONE);
    await page.goto(path, { waitUntil: gallery ? 'networkidle' : 'domcontentloaded' });
    await page.locator('main h1').first().waitFor();
    // A gallery is a lazy module that renders its sections after the route: measure it, not the
    // empty box it arrives in. A component with no gallery shows an overview instead.
    if (gallery) await page.locator(`${gallery} section, main #overview`).first().waitFor();
}

/**
 * Components whose own box clips content past its edge by design. Named one by one, each with its
 * reason: skipping everything under an `overflow: hidden` box would hide real losses — /design/colors
 * can lose four grey chips exactly that way. The box itself must still fit the screen.
 */
const CLIPPED_BY_DESIGN: [selector: string, reason: string][] = [
    ['.pdx-progress-indeterminate', 'the indeterminate bar slides through its own track'],
    ['.pdx-carousel-root', 'the slides not on show wait inside the carousel'],
];

/**
 * Elements inside `main` whose right edge is past the screen, except those a box of theirs scrolls
 * sideways (`overflow-x: auto | scroll`) — the one place wide content is allowed to be — and those a
 * component of CLIPPED_BY_DESIGN hides inside itself.
 */
async function offscreen(page: Page): Promise<string[]> {
    return page.evaluate((clipped) => {
        const vw = window.innerWidth;
        const main = document.querySelector('main');
        if (!main) return ['<no main>'];
        const scrolls = (el: Element | null): boolean => {
            for (let a = el?.parentElement ?? null; a && a !== main; a = a.parentElement) {
                const ox = getComputedStyle(a).overflowX;
                if (ox === 'auto' || ox === 'scroll') return true;
            }
            return false;
        };
        const clippedByDesign = (el: Element): boolean => clipped.some(([sel]) => {
            const box = el.parentElement?.closest(sel);
            if (!box || !main.contains(box)) return false;
            const ox = getComputedStyle(box).overflowX;
            return (ox === 'hidden' || ox === 'clip') && box.getBoundingClientRect().right <= vw + 0.5;
        });
        const past = new Set<Element>();
        for (const el of main.querySelectorAll('*')) {
            const r = el.getBoundingClientRect();
            if (r.width === 0 || r.height === 0) continue;
            if (r.right <= vw + 0.5) continue;
            if (scrolls(el) || clippedByDesign(el)) continue;
            past.add(el);
        }
        // Reported by the outermost element past the edge: its descendants are the same fault.
        const name = (el: Element) => {
            const cls = typeof el.className === 'string' && el.className ? '.' + el.className.trim().split(/\s+/).join('.') : '';
            return `${el.tagName.toLowerCase()}${cls}`;
        };
        const out: string[] = [];
        for (const el of past) {
            if (el.parentElement && past.has(el.parentElement)) continue;
            out.push(`${name(el)} in ${el.parentElement ? name(el.parentElement) : '?'} right=${Math.round(el.getBoundingClientRect().right)}`);
        }
        return out;
    }, CLIPPED_BY_DESIGN);
}

test('the route list covers the site', () => {
    // The list is read from sources; if one of them moved, this file would measure a handful of pages.
    expect(COMPONENTS.length, 'component tags from the component packages\' manifests').toBeGreaterThan(100);
    expect(COMPONENTS, 'the router\'s elements have pages too').toEqual(expect.arrayContaining(['pdx-router-outlet', 'pdx-link']));
    expect(DESIGN_TOPICS.length, 'design-*.pdx pages').toBeGreaterThan(20);
});

// One page load per route, three measures on it (147 routes: one load each keeps the suite in minutes).
for (const p of PAGES) {
    test(`${p.path} at 390 × 844: not wider than the screen, nothing past the edge, title on the first screen`, async ({ page }) => {
        await open(page, p.path, p.gallery);
        const { scrollWidth, innerWidth } = await page.evaluate(() => ({
            scrollWidth: document.body.scrollWidth, innerWidth: window.innerWidth,
        }));
        expect.soft(scrollWidth, 'body.scrollWidth').toBeLessThanOrEqual(innerWidth);

        const offenders = await offscreen(page);
        expect.soft(offenders.slice(0, 10), `${offenders.length} element(s) past the edge`).toEqual([]);

        const top = await page.locator(p.title).first().evaluate((el) => el.getBoundingClientRect().top + window.scrollY);
        expect.soft(top, 'the page title is on the first screen').toBeLessThan(PHONE.height);
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
