/**
 * A cold load is a splash, then the app whole — no frame in between.
 *
 * Without the splash, at CPU 4×, a cold load is a blank page, then ~600 ms of a strip reading
 * «Loading...» with a blue rule under it (the router's placeholder, and the browser's focus ring on
 * it), then the app. Here every animation frame of a cold load is sampled from the page itself — a
 * `requestAnimationFrame` loop started before any of the app's code — and each one must be the splash
 * covering the viewport, or the app with its page in it.
 */
import { expect, test, type Page } from './fixture';
import { GUEST } from './session';

interface Sample { t: number; parsed: boolean; reduced: boolean; splash: boolean; leaving: boolean; page: boolean; placeholder: boolean }

/** Sample every frame from the first one, until the page has been there, splash gone, for a while. */
async function coldLoad(page: Page, path: string, pageSelector: string, cpu: number): Promise<Sample[]> {
    await page.addInitScript((selector) => {
        const samples: unknown[] = [];
        (window as unknown as { __samples: unknown[] }).__samples = samples;
        const sample = () => {
            const splash = document.getElementById('pdx-splash');
            const placeholder = [...document.querySelectorAll('pdx-router-outlet div')]
                .some((d) => (d.textContent ?? '').startsWith('Loading') && (d as HTMLElement).offsetParent !== null);
            samples.push({
                t: Math.round(performance.now()),
                parsed: (document.body?.childElementCount ?? 0) > 0,
                reduced: matchMedia('(prefers-reduced-motion: reduce)').matches,
                splash: !!splash && !splash.classList.contains('pdx-splash-leaving'),
                leaving: !!splash && splash.classList.contains('pdx-splash-leaving'),
                page: !!document.querySelector(selector),
                placeholder,
            });
            if (samples.length < 600) requestAnimationFrame(sample);
        };
        requestAnimationFrame(sample);
    }, pageSelector);
    const cdp = await page.context().newCDPSession(page);
    if (cpu !== 1) await cdp.send('Emulation.setCPUThrottlingRate', { rate: cpu });
    await page.goto(path);
    await expect(page.locator(pageSelector)).toBeVisible();
    await expect(page.locator('#pdx-splash')).toHaveCount(0);
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
    return page.evaluate(() => (window as unknown as { __samples: Sample[] }).__samples);
}

/**
 * The frames that are neither the splash nor the app with its page.
 *
 * From the first frame the parser has reached into the body: the splash is the body's first child,
 * and at CPU 4× the parser can yield between `<body>` and it — measured once, a single frame at
 * ~70 ms with an empty body. That frame is the browser's, before any of the app's code, and no markup
 * can precede the body's own first child.
 */
const between = (samples: Sample[]) => samples.filter((s) => s.parsed && !s.splash && !s.page);

test.describe('a cold load at CPU 4×', () => {
    test('signed in, /tickets: the splash, then the list — never the «Loading...» strip', async ({ page }) => {
        const samples = await coldLoad(page, '/tickets', '[data-test="tickets"]', 4);
        expect(samples.length, 'no frame was sampled').toBeGreaterThan(3);
        expect(between(samples), 'a frame that was neither the splash nor the app').toEqual([]);
        expect(samples.filter((s) => s.placeholder), 'the router placeholder was drawn').toEqual([]);
        expect(samples.find((s) => s.parsed)?.splash, 'the first frame of the page was not the splash').toBe(true);
    });

    test.describe('as a guest', () => {
        test.use({ storageState: GUEST });
        test('/login: the splash, then the sign-in', async ({ page }) => {
            const samples = await coldLoad(page, '/login', '[data-test="login"]', 4);
            expect(between(samples), 'a frame that was neither the splash nor the app').toEqual([]);
            expect(samples.filter((s) => s.placeholder), 'the router placeholder was drawn').toEqual([]);
        });
    });
});

test('the page takes the focus without the browser drawing a ring round it', async ({ page }) => {
    // A blue rule under «Loading...» is the focus ring of the placeholder the outlet focuses.
    await page.goto('/tickets');
    await expect(page.locator('[data-test="tickets"]')).toBeVisible();
    await expect(page.locator('#pdx-splash')).toHaveCount(0);
    const focus = await page.evaluate(() => {
        const a = document.activeElement as HTMLElement;
        return { tag: a.tagName.toLowerCase(), ring: a.matches(':focus-visible'), outline: getComputedStyle(a).outlineStyle };
    });
    expect(focus.tag, 'the focus is not on the page').not.toBe('body');
    expect(focus.ring, `${focus.tag} matches :focus-visible`).toBe(false);
});

test('at 1× the splash fades and is gone; the app is under it, and the body is no longer busy', async ({ page }) => {
    const samples = await coldLoad(page, '/tickets', '[data-test="tickets"]', 1);
    expect(samples.some((s) => s.leaving), 'no frame of the fade').toBe(true);
    expect(samples.filter((s) => s.leaving && !s.page), 'faded onto an empty app').toEqual([]);
    expect(await page.locator('body').getAttribute('aria-busy')).toBeNull();
});

test('with reduced motion the splash is removed without a fade', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    const samples = await coldLoad(page, '/tickets', '[data-test="tickets"]', 1);
    expect(samples.every((s) => s.reduced), 'control: the page did not see the preference').toBe(true);
    expect(samples.filter((s) => s.leaving), 'a frame of a fade').toEqual([]);
});

test('control — the splash is the page’s own HTML: it is in the document before any script runs', async ({ request }) => {
    const html = await (await request.get('/tickets')).text();
    expect(html).toMatch(/<body[^>]*aria-busy="true"[^>]*>\s*<div id="pdx-splash" aria-hidden="true"><span>PDX Service Desk<\/span><\/div>/);
});
