/**
 * Tooltip positioning — mathematical validation.
 * Measures element geometry after hover interaction.
 * Catches positioning regressions without visual inspection.
 */
import { test, expect } from './contracts/fixture';

const BASE_URL = 'http://localhost:5220/tooltip-positions.html';
const TOLERANCE = 4;

/** Hover a trigger via locator, wait for tooltip, return both rects */
async function hoverAndMeasure(page: any, triggerSel: string) {
    await page.locator(triggerSel).hover({ force: true });
    await page.waitForTimeout(400);

    return page.evaluate((tSel: string) => {
        const trigger = document.querySelector(tSel);
        if (!trigger) return null;
        const tooltipCE = trigger.nextElementSibling;
        if (!tooltipCE || tooltipCE.tagName !== 'PDX-TOOLTIP') return null;
        const floating = tooltipCE.querySelector('.pdx-tooltip-float') as HTMLElement;
        if (!floating || floating.style.display === 'none') return null;

        const tr = trigger.getBoundingClientRect();
        const tt = floating.getBoundingClientRect();
        return {
            trigger: { top: tr.top, bottom: tr.bottom, left: tr.left, right: tr.right,
                       centerX: tr.left + tr.width / 2, centerY: tr.top + tr.height / 2 },
            tooltip: { top: tt.top, bottom: tt.bottom, left: tt.left, right: tt.right,
                       centerX: tt.left + tt.width / 2, centerY: tt.top + tt.height / 2 },
        };
    }, triggerSel);
}

test.describe('Tooltip positioning', () => {
    test.beforeEach(async ({ page }) => {
        await page.goto(BASE_URL, { waitUntil: 'networkidle' });
        await page.waitForTimeout(500);
    });

    test('top: above trigger, centered', async ({ page }) => {
        const m = await hoverAndMeasure(page, '[data-test="trigger-top"]');
        expect(m).not.toBeNull();
        expect(m!.tooltip.bottom).toBeLessThanOrEqual(m!.trigger.top + TOLERANCE);
        expect(Math.abs(m!.tooltip.centerX - m!.trigger.centerX)).toBeLessThan(TOLERANCE);
    });

    test('bottom: below trigger, centered', async ({ page }) => {
        const m = await hoverAndMeasure(page, '[data-test="trigger-bottom"]');
        expect(m).not.toBeNull();
        expect(m!.tooltip.top).toBeGreaterThanOrEqual(m!.trigger.bottom - TOLERANCE);
        expect(Math.abs(m!.tooltip.centerX - m!.trigger.centerX)).toBeLessThan(TOLERANCE);
    });

    test('left: left of trigger, vertically centered', async ({ page }) => {
        const m = await hoverAndMeasure(page, '[data-test="trigger-left"]');
        expect(m).not.toBeNull();
        expect(m!.tooltip.right).toBeLessThanOrEqual(m!.trigger.left + TOLERANCE);
        expect(Math.abs(m!.tooltip.centerY - m!.trigger.centerY)).toBeLessThan(TOLERANCE);
    });

    test('right: right of trigger, vertically centered', async ({ page }) => {
        const m = await hoverAndMeasure(page, '[data-test="trigger-right"]');
        expect(m).not.toBeNull();
        expect(m!.tooltip.left).toBeGreaterThanOrEqual(m!.trigger.right - TOLERANCE);
        expect(Math.abs(m!.tooltip.centerY - m!.trigger.centerY)).toBeLessThan(TOLERANCE);
    });

    test('top-start: above, left-aligned', async ({ page }) => {
        const m = await hoverAndMeasure(page, '[data-test="trigger-top-start"]');
        expect(m).not.toBeNull();
        expect(m!.tooltip.bottom).toBeLessThanOrEqual(m!.trigger.top + TOLERANCE);
        expect(Math.abs(m!.tooltip.left - m!.trigger.left)).toBeLessThan(TOLERANCE);
    });

    test('top-end: above, right-aligned', async ({ page }) => {
        const m = await hoverAndMeasure(page, '[data-test="trigger-top-end"]');
        expect(m).not.toBeNull();
        expect(m!.tooltip.bottom).toBeLessThanOrEqual(m!.trigger.top + TOLERANCE);
        expect(Math.abs(m!.tooltip.right - m!.trigger.right)).toBeLessThan(TOLERANCE);
    });

    test('bottom-start: below, left-aligned', async ({ page }) => {
        const m = await hoverAndMeasure(page, '[data-test="trigger-bottom-start"]');
        expect(m).not.toBeNull();
        expect(m!.tooltip.top).toBeGreaterThanOrEqual(m!.trigger.bottom - TOLERANCE);
        expect(Math.abs(m!.tooltip.left - m!.trigger.left)).toBeLessThan(TOLERANCE);
    });

    test('bottom-end: below, right-aligned', async ({ page }) => {
        const m = await hoverAndMeasure(page, '[data-test="trigger-bottom-end"]');
        expect(m).not.toBeNull();
        expect(m!.tooltip.top).toBeGreaterThanOrEqual(m!.trigger.bottom - TOLERANCE);
        expect(Math.abs(m!.tooltip.right - m!.trigger.right)).toBeLessThan(TOLERANCE);
    });
});
