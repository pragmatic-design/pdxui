/**
 * The checks a page of the site must pass at phone width: nothing is cut off, everything is
 * reachable, the page starts with itself. See phone-width.spec.ts for what goes wrong without them.
 *
 * Shared by phone-width.spec.ts, which runs them on every route a library component does not own,
 * and component-pages.spec.ts, which runs them on each library component page during the one load
 * it makes of it (#322): loading every component page a second time just for these checks was half
 * the site suite's time.
 */
import { expect, type Page } from '@playwright/test';

export const PHONE = { width: 390, height: 844 };

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
export async function offscreen(page: Page): Promise<string[]> {
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

/**
 * Wait for a page loaded at phone width to be measurable: its title, and its gallery when it has
 * one. A gallery is a lazy module that renders its sections after the route: measure it, not the
 * empty box it arrives in. A component with no gallery shows an overview instead.
 */
export async function settledAtPhone(page: Page, gallery?: string): Promise<void> {
    await page.locator('main h1').first().waitFor();
    if (gallery) await page.locator(`${gallery} section, main #overview`).first().waitFor();
}

/**
 * The three measures, as soft assertions: not wider than the screen, nothing past the edge, the
 * title on the first screen. The page must already be at PHONE size.
 */
export async function expectFitsPhone(page: Page, title: string, label = ''): Promise<void> {
    const at = label ? `${label}: ` : '';
    const { scrollWidth, innerWidth } = await page.evaluate(() => ({
        scrollWidth: document.body.scrollWidth, innerWidth: window.innerWidth,
    }));
    expect.soft(scrollWidth, `${at}body.scrollWidth`).toBeLessThanOrEqual(innerWidth);

    const offenders = await offscreen(page);
    expect.soft(offenders.slice(0, 10), `${at}${offenders.length} element(s) past the edge`).toEqual([]);

    const top = await page.locator(title).first().evaluate((el) => el.getBoundingClientRect().top + window.scrollY);
    expect.soft(top, `${at}the page title is on the first screen`).toBeLessThan(PHONE.height);
}
