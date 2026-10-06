/**
 * Playwright measurement helpers for contract testing.
 * Extracts all visual properties needed by the contract rules.
 */
import type { ConsoleMessage, Page, Request, Response } from '@playwright/test';
import type { MeasuredElement } from './types';
// The one definition of which CSS tokens become HTML attributes. Imported rather than copied: a
// second hand-maintained list would drift the moment core adds a behaviour token, and the failure
// would be 36 screenshots with no explanation.
import { BEHAVIOR_TOKEN_MAP } from '../../../../../core/src/component/style';

const HOST = 'http://localhost:5220';

export interface GoToOptions {
    /** The colour scheme (light|dark) — applied as pdx-scheme */
    scheme?: string;
    /**
     * Slug of the generated tier page (e.g. 'tier-1a'). Required: there is no hand-written page to
     * fall back to.
     */
    page: string;
    /** How long to wait for the ready flag, in ms (default 10 000). */
    readyTimeout?: number;
}

/**
 * What a page reported while it loaded: console errors, uncaught exceptions, failed requests, HTTP
 * errors. A ready-flag timeout carries it: "Timeout 10000ms exceeded" alone could not
 * tell a module that failed to load from a component that threw, or from a slow server.
 */
function watchLoad(page: Page): { report(): string; stop(): void } {
    const seen: string[] = [];
    const onConsole = (m: ConsoleMessage) => { if (m.type() === 'error') seen.push(`console error: ${m.text()}`); };
    const onPageError = (e: Error) => seen.push(`uncaught: ${e.message}`);
    const onFailed = (r: Request) => seen.push(`request failed: ${r.url()} — ${r.failure()?.errorText ?? ''}`);
    const onResponse = (r: Response) => { if (r.status() >= 400) seen.push(`HTTP ${r.status()} ${r.url()}`); };
    page.on('console', onConsole);
    page.on('pageerror', onPageError);
    page.on('requestfailed', onFailed);
    page.on('response', onResponse);
    return {
        report: () => seen.length ? seen.map((s) => `  - ${s.slice(0, 300)}`).join('\n') : '  (nothing: no console error, no uncaught exception, no failed request)',
        stop: () => {
            page.off('console', onConsole);
            page.off('pageerror', onPageError);
            page.off('requestfailed', onFailed);
            page.off('response', onResponse);
        },
    };
}

export interface ReadyOptions {
    /** How long to wait for the ready flag, in ms (default 10 000). */
    timeout?: number;
}

/**
 * Run `navigate` — a goto, a reload — and wait for the page's `data-pdx-ready` flag. What the page
 * reports is collected from BEFORE the navigation (an entry module that throws does it before
 * `goto` resolves), and a timeout carries it, under `label`.
 *
 * The one wait on the flag: a spec that waits on it by hand gets "Timeout exceeded" and nothing else
 * when the page breaks, and `packages/core/tests/ready-waits-named.test.ts` fails on it.
 */
export async function waitForReady(page: Page, label: string, navigate: () => Promise<unknown>, opts: ReadyOptions = {}): Promise<void> {
    const load = watchLoad(page);
    const timeout = opts.timeout ?? 10_000;
    try {
        await navigate();
        await page.waitForFunction(() => document.documentElement.hasAttribute('data-pdx-ready'), null, { timeout });
    } catch (e) {
        if (e instanceof Error && e.name === 'TimeoutError') {
            throw new Error(`${label}: the ready flag did not come in ${timeout}ms. The page reported:\n${load.report()}`, { cause: e });
        }
        throw e;
    } finally {
        load.stop();
    }
}

export interface OpenOptions extends ReadyOptions {
    /** What `goto` waits for before the flag is awaited (default `load`, Playwright's own default). */
    waitUntil?: 'load' | 'domcontentloaded' | 'networkidle' | 'commit';
    /** What a timeout calls the page (default: the url). */
    label?: string;
}

/** Go to `url` and wait for its ready flag; a timeout names what the page reported. See `waitForReady`. */
export async function openPage(page: Page, url: string, opts: OpenOptions = {}): Promise<void> {
    await waitForReady(page, opts.label ?? url, () => page.goto(url, { waitUntil: opts.waitUntil ?? 'load' }), opts);
}

/** Navigate to a specific scenario + theme (+ optional scheme) on its generated tier page */
export async function goToScenario(page: Page, scenario: string, theme: string, opts: GoToOptions) {
    let url = `${HOST}/generated/${opts.page}.html?scenario=${scenario}&theme=${theme}`;
    if (opts.scheme) url += `&scheme=${opts.scheme}`;
    // `domcontentloaded`, then the ready flag — not `networkidle`.
    //
    // The flag is the real signal and the stronger of the two — it says the components MOUNTED,
    // which networkidle does not — while networkidle waits, by definition, for 500ms of silence
    // after the last request, on a page that is already usable. Paid once per test across 4371
    // (certify) and 1591 (the container), that is pure waiting: stacking the two costs about a third
    // of the wall clock on the same 52 contract tests.
    //
    // The flag's budget, waitForReady's 10s default, is generous because the flag is the ONLY wait:
    // it has to cover Vite serving the module graph on a loaded machine. Not a relaxation: the total
    // wait is far shorter, and this timeout is a ceiling that is never reached in a healthy run,
    // not a sleep.
    await waitForReady(page, `${scenario} on ${opts.page} (${theme})`,
        () => page.goto(url, { waitUntil: 'domcontentloaded' }), { timeout: opts.readyTimeout });
}

/**
 * Re-theme a page that is ALREADY showing the right scenario, instead of loading it again.
 *
 * A runner visits the same scenario once per theme, and the only difference between those 13 visits
 * is two attributes on <html> — which is exactly what the generated page's own bootstrap sets from
 * the query string. Reusing the page instead of reloading it takes axe-runner from 2.7 min to 55s
 * for the same 1742 tests.
 *
 * EQUIVALENCE IS MEASURED, not assumed: the same element under all 13 themes, loaded by navigation
 * versus re-themed in place, compared on height, width, radius, background, colour, font, border and
 * shadow, with the canonical scheme applied on both sides — identical in every theme.
 *
 * The catch, and it is why this belongs next to `freezeAnimations` in any caller: with transitions
 * on, that comparison reports 27 differences, every one an interpolated `oklab()` value or a
 * fractional shadow — CSS transitions caught mid-flight, not themes. Swapping an attribute starts a
 * transition where a navigation starts a fresh document, so anything measuring after this MUST have
 * transitions off.
 *
 * And whoever reuses a page this way owes one more assertion: that the theme actually changed. Only
 * the caller knows what it expected, and without that check a broken `applyTheme` would turn a
 * 13-theme dimension into thirteen runs of the same theme — silently, because a runner that does not
 * look at colour would pass either way. See axe-runner.spec.ts.
 */
export async function applyTheme(page: Page, theme: string, scheme?: string): Promise<void> {
    await page.evaluate(
        ({ t, s, map }) => {
            const root = document.documentElement;
            root.setAttribute('pdx-theme', t);
            if (s) root.setAttribute('pdx-scheme', s);

            // Re-derive the BEHAVIOUR attributes, exactly as core's setTheme() does after setting
            // the theme. Skipping this makes 36 of 1591 screenshots differ: the CSS reads
            // selectors like [pdx-card-style="elevated"][pdx-theme="playful"], so a page re-themed
            // without them keeps the PREVIOUS theme's behaviour — a card keeps a 1px border it
            // should have lost, which also makes it 2px taller.
            //
            // One frame first, so the new theme's tokens are computable, then the same two-frame
            // settle core uses.
            return new Promise<void>((resolve) => {
                requestAnimationFrame(() => {
                    const styles = getComputedStyle(root);
                    for (const [token, attr] of map) {
                        const value = styles.getPropertyValue(token).trim();
                        if (value) root.setAttribute(attr, value);
                        else root.removeAttribute(attr);
                    }
                    requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
                });
            });
        },
        { t: theme, s: scheme, map: BEHAVIOR_TOKEN_MAP },
    );
}

/**
 * An element's text colour, and the colour `varName` resolves to beside it. The token is
 * read from a probe in the element's parent — the same custom properties and colour scheme — so a
 * theme's value, `light-dark()` included, is compared as the browser computes it, not as written.
 */
export async function measureColorVar(
    page: Page, selector: string, varName: string,
): Promise<{ color: string; expected: string } | null> {
    return page.evaluate(({ sel, name }) => {
        const el = document.querySelector(sel) as HTMLElement | null;
        if (!el || !el.parentElement) return null;
        const probe = document.createElement('span');
        probe.style.color = `var(${name})`;
        el.parentElement.appendChild(probe);
        const expected = getComputedStyle(probe).color;
        probe.remove();
        return { color: getComputedStyle(el).color, expected };
    }, { sel: selector, name: varName });
}

/** What {@link measureTextContrast} found: the ratio, and the two colours it compared. */
export interface TextContrast {
    ratio: number;
    text: string;
    ground: string;
    /** An ancestor on the way to the opaque ground paints a background image — not composited. */
    image: string | null;
}

/**
 * The WCAG contrast of an element's text on what it is painted on. The colours are read
 * back from a canvas, so any CSS colour the browser computes — oklch, relative colour, light-dark —
 * arrives as the sRGB it renders. The ground is the element's background and its ancestors',
 * composited down to the first opaque one, then the page canvas.
 */
export async function measureTextContrast(page: Page, selector: string): Promise<TextContrast | null> {
    return page.evaluate((sel: string) => {
        const el = document.querySelector(sel) as HTMLElement | null;
        if (!el) return null;
        const cv = document.createElement('canvas');
        cv.width = cv.height = 1;
        const ctx = cv.getContext('2d', { willReadFrequently: true })!;
        const rgba = (css: string): [number, number, number, number] => {
            ctx.clearRect(0, 0, 1, 1);
            ctx.fillStyle = '#000';
            ctx.fillStyle = css;
            ctx.fillRect(0, 0, 1, 1);
            const d = ctx.getImageData(0, 0, 1, 1).data;
            return [d[0] / 255, d[1] / 255, d[2] / 255, d[3] / 255];
        };
        const over = (top: number[], bottom: number[]) =>
            [0, 1, 2].map((i) => top[3] * top[i] + (1 - top[3]) * bottom[i]).concat(1);

        const layers: number[][] = [];
        let image: string | null = null;
        for (let n: HTMLElement | null = el; n; n = n.parentElement) {
            const cs = getComputedStyle(n);
            if (cs.backgroundImage !== 'none' && !image) image = n.tagName.toLowerCase() + (n.className ? '.' + String(n.className).split(' ')[0] : '');
            const c = rgba(cs.backgroundColor);
            if (c[3] > 0) layers.push(c);
            if (c[3] >= 1) break;
        }
        // Nothing opaque up to <html>: the page canvas, which the dark scheme paints #121212.
        const dark = document.documentElement.getAttribute('pdx-scheme') === 'dark';
        let ground: number[] = dark ? [18 / 255, 18 / 255, 18 / 255, 1] : [1, 1, 1, 1];
        for (const layer of layers.reverse()) ground = over(layer, ground);
        const text = over(rgba(getComputedStyle(el).color), ground);

        const lum = (c: number[]) => {
            const lin = c.slice(0, 3).map((v) => (v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)));
            return 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2];
        };
        const [a, b] = [lum(text), lum(ground)];
        const hex = (c: number[]) => '#' + c.slice(0, 3).map((v) => Math.round(v * 255).toString(16).padStart(2, '0')).join('');
        return { ratio: (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05), text: hex(text), ground: hex(ground), image };
    }, selector);
}

/** What {@link measureMark} found inside an element's central area. */
export interface MarkMeasure {
    /** Pixels that stand out from the fill (WCAG contrast ≥ 1.5 to it). */
    pixels: number;
    /** The highest contrast of any of them to the fill; 1 when there are none. */
    contrast: number;
    fill: string;
    mark: string;
}

/**
 * What is painted inside an element: a screenshot of it, decoded by the page's own image decoder
 * and read on a canvas — no PNG library. Only the central 60% of the box is read, so
 * the border, the rounded corners and the focus ring stay out; its most common colour is the fill.
 * A checked checkbox whose check is wiped by a `background` shorthand measures 0 pixels.
 */
export async function measureMark(page: Page, selector: string): Promise<MarkMeasure | null> {
    const el = page.locator(selector).first();
    if ((await el.count()) === 0) return null;
    const png = await el.screenshot({ animations: 'disabled', caret: 'hide', scale: 'css' });
    return page.evaluate(async (b64: string) => {
        const img = new Image();
        img.src = 'data:image/png;base64,' + b64;
        await img.decode();
        const cv = document.createElement('canvas');
        cv.width = img.naturalWidth;
        cv.height = img.naturalHeight;
        const ctx = cv.getContext('2d', { willReadFrequently: true })!;
        ctx.drawImage(img, 0, 0);
        const [w, h] = [cv.width, cv.height];
        const [x0, y0] = [Math.round(w * 0.2), Math.round(h * 0.2)];
        const data = ctx.getImageData(x0, y0, Math.max(1, w - 2 * x0), Math.max(1, h - 2 * y0)).data;

        const px: number[][] = [];
        const counts = new Map<string, number>();
        for (let i = 0; i < data.length; i += 4) {
            const c = [data[i], data[i + 1], data[i + 2]];
            px.push(c);
            const k = c.join();
            counts.set(k, (counts.get(k) ?? 0) + 1);
        }
        const fill = [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0].split(',').map(Number);
        const lum = (c: number[]) => {
            const lin = c.map((v) => { const s = v / 255; return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4); });
            return 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2];
        };
        const lf = lum(fill);
        let pixels = 0, best = 1, mark = fill;
        for (const c of px) {
            const l = lum(c);
            const ratio = (Math.max(l, lf) + 0.05) / (Math.min(l, lf) + 0.05);
            if (ratio >= 1.5) pixels++;
            if (ratio > best) { best = ratio; mark = c; }
        }
        const hex = (c: number[]) => '#' + c.map((v) => v.toString(16).padStart(2, '0')).join('');
        return { pixels, contrast: best, fill: hex(fill), mark: hex(mark) };
    }, png.toString('base64'));
}

/**
 * Measure all visual properties of an element.
 * Selector tries first match; for "a, b" format, tries each.
 */
export async function measureElement(page: Page, selector: string): Promise<MeasuredElement | null> {
    return page.evaluate((sel: string) => {
        // Try selector as-is first, then try comma-separated parts
        let el = document.querySelector(sel) as HTMLElement;
        if (!el && sel.includes(',')) {
            for (const part of sel.split(',')) {
                el = document.querySelector(part.trim()) as HTMLElement;
                if (el) break;
            }
        }
        if (!el) return null;

        const cs = getComputedStyle(el);
        const r = el.getBoundingClientRect();

        return {
            width: r.width,
            height: r.height,
            top: r.top,
            left: r.left,
            right: r.right,
            bottom: r.bottom,
            centerX: r.left + r.width / 2,
            centerY: r.top + r.height / 2,
            borderTopWidth: parseFloat(cs.borderTopWidth) || 0,
            borderRightWidth: parseFloat(cs.borderRightWidth) || 0,
            borderBottomWidth: parseFloat(cs.borderBottomWidth) || 0,
            borderLeftWidth: parseFloat(cs.borderLeftWidth) || 0,
            borderTopStyle: cs.borderTopStyle,
            borderRightStyle: cs.borderRightStyle,
            borderBottomStyle: cs.borderBottomStyle,
            borderLeftStyle: cs.borderLeftStyle,
            borderTopColor: cs.borderTopColor,
            borderRightColor: cs.borderRightColor,
            borderBottomColor: cs.borderBottomColor,
            borderLeftColor: cs.borderLeftColor,
            borderTopLeftRadius: parseFloat(cs.borderTopLeftRadius) || 0,
            borderTopRightRadius: parseFloat(cs.borderTopRightRadius) || 0,
            borderBottomRightRadius: parseFloat(cs.borderBottomRightRadius) || 0,
            borderBottomLeftRadius: parseFloat(cs.borderBottomLeftRadius) || 0,
            backgroundColor: cs.backgroundColor,
            color: cs.color,
            opacity: parseFloat(cs.opacity),
            fontSize: parseFloat(cs.fontSize) || 0,
            fontFamily: cs.fontFamily.substring(0, 60),
            fontWeight: cs.fontWeight,
            letterSpacing: cs.letterSpacing,
            textTransform: cs.textTransform,
            cursor: cs.cursor,
            display: cs.display,
            minHeight: parseFloat(cs.minHeight) || 0,
            maxWidth: parseFloat(cs.maxWidth) || 0,
            minWidth: parseFloat(cs.minWidth) || 0,
            boxShadow: cs.boxShadow,
            pointerEvents: cs.pointerEvents,
            overflow: cs.overflow,
            contentOverflowX: Math.max(0, el.scrollWidth - el.clientWidth),
        };
    }, selector);
}

/**
 * Measure multiple named elements in one evaluate call (more efficient).
 */
export async function measureMultiple(
    page: Page,
    selectors: Record<string, string>,
): Promise<Record<string, MeasuredElement | null>> {
    return page.evaluate((sels: Record<string, string>) => {
        const result: Record<string, any> = {};
        for (const [name, sel] of Object.entries(sels)) {
            let el = document.querySelector(sel) as HTMLElement;
            if (!el && sel.includes(',')) {
                for (const part of sel.split(',')) {
                    el = document.querySelector(part.trim()) as HTMLElement;
                    if (el) break;
                }
            }
            if (!el) { result[name] = null; continue; }

            const cs = getComputedStyle(el);
            const r = el.getBoundingClientRect();
            result[name] = {
                width: r.width, height: r.height,
                top: r.top, left: r.left, right: r.right, bottom: r.bottom,
                centerX: r.left + r.width / 2, centerY: r.top + r.height / 2,
                borderTopWidth: parseFloat(cs.borderTopWidth) || 0,
                borderRightWidth: parseFloat(cs.borderRightWidth) || 0,
                borderBottomWidth: parseFloat(cs.borderBottomWidth) || 0,
                borderLeftWidth: parseFloat(cs.borderLeftWidth) || 0,
                borderTopStyle: cs.borderTopStyle,
                borderRightStyle: cs.borderRightStyle,
                borderBottomStyle: cs.borderBottomStyle,
                borderLeftStyle: cs.borderLeftStyle,
                borderTopColor: cs.borderTopColor,
                borderRightColor: cs.borderRightColor,
                borderBottomColor: cs.borderBottomColor,
                borderLeftColor: cs.borderLeftColor,
                borderTopLeftRadius: parseFloat(cs.borderTopLeftRadius) || 0,
                borderTopRightRadius: parseFloat(cs.borderTopRightRadius) || 0,
                borderBottomRightRadius: parseFloat(cs.borderBottomRightRadius) || 0,
                borderBottomLeftRadius: parseFloat(cs.borderBottomLeftRadius) || 0,
                backgroundColor: cs.backgroundColor,
                color: cs.color,
                opacity: parseFloat(cs.opacity),
                fontSize: parseFloat(cs.fontSize) || 0,
                fontFamily: cs.fontFamily.substring(0, 60),
                fontWeight: cs.fontWeight,
                letterSpacing: cs.letterSpacing,
                textTransform: cs.textTransform,
                cursor: cs.cursor,
                display: cs.display,
                minHeight: parseFloat(cs.minHeight) || 0,
                maxWidth: parseFloat(cs.maxWidth) || 0,
                minWidth: parseFloat(cs.minWidth) || 0,
                boxShadow: cs.boxShadow,
                pointerEvents: cs.pointerEvents,
                overflow: cs.overflow,
                contentOverflowX: Math.max(0, el.scrollWidth - el.clientWidth),
            };
        }
        return result;
    }, selectors);
}
