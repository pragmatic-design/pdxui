// Category 2 — Invariants / constraints: invalid prop combinations must self-normalize, never break.
import { test } from '@playwright/test';
import { mount, inputValue, SUBJECT, expect } from './helpers';

const OPTS2 = JSON.stringify([{ label: 'A', value: 'a' }, { label: 'B', value: 'b' }]);
const COLS = JSON.stringify([{ field: 'name', header: 'Name' }]);

test.describe('invariants', () => {
    test('number-input: initial value above max is clamped into range', async ({ page }) => {
        await mount(page, 'pdx-number-input', { attrs: { min: 0, max: 10, value: 50 } });
        expect(Number(await inputValue(page))).toBeLessThanOrEqual(10);
    });

    test('number-input: initial value below min is clamped into range', async ({ page }) => {
        await mount(page, 'pdx-number-input', { attrs: { min: 20, max: 100, value: 5, allownegative: '' } });
        expect(Number(await inputValue(page))).toBeGreaterThanOrEqual(20);
    });

    test('number-input: max < min does not break — value stays a finite number in [min, max-effective]', async ({ page }) => {
        await mount(page, 'pdx-number-input', { attrs: { min: 10, max: 5, value: 7 } });
        const v = await inputValue(page);
        expect(v).not.toBe('');
        expect(Number.isFinite(Number(v))).toBe(true);
        // effective max is normalised to >= min, so the value never sits below min
        expect(Number(v)).toBeGreaterThanOrEqual(10);
    });

    // ── select: a value with no matching option must not mark any option selected (no crash) ──
    test('select: value not in options → nothing rendered as selected, still renders', async ({ page }) => {
        await mount(page, 'pdx-select', { attrs: { options: OPTS2, value: 'does-not-exist' } });
        expect(await page.$$eval(`${SUBJECT} .pdx-select-option`, (els) => els.length)).toBe(2);
        const selected = await page.$$eval(`${SUBJECT} .pdx-select-option[aria-selected="true"]`, (els) => els.length);
        expect(selected).toBe(0);
    });

    // ── data-grid: empty/absent data → empty state, zero rows, no crash ──
    test('data-grid: empty data renders the empty state with zero rows', async ({ page }) => {
        await mount(page, 'pdx-data-grid', { attrs: { columns: COLS, data: '[]' } });
        expect(await page.$$eval(`${SUBJECT} .pdx-dg-row`, (els) => els.length)).toBe(0);
        expect(await page.$(`${SUBJECT} .pdx-dg-empty`)).toBeTruthy();
    });
});
