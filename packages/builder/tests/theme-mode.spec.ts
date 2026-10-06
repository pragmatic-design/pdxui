/**
 * The builder's theme-mode SETPOINT — the builder must not become a SECOND generator.
 *
 * The CSS the builder produces in the browser has to be byte-identical to what `pdx theme`
 * produces on the CLI for the same inputs. Both call the same engine, so any difference is
 * the builder's input plumbing quietly meaning something else — which is exactly how two
 * implementations start to drift while both look right.
 *
 * The comparison runs the real CLI code path (`createTheme` from @pdxui/design/engine)
 * in Node and the real UI path in the browser.
 */
import { test, expect, type Page } from '@playwright/test';
import { createTheme } from '../../design/src/engine/index.js';

const APP = '/packages/builder/index.html';

test.use({ viewport: { width: 1600, height: 1000 } });

interface ThemeOut {
    css: string;
    dtcg: string;
    issues: { code: string; level: string; message: string }[];
    errors: number;
    warnings: number;
    error?: string;
}

async function openTheme(page: Page, query = ''): Promise<void> {
    await page.goto(`${APP}?mode=theme&component=button&scenario=button-variants${query}`);
    await page.waitForFunction(() => !!(globalThis as Record<string, unknown>).__pdx_builder);
}

const themeOf = (page: Page) =>
    page.evaluate(() => (globalThis as any).__pdx_builder.theme() as ThemeOut);

/** Inputs worth pinning: defaults, an archetype, an explicit accent/focus, a wide-gamut brand. */
const CASES = [
    { label: 'defaults', query: '', input: { name: 'my-theme', brandColor: '#3b5bdb', language: 'neutral', density: 'normal' } },
    { label: 'material archetype', query: '&language=material&name=acme', input: { name: 'acme', brandColor: '#3b5bdb', language: 'material', density: 'normal' } },
    {
        label: 'explicit accent + focus + neutral',
        query: '&brand=%23c2185b&accent=%23ffb300&focus=%230b6bcb&neutral=250&name=lab',
        input: { name: 'lab', brandColor: '#c2185b', language: 'neutral', density: 'normal', accentColor: '#ffb300', focusColor: '#0b6bcb', neutralHue: 250 },
    },
    {
        label: 'wide-gamut oklch brand + compact + pill',
        query: '&brand=oklch(0.52%200.16%20215)&density=compact&radius=pill&name=wide',
        input: { name: 'wide', brandColor: 'oklch(0.52 0.16 215)', language: 'neutral', density: 'compact', radiusScale: 'pill' },
    },
] as const;

for (const c of CASES) {
    test(`${c.label}: the builder's CSS is byte-identical to the engine's`, async ({ page }) => {
        await openTheme(page, c.query);
        const fromBrowser = await themeOf(page);
        expect(fromBrowser.error, 'the draft must be valid').toBeUndefined();

        const fromNode = createTheme(c.input as never).toCSS();
        expect(fromBrowser.css).toBe(fromNode);
    });
}

test('the WCAG token gate is clean for a generated theme, and it is a real check', async ({ page }) => {
    await openTheme(page);
    const t = await themeOf(page);

    // The engine's whole promise: any brand, still AA. If this ever reports errors for a
    // plain brand, the engine regressed — the gate is not decoration.
    expect(t.errors, `gate issues: ${JSON.stringify(t.issues)}`).toBe(0);
    await expect(page.locator('[data-test="gate-verdict"]')).toHaveText('AA clean');
});

test('a malformed brand is reported, not silently ignored', async ({ page }) => {
    await openTheme(page, '&brand=not-a-colour');
    const t = await themeOf(page);

    expect(t.error, 'the engine must reject it').toBeTruthy();
    await expect(page.locator('[data-test="gate-verdict"]')).toHaveText('input');
    await expect(page.locator('[data-test="gate-error"]')).toBeVisible();
});

test('changing a knob restyles the preview live, with no reload', async ({ page }) => {
    await openTheme(page);

    const frame = page.frameLocator('[data-test="preview"]');
    await expect(frame.locator('html[data-pdx-ready]')).toHaveCount(1);

    // The COMPUTED value, not the inline one: the preview renders the exported stylesheet,
    // so asserting the mechanism would pin an implementation detail instead of the claim.
    const readPrimary = () => page.evaluate(() => {
        const doc = (document.querySelector('iframe') as HTMLIFrameElement).contentDocument!;
        return doc.defaultView!.getComputedStyle(doc.documentElement).getPropertyValue('--pdx-color-primary').trim();
    });

    const before = await readPrimary();
    expect(before, 'theme mode must style the preview').not.toBe('');

    await page.evaluate(async () => await (globalThis as any).__pdx_builder.setDraft({ brand: '#0f9d58' }));

    const after = await readPrimary();
    expect(after).not.toBe(before);

    // Still the same document: a live restyle, not a navigation.
    await expect(frame.locator('html[data-pdx-ready]')).toHaveCount(1);
});

test('the draft round-trips through the URL', async ({ page }) => {
    await openTheme(page, '&language=cupertino&name=roundtrip&brand=%23c2185b');
    const state = await page.evaluate(() => (globalThis as any).__pdx_builder.state());
    expect(state.mode).toBe('theme');
    expect(state.draft.language).toBe('cupertino');
    expect(state.draft.name).toBe('roundtrip');
    expect(state.draft.brand).toBe('#c2185b');

    // And the URL still says so after the app has rewritten it.
    const url = new URL(page.url());
    expect(url.searchParams.get('mode')).toBe('theme');
    expect(url.searchParams.get('language')).toBe('cupertino');
    expect(url.searchParams.get('brand')).toBe('#c2185b');
});

test('a token override reaches the export, the preview AND the gate', async ({ page }) => {
    await openTheme(page, '&name=ovr&brand=%23c2185b');

    const before = await themeOf(page);
    expect(before.css).not.toContain('--pdx-color-primary: oklch(0.30 0.10 200)');

    await page.evaluate(async () =>
        await (globalThis as any).__pdx_builder.setToken('--pdx-color-primary', 'oklch(0.30 0.10 200)'));

    // 1. It ships with the theme — the engine appends it inside the theme block, so export,
    //    save and preview all carry the same thing.
    const after = await themeOf(page);
    expect(after.css).toContain('--pdx-color-primary: oklch(0.30 0.10 200)');

    // 2. It is visible in the preview.
    const applied = await page.evaluate(() => {
        const doc = (document.querySelector('iframe') as HTMLIFrameElement).contentDocument!;
        return doc.defaultView!.getComputedStyle(doc.documentElement).getPropertyValue('--pdx-color-primary').trim();
    });
    expect(applied).toBe('oklch(0.30 0.10 200)');

    // 3. And it is GATED. An override is the part that would otherwise escape the check.
    await page.evaluate(async () =>
        await (globalThis as any).__pdx_builder.setToken('--pdx-color-primary-text', 'oklch(0.32 0.10 200)'));
    const broken = await themeOf(page);
    expect(broken.errors, 'near-identical label on fill must fail the gate').toBeGreaterThan(0);
    await expect(page.locator('[data-test="gate-verdict"]')).toContainText('fail');
});

test('custom CSS reaches the export and the preview', async ({ page }) => {
    await openTheme(page, '&name=rawcss&brand=%23c2185b');

    await page.evaluate(async () =>
        await (globalThis as any).__pdx_builder.setCss('--pdx-space-md: 3rem;'));

    const t = await themeOf(page);
    expect(t.css).toContain('--pdx-space-md: 3rem;');

    const applied = await page.evaluate(() => {
        const doc = (document.querySelector('iframe') as HTMLIFrameElement).contentDocument!;
        return doc.defaultView!.getComputedStyle(doc.documentElement).getPropertyValue('--pdx-space-md').trim();
    });
    expect(applied).toBe('3rem');
});

test('overrides survive the URL round-trip', async ({ page }) => {
    await openTheme(page, '&name=rt&brand=%23c2185b&tok=--pdx-color-accent%3A%20red&css=--pdx-radius-md%3A%209px%3B');
    const state = await page.evaluate(() => (globalThis as any).__pdx_builder.state());
    expect(state.draft.tokens['--pdx-color-accent']).toBe('red');
    expect(state.draft.css).toBe('--pdx-radius-md: 9px;');

    const t = await themeOf(page);
    expect(t.css).toContain('--pdx-color-accent: red;');
    expect(t.css).toContain('--pdx-radius-md: 9px;');
});

test('entering theme mode continues from what is on screen, it does not swap it', async ({ page }) => {
    // A mode switch that swapped the preview would turn the shipped `neutral` canvas
    // (primary charcoal, chroma 0.02) into the default draft brand, an electric blue.
    // Both are legitimately "neutral" — the archetype is the style, the shipped theme is
    // that style with no brand — but it reads as the tool changing the component.
    await page.goto(`${APP}?component=button&scenario=button-variants&theme=material`);
    await page.waitForFunction(() => !!(globalThis as Record<string, unknown>).__pdx_builder);
    await expect(page.frameLocator('[data-test="preview"]').locator('html[data-pdx-ready]')).toHaveCount(1);

    const before = await page.evaluate(() => {
        const doc = (document.querySelector('iframe') as HTMLIFrameElement).contentDocument!;
        return doc.defaultView!.getComputedStyle(doc.documentElement).getPropertyValue('--pdx-color-primary').trim();
    });

    await page.locator('[data-test="mode-theme"]').click();

    const state = await page.evaluate(() => (globalThis as any).__pdx_builder.state());
    expect(state.draft.language, 'the archetype follows the theme').toBe('material');
    expect(before).toContain(state.draft.brand);
    expect(state.draft.name).toBe('material-custom');
});

test('switching modes does not resize the stage', async ({ page }) => {
    // A column that changes width reflows the grid and resizes the preview iframe — a
    // visible redraw on every toggle, and a different viewport for the oracle to measure.
    await page.goto(`${APP}?component=button&scenario=button-variants&theme=material`);
    await page.waitForFunction(() => !!(globalThis as Record<string, unknown>).__pdx_builder);

    const width = () => page.evaluate(() => (document.querySelector('iframe') as HTMLIFrameElement).clientWidth);
    const inComponents = await width();

    await page.locator('[data-test="mode-theme"]').click();
    expect(await width()).toBe(inComponents);

    await page.locator('[data-test="mode-component"]').click();
    expect(await width()).toBe(inComponents);
});
