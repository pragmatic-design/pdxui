/**
 * An overlay declared inside a routed page paints above the app shell.
 *
 * An element with a view-transition-name is a stacking context. If `<pdx-router-outlet>` kept
 * `view-transition-name: pdx-page` for its whole life, whatever a page put on top — a drawer at
 * z-index 1000 — would be scoped inside the outlet, and any shell region with a z-index of its own
 * would paint over it: a drawer at 1000 under a header at 20, its title hidden, the backdrop not
 * dimming the bar, an app button covering the drawer's "Save".
 *
 * The probe is synthetic, not the site's own layout: a fixed element at z-index 1000
 * INSIDE the routed page against a fixed element at z-index 20 OUTSIDE the outlet, and the question
 * asked of the browser is which one is on top. It needs a real browser — happy-dom computes no
 * stacking — and the site is the suite that runs the router on a production build.
 */
import { test, expect } from '@playwright/test';

test('a fixed element inside a routed page paints above a lower z-index outside the outlet', async ({ page }) => {
    await page.goto('/', { waitUntil: 'networkidle' });

    const result = await page.evaluate(() => {
        const outlet = document.querySelector('pdx-router-outlet');
        const routed = outlet?.firstElementChild as HTMLElement | null;
        if (!outlet || !routed) return { error: 'no routed page inside the outlet' };

        const make = (id: string, z: string) => {
            const el = document.createElement('div');
            el.id = id;
            el.style.cssText = `position:fixed;inset:0;z-index:${z};background:transparent`;
            return el;
        };
        const shell = make('probe-shell-z20', '20');
        const overlay = make('probe-page-z1000', '1000');
        document.body.appendChild(shell);
        routed.appendChild(overlay);

        const top = document.elementFromPoint(10, 10)?.id ?? '(nothing)';
        const vtn = getComputedStyle(outlet).getPropertyValue('view-transition-name').trim();
        shell.remove();
        overlay.remove();
        return { top, vtn };
    });

    expect(result).not.toHaveProperty('error');
    // Soft: the cause and the consequence are two claims, and a run should report both.
    expect.soft(result.vtn, 'the outlet carries a view-transition-name at rest, which makes it a stacking context')
        .toBe('none');
    // With the defect present the element on top is not even the z-index 20 probe but the site's own
    // header: the page's overlay loses to the whole shell. Either way it is not the overlay.
    expect(result.top, 'the page\'s z-index 1000 is trapped under the shell').toBe('probe-page-z1000');
});

test('the control: the same pair, both outside the outlet, orders by z-index', async ({ page }) => {
    // If this fails the probe itself is wrong, and the test above says nothing about the outlet.
    await page.goto('/', { waitUntil: 'networkidle' });
    const top = await page.evaluate(() => {
        const make = (id: string, z: string) => {
            const el = document.createElement('div');
            el.id = id;
            el.style.cssText = `position:fixed;inset:0;z-index:${z};background:transparent`;
            document.body.appendChild(el);
            return el;
        };
        const a = make('probe-a-z20', '20');
        const b = make('probe-b-z1000', '1000');
        const id = document.elementFromPoint(10, 10)?.id ?? '(nothing)';
        a.remove(); b.remove();
        return id;
    });
    expect(top).toBe('probe-b-z1000');
});
