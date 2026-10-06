/**
 * The argument for our theme choices has to be reachable from the place a designer opens.
 *
 * `design-theory.md`, `making-a-theme.md` and `theming.md` carry that reasoning in the Docs section,
 * which reads as the developer's half of the site; the pages under `/design` link them, offer a
 * topic about themes and tokens as a system, and name `createTheme`, DTCG and WCAG.
 *
 * The contrast figures are the part worth testing rather than eyeballing. A page that PRINTS a
 * ratio is only worth having if the ratio is the one the gate would compute — otherwise it is a
 * decorative number that drifts the first time a token moves. So this recomputes each printed
 * figure from the page's own custom properties, using the engine's own `wcagContrast`.
 */
import { test, expect, type Page } from '@playwright/test';
import { wcagContrast, parseColorToken } from '../../design/src/engine/color';

const DOCS = ['/docs/design-theory', '/docs/making-a-theme', '/docs/theming'];

/** Every theme the design package ships, as the page should list them. */
const EXPECTED_THEMES = 13;

async function openThemes(page: Page): Promise<void> {
    await page.goto('/design/themes', { waitUntil: 'networkidle' });
    await expect(page.locator('[data-test="theme-grid"]')).toBeVisible();
}

test('the Design section offers a themes topic', async ({ page }) => {
    await page.goto('/design', { waitUntil: 'networkidle' });
    await page.waitForTimeout(400);

    // Scoped to the NAV, which is what this test is named after. The landing's hero also links the
    // page ("see it live"), so an unscoped count would be 2 and this would fail for the opposite of
    // the reason it exists.
    const link = page.locator('.cmp-nav a[href="/design/themes"]');
    await expect(link, 'the design nav has no themes topic').toHaveCount(1);

    await link.first().click();
    await page.waitForFunction(() => location.pathname === '/design/themes', undefined, { timeout: 10_000 });
    await expect(page.locator('[data-test="theme-grid"]')).toBeVisible();
});

test('the theory is one click from the Design section', async ({ page }) => {
    await page.goto('/design', { waitUntil: 'networkidle' });
    await page.waitForTimeout(400);

    for (const href of DOCS) {
        await expect(
            page.locator(`a[href="${href}"]`),
            `the Design landing does not link ${href}, so the reasoning stays in the developer half`,
        ).toHaveCount(1);
    }
});

test('the page shows every shipped theme', async ({ page }) => {
    await openThemes(page);

    const cards = page.locator('[data-theme-card]');
    await expect(cards, 'the grid does not show all the themes').toHaveCount(EXPECTED_THEMES);

    // Each card must actually be themed, not merely labelled: the attribute the CSS keys off.
    const themed = await page.evaluate(() =>
        Array.from(document.querySelectorAll('[data-theme-card]'))
            .filter(el => (el.getAttribute('pdx-theme') ?? '') !== '').length);
    expect(themed, 'the cards carry a name but no pdx-theme, so they all render the same').toBe(EXPECTED_THEMES);
});

// The tokens switch with each card's `pdx-theme`, but an outer theme's component rules
// (`[pdx-theme="pragmatic-gold"] .pdx-primary { background: linear-gradient(<gold>) }`) can reach
// through them: under the site's own theme, pragmatic-gold, every card's primary button would be the
// gold gradient. Under neutral, which has no component rules, the grid is right either way.
test.describe('the theme grid under an outer theme', () => {
    // Switching the outer theme starts the buttons' background transitions; read them at their end.
    // A context option: `test.use({ reducedMotion })` is not a test option and is ignored.
    test.use({ contextOptions: { reducedMotion: 'reduce' } });

    for (const outer of ['pragmatic-gold', 'pragmatic', 'material', 'neutral']) {
        test(`under ${outer}, each card's primary button paints its own theme`, async ({ page }) => {
            await openThemes(page);
            const cards = await page.evaluate((t) => {
                document.documentElement.setAttribute('pdx-theme', t);
                void getComputedStyle(document.body).color;
                for (const a of document.getAnimations()) a.finish();
                return Array.from(document.querySelectorAll('[data-theme-card]')).map((card) => {
                    const cs = getComputedStyle(card.querySelector('.pdx-primary')!);
                    return { theme: card.getAttribute('pdx-theme') ?? '', image: cs.backgroundImage, color: cs.backgroundColor };
                });
            }, outer);
            expect(cards).toHaveLength(EXPECTED_THEMES);

            const paints = new Set(cards.map((c) => `${c.image} ${c.color}`));
            expect(paints.size, `the 13 cards show ${paints.size} different primaries: ${JSON.stringify(cards)}`).toBe(EXPECTED_THEMES);
            // The two Pragmatic themes paint their primary with a gradient, and only their own cards do.
            const gradients = cards.filter((c) => c.image !== 'none').map((c) => c.theme).sort();
            expect(gradients).toEqual(['pragmatic', 'pragmatic-gold']);
        });
    }

    // The derived tokens resolve on each themed element, not once on the page root: resolved there,
    // a card's text keeps the outer theme's --pdx-color-text, whatever its own pdx-theme says.
    test('each card\'s text is its own theme\'s, whatever the outer theme', async ({ page }) => {
        await openThemes(page);
        const wrong = await page.evaluate((outers) => {
            const html = document.documentElement;
            const settle = () => { void getComputedStyle(document.body).color; for (const a of document.getAnimations()) a.finish(); };
            const cards = Array.from(document.querySelectorAll<HTMLElement>('[data-theme-card]'));
            // A card's text under its own theme on the page too: the reference.
            const alone = new Map<HTMLElement, string>();
            for (const card of cards) {
                html.setAttribute('pdx-theme', card.getAttribute('pdx-theme')!);
                settle();
                alone.set(card, getComputedStyle(card).color);
            }
            const out: string[] = [];
            for (const outer of outers) {
                html.setAttribute('pdx-theme', outer);
                settle();
                for (const card of cards) {
                    const color = getComputedStyle(card).color;
                    if (color !== alone.get(card)) out.push(`${outer} > ${card.getAttribute('pdx-theme')}: ${color} (alone: ${alone.get(card)})`);
                }
            }
            return out;
        }, ['pragmatic-gold', 'cupertino', 'cyberpunk', 'neutral']);
        expect(wrong).toEqual([]);
    });
});

test('every printed contrast ratio is the one the engine computes', async ({ page }) => {
    await openThemes(page);

    const rows = await page.evaluate(() => {
        const out: { token: string; textToken: string; fill: string; label: string; printed: number }[] = [];
        for (const row of Array.from(document.querySelectorAll('[data-contrast-row]'))) {
            const cs = getComputedStyle(row);
            out.push({
                token: row.getAttribute('data-token') ?? '',
                textToken: row.getAttribute('data-text-token') ?? '',
                fill: cs.getPropertyValue(row.getAttribute('data-token') ?? '').trim(),
                label: cs.getPropertyValue(row.getAttribute('data-text-token') ?? '').trim(),
                printed: Number(row.getAttribute('data-ratio')),
            });
        }
        return out;
    });

    expect(rows.length, 'the page prints no contrast figures at all').toBeGreaterThanOrEqual(5);

    for (const r of rows) {
        const fill = parseColorToken(r.fill, 'light');
        const label = parseColorToken(r.label, 'light');
        expect(fill, `${r.token} did not resolve to a colour (${r.fill})`).not.toBeNull();
        expect(label, `${r.textToken} did not resolve to a colour (${r.label})`).not.toBeNull();

        const real = wcagContrast(fill!, label!);
        expect(r.printed, `${r.token}: the page prints ${r.printed}, the engine computes ${real.toFixed(2)}`)
            .toBeCloseTo(real, 1);
        expect(r.printed, `${r.token}: the label does not reach AA on its own fill`).toBeGreaterThanOrEqual(4.5);
    }
});

test('the page hands a designer the DTCG export, not a promise of one', async ({ page }) => {
    await openThemes(page);

    const json = await page.locator('[data-test="dtcg"]').innerText();
    expect(json.length, 'the DTCG block is empty').toBeGreaterThan(80);

    const parsed = JSON.parse(json) as Record<string, unknown>;
    // The format's own marker: every leaf carries $value, and groups nest. Asserting on the shape
    // rather than on the text keeps this from passing on a pretty-printed lie.
    expect(JSON.stringify(parsed), 'the block is not DTCG — no $value anywhere').toContain('$value');
});

test('the page names the tools a designer would look for', async ({ page }) => {
    await openThemes(page);
    const text = (await page.locator('main').innerText()).toLowerCase();

    for (const word of ['dtcg', 'wcag', 'oklch', 'createtheme']) {
        expect(text, `the page never mentions ${word}`).toContain(word);
    }
    await expect(page.locator('a[href*="themebuilder"]'), 'no way through to the builder').not.toHaveCount(0);
});
