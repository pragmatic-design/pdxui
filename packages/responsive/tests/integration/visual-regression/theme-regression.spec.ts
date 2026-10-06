/**
 * Theme × component structure, on the showcase pages.
 *
 * Structural checks (JS): border-radius, border-width, background, opacity, per theme. Fast,
 * deterministic, and the same on every host.
 *
 * No screenshots here: baselines taken on one kind of host can be checked on that host only, and
 * drift. The pixels of these components are the Docker `visual-runner`'s, in `certify:visual`, with
 * `-docker-linux` baselines.
 *
 * Run after a batch of CSS/theme changes:
 *   npx playwright test --config tests/playwright-visual.config.ts theme-regression
 */

import { test, expect, type Page } from '@playwright/test';

const THEMES = [
    'neutral', 'material', 'fluent', 'cupertino', 'pragmatic',
    'corporate', 'playful', 'cyberpunk', 'editorial', 'neumorphic', 'glass',
] as const;

type Theme = typeof THEMES[number];

const DARK_THEMES: Theme[] = ['cyberpunk', 'glass'];

function schemeFor(theme: Theme): string {
    return DARK_THEMES.includes(theme) ? 'dark' : 'light';
}

async function navigateTo(page: Page, path: string, theme: Theme) {
    const scheme = schemeFor(theme);
    await page.goto(`${path}?theme=${theme}&scheme=${scheme}`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(400);
}

// ═══════════════════════════════════════════════════════════════════
// 1. STRUCTURAL CHECKS — deterministic, no screenshot needed
// ═══════════════════════════════════════════════════════════════════

test.describe('Button Group — radius structure', () => {
    for (const theme of THEMES) {
        test(`[${theme}] middle buttons have zero radius`, async ({ page }) => {
            await navigateTo(page, '/components/button-group', theme);

            const issues = await page.evaluate(() => {
                const problems: string[] = [];
                const groups = document.querySelectorAll('.pdx-btn-group, pdx-button-group');
                groups.forEach((g, gi) => {
                    const buttons = g.querySelectorAll('button');
                    if (buttons.length < 3) return;
                    const arr = Array.from(buttons);
                    // Skip first and last
                    for (let i = 1; i < arr.length - 1; i++) {
                        const r = getComputedStyle(arr[i]).borderRadius;
                        if (r !== '0px') {
                            problems.push(`group[${gi}] btn[${i}] "${arr[i].textContent?.trim()}" radius=${r}`);
                        }
                    }
                });
                return problems;
            });

            expect(issues, `Middle buttons should have radius 0`).toEqual([]);
        });
    }
});

test.describe('Input — variant structure', () => {
    const FILLED_THEMES: Theme[] = ['material'];
    const UNDERLINED_THEMES: Theme[] = ['editorial', 'cyberpunk'];

    for (const theme of FILLED_THEMES) {
        test(`[${theme}] filled inputs have no side/top border`, async ({ page }) => {
            await navigateTo(page, '/components/input', theme);

            const check = await page.evaluate(() => {
                const wrap = document.querySelector('.pdx-input-wrap');
                if (!wrap) return { ok: false, reason: 'no .pdx-input-wrap found' };
                const cs = getComputedStyle(wrap);
                return {
                    ok: cs.borderTopWidth === '0px' && cs.borderLeftWidth === '0px' && cs.borderRightWidth === '0px',
                    borderTop: cs.borderTopWidth,
                    borderLeft: cs.borderLeftWidth,
                    borderBottom: cs.borderBottomWidth,
                    bg: cs.backgroundColor,
                };
            });

            expect(check.ok, `Filled input should have no top/side borders: ${JSON.stringify(check)}`).toBe(true);
        });
    }

    for (const theme of UNDERLINED_THEMES) {
        test(`[${theme}] underlined inputs have transparent bg and no side border`, async ({ page }) => {
            await navigateTo(page, '/components/input', theme);

            const check = await page.evaluate(() => {
                const wrap = document.querySelector('.pdx-input-wrap');
                if (!wrap) return { ok: false, reason: 'no .pdx-input-wrap found' };
                const cs = getComputedStyle(wrap);
                const bgTransparent = cs.backgroundColor === 'rgba(0, 0, 0, 0)' || cs.backgroundColor === 'transparent';
                return {
                    ok: cs.borderTopWidth === '0px' && cs.borderLeftWidth === '0px' && bgTransparent,
                    borderTop: cs.borderTopWidth,
                    borderLeft: cs.borderLeftWidth,
                    bg: cs.backgroundColor,
                    radius: cs.borderRadius,
                };
            });

            expect(check.ok, `Underlined input should have no borders except bottom, transparent bg: ${JSON.stringify(check)}`).toBe(true);
        });
    }
});

test.describe('Tab — pill vs underline structure', () => {
    const PILL_THEMES: Theme[] = ['pragmatic', 'cupertino', 'playful'];

    for (const theme of PILL_THEMES) {
        test(`[${theme}] pill tabs have no bottom border on .pdx-tabs`, async ({ page }) => {
            await navigateTo(page, '/components/tabs', theme);

            const check = await page.evaluate(() => {
                const tabs = document.querySelector('.pdx-tabs');
                if (!tabs) return { ok: false, reason: 'no .pdx-tabs found' };
                const cs = getComputedStyle(tabs);
                const noBorder = cs.borderBottomStyle === 'none' || cs.borderBottomWidth === '0px';
                return { ok: noBorder, borderBottom: cs.borderBottom, bg: cs.backgroundColor };
            });

            expect(check.ok, `Pill tabs should have no bottom border: ${JSON.stringify(check)}`).toBe(true);
        });
    }

    for (const theme of PILL_THEMES) {
        test(`[${theme}] pill tab indicator is hidden`, async ({ page }) => {
            await navigateTo(page, '/components/tabs', theme);

            const hidden = await page.evaluate(() => {
                const ind = document.querySelector('.pdx-tab-indicator');
                if (!ind) return true; // no indicator = fine
                const cs = getComputedStyle(ind);
                return cs.display === 'none';
            });

            expect(hidden, `Pill tab indicator should be display:none`).toBe(true);
        });
    }
});

test.describe('Card — elevated vs bordered structure', () => {
    const ELEVATED_THEMES: Theme[] = ['material', 'playful'];

    for (const theme of ELEVATED_THEMES) {
        test(`[${theme}] elevated cards have no border`, async ({ page }) => {
            await navigateTo(page, '/design/surfaces', theme);

            const check = await page.evaluate(() => {
                const card = document.querySelector('.pdx-surface-card');
                if (!card) return { ok: false, reason: 'no card found' };
                const cs = getComputedStyle(card);
                const noBorder = cs.borderTopWidth === '0px' || cs.borderTopStyle === 'none'
                    || cs.borderColor === 'transparent' || cs.borderTopColor === 'rgba(0, 0, 0, 0)';
                return {
                    ok: noBorder,
                    border: cs.border,
                    shadow: cs.boxShadow !== 'none',
                };
            });

            expect(check.ok, `Elevated card should have no visible border: ${JSON.stringify(check)}`).toBe(true);
        });
    }
});
