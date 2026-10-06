// Category 1 — Prop reactivity: changing a prop AFTER mount must update the rendered DOM.
// A component that snapshots a prop at setup and ignores later changes fails here.
import { test } from '@playwright/test';
import { mount, mountRaw, setProp, inputValue, SUBJECT, expect } from './helpers';

const OPTS2 = JSON.stringify([{ label: 'A', value: 'a' }, { label: 'B', value: 'b' }]);
const OPTS3 = JSON.stringify([{ label: 'A', value: 'a' }, { label: 'B', value: 'b' }, { label: 'C', value: 'c' }]);
const COLS = JSON.stringify([{ field: 'name', header: 'Name' }, { field: 'age', header: 'Age' }]);
const ROWS3 = JSON.stringify([{ name: 'A', age: 1 }, { name: 'B', age: 2 }, { name: 'C', age: 3 }]);
const ROWS1 = JSON.stringify([{ name: 'Z', age: 9 }]);

test.describe('reactivity', () => {
    test('number-input: value reflects a prop change after mount', async ({ page }) => {
        await mount(page, 'pdx-number-input', { attrs: { value: 5 } });
        expect(await inputValue(page)).toBe('5');
        await setProp(page, 'value', 9);
        expect(await inputValue(page)).toBe('9');
    });

    test('number-input: display re-clamps when min is raised above the value', async ({ page }) => {
        await mount(page, 'pdx-number-input', { attrs: { value: 5 } });
        await setProp(page, 'min', 8);
        expect(Number(await inputValue(page))).toBeGreaterThanOrEqual(8);
    });

    test('number-input: display re-clamps when max is lowered below the value', async ({ page }) => {
        await mount(page, 'pdx-number-input', { attrs: { value: 50 } });
        await setProp(page, 'max', 10);
        expect(Number(await inputValue(page))).toBeLessThanOrEqual(10);
    });

    // ── input ──────────────────────────────────────────────────────────────
    test('input: value reflects a prop change after mount', async ({ page }) => {
        await mount(page, 'pdx-input', { attrs: { value: 'hi' } });
        expect(await inputValue(page)).toBe('hi');
        await setProp(page, 'value', 'bye');
        expect(await inputValue(page)).toBe('bye');
    });

    test('input: disabled reflects on the inner control after mount', async ({ page }) => {
        await mount(page, 'pdx-input');
        expect(await page.$eval(`${SUBJECT} input`, (i: any) => i.disabled)).toBe(false);
        await setProp(page, 'disabled', true);
        expect(await page.$eval(`${SUBJECT} input`, (i: any) => i.disabled)).toBe(true);
    });

    test('input: placeholder reflects a prop change after mount', async ({ page }) => {
        await mount(page, 'pdx-input', { attrs: { placeholder: 'first' } });
        await setProp(page, 'placeholder', 'second');
        expect(await page.$eval(`${SUBJECT} input`, (i: any) => i.placeholder)).toBe('second');
    });

    // ── button ─────────────────────────────────────────────────────────────
    test('button: disabled reflects on the inner button after mount', async ({ page }) => {
        await mount(page, 'pdx-button', { text: 'Go' });
        expect(await page.$eval(`${SUBJECT} button`, (b: any) => b.disabled)).toBe(false);
        await setProp(page, 'disabled', true);
        expect(await page.$eval(`${SUBJECT} button`, (b: any) => b.disabled)).toBe(true);
    });

    // ── select ─────────────────────────────────────────────────────────────
    test('select: value change updates the displayed label', async ({ page }) => {
        await mount(page, 'pdx-select', { attrs: { options: OPTS2, value: 'a' } });
        expect((await page.$eval(`${SUBJECT} .pdx-select-value`, (e) => e.textContent))?.trim()).toBe('A');
        await setProp(page, 'value', 'b');
        expect((await page.$eval(`${SUBJECT} .pdx-select-value`, (e) => e.textContent))?.trim()).toBe('B');
    });

    test('select: options change updates the rendered option list', async ({ page }) => {
        await mount(page, 'pdx-select', { attrs: { options: OPTS2 } });
        expect(await page.$$eval(`${SUBJECT} .pdx-select-option`, (els) => els.length)).toBe(2);
        await setProp(page, 'options', JSON.parse(OPTS3));
        expect(await page.$$eval(`${SUBJECT} .pdx-select-option`, (els) => els.length)).toBe(3);
    });

    // ── data-grid ──────────────────────────────────────────────────────────
    test('data-grid: data change updates the rendered row count', async ({ page }) => {
        await mount(page, 'pdx-data-grid', { attrs: { columns: COLS, data: ROWS3 } });
        expect(await page.$$eval(`${SUBJECT} .pdx-dg-row`, (els) => els.length)).toBe(3);
        await setProp(page, 'data', JSON.parse(ROWS1));
        expect(await page.$$eval(`${SUBJECT} .pdx-dg-row`, (els) => els.length)).toBe(1);
    });

    // ── drawer / dialog (overlay open state) ─────────────────────────────────
    test('drawer: open prop toggles panel visibility (data-open)', async ({ page }) => {
        await mountRaw(page, 'pdx-drawer');
        // The backdrop is found wherever the drawer put it: under the host, or in <body> when an
        // ancestor would trap the panel (needsPortal) — the harness has none.
        const backdrop = page.locator('.pdx-drawer-backdrop');
        await expect(backdrop).toHaveCount(1);
        await expect(backdrop).not.toHaveAttribute('data-open');
        await setProp(page, 'open', true);
        await expect(backdrop).toHaveAttribute('data-open');
    });

    test('dialog: open prop toggles panel visibility (data-open)', async ({ page }) => {
        await mountRaw(page, 'pdx-dialog', { attrs: { title: 'T' } });
        expect(await page.$eval(`${SUBJECT} .pdx-dialog-backdrop`, (e) => e.hasAttribute('data-open'))).toBe(false);
        await setProp(page, 'open', true);
        expect(await page.$eval(`${SUBJECT} .pdx-dialog-backdrop`, (e) => e.hasAttribute('data-open'))).toBe(true);
    });
});
