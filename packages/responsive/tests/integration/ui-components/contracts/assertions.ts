/**
 * The assertion helpers of the manifest-driven runners, assertPositioning/assertOverlay included,
 * which wire the PositioningRule/OverlayRule up.
 *
 * Deterministic waits: no arbitrary waitForTimeout. For the states that may
 * animate (hover→shadow), the transitions are turned off and a couple of rAFs are awaited.
 */
import { expect, type Page } from '@playwright/test';
import { measureElement, measureMultiple, measureTextContrast, measureMark, measureColorVar } from './measure';
import { checkRelation } from './relations';
import type {
    NumericRule, StringRule, BorderSideRule, StandaloneRule,
    CompositionRule, StateRule, MeasuredElement, PositioningRule, OverlayRule,
} from './types';

// ── Deterministic wait: 2 animation frames ──
export async function settle(page: Page): Promise<void> {
    await page.evaluate(
        () => new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r()))),
    );
}

/** Turns CSS transitions/animations off, for instant and deterministic state measurements. */
export async function freezeAnimations(page: Page): Promise<void> {
    await page.addStyleTag({
        content: '*, *::before, *::after { transition: none !important; animation: none !important; }',
    });
}

// ── Numbers / strings ──

export function assertNumeric(actual: number, rule: NumericRule, label: string) {
    const tol = rule.tolerance ?? 1;
    switch (rule.op) {
        case '==': expect(Math.abs(actual - rule.value), label).toBeLessThanOrEqual(tol); break;
        case '!=': expect(Math.abs(actual - rule.value), label).toBeGreaterThan(tol); break;
        case '>=': expect(actual, label).toBeGreaterThanOrEqual(rule.value - tol); break;
        case '<=': expect(actual, label).toBeLessThanOrEqual(rule.value + tol); break;
        case '>': expect(actual, label).toBeGreaterThan(rule.value); break;
        case '<': expect(actual, label).toBeLessThan(rule.value); break;
        case 'between':
            expect(actual, label).toBeGreaterThanOrEqual(rule.range![0]);
            expect(actual, label).toBeLessThanOrEqual(rule.range![1]);
            break;
    }
}

export function assertString(actual: string, rule: StringRule, label: string) {
    switch (rule.op) {
        case 'is': expect(actual, label).toBe(rule.value as string); break;
        case 'isNot': expect(actual, label).not.toBe(rule.value as string); break;
        case 'contains': expect(actual, label).toContain(rule.value as string); break;
        case 'matches': expect(actual, label).toMatch(new RegExp(rule.value as string, 'i')); break;
        case 'oneOf': expect(rule.value as string[], label + ' oneOf').toContain(actual); break;
    }
}

function cap(s: string) { return s[0].toUpperCase() + s.slice(1); }

function assertBorderSide(m: MeasuredElement, side: string, rule: BorderSideRule, label: string) {
    if (rule.style) assertString(m[`border${cap(side)}Style` as keyof MeasuredElement] as string, rule.style, `${label} ${side} style`);
    if (rule.width) assertNumeric(m[`border${cap(side)}Width` as keyof MeasuredElement] as number, rule.width, `${label} ${side} width`);
    if (rule.color) assertString(m[`border${cap(side)}Color` as keyof MeasuredElement] as string, rule.color, `${label} ${side} color`);
}

export function assertStandaloneRule(m: MeasuredElement, rule: StandaloneRule) {
    const label = rule.description;
    if (rule.height) assertNumeric(m.height, rule.height, label + ' height');
    if (rule.width) assertNumeric(m.width, rule.width, label + ' width');
    if (rule.minHeight) assertNumeric(m.minHeight, rule.minHeight, label + ' minHeight');
    if (rule.maxWidth) assertNumeric(m.maxWidth, rule.maxWidth, label + ' maxWidth');
    if (rule.minWidth) assertNumeric(m.minWidth, rule.minWidth, label + ' minWidth');
    if (rule.opacity) assertNumeric(m.opacity, rule.opacity, label + ' opacity');
    // `if (rule.x)` skips 0, and 0 is the value this one is almost always asserted at.
    if (rule.contentOverflowX !== undefined) assertNumeric(m.contentOverflowX, rule.contentOverflowX, label + ' contentOverflowX');
    if (rule.fontSize) assertNumeric(m.fontSize, rule.fontSize, label + ' fontSize');
    if (rule.cursor) assertString(m.cursor, rule.cursor, label + ' cursor');
    if (rule.textTransform) assertString(m.textTransform, rule.textTransform, label + ' textTransform');
    if (rule.letterSpacing) assertString(m.letterSpacing, rule.letterSpacing, label + ' letterSpacing');
    if (rule.fontFamily) assertString(m.fontFamily, rule.fontFamily, label + ' fontFamily');
    if (rule.fontWeight) assertString(m.fontWeight, rule.fontWeight, label + ' fontWeight');
    if (rule.backgroundColor) assertString(m.backgroundColor, rule.backgroundColor, label + ' bg');
    if (rule.boxShadow) assertString(m.boxShadow, rule.boxShadow, label + ' boxShadow');
    if (rule.display) assertString(m.display, rule.display, label + ' display');
    if (rule.pointerEvents) assertString(m.pointerEvents, rule.pointerEvents, label + ' pointerEvents');
    if (rule.overflow) assertString(m.overflow, rule.overflow, label + ' overflow');
    if (rule.border) {
        for (const side of ['top', 'right', 'bottom', 'left'] as const) {
            const sideRule = rule.border[side] || rule.border.all;
            if (sideRule) assertBorderSide(m, side, sideRule, label);
        }
    }
    if (rule.radius) {
        for (const corner of ['topLeft', 'topRight', 'bottomRight', 'bottomLeft'] as const) {
            const cornerRule = rule.radius[corner] || rule.radius.all;
            if (cornerRule) assertNumeric(m[`border${cap(corner)}Radius` as keyof MeasuredElement] as number, cornerRule, `${label} ${corner} radius`);
        }
    }
}

/** A standalone rule's `contrast`: the text on its composited ground. */
export async function assertContrast(page: Page, rule: StandaloneRule): Promise<void> {
    if (!rule.contrast) return;
    const c = await measureTextContrast(page, rule.selector);
    expect(c, `Element not found: ${rule.selector} (${rule.description})`).not.toBeNull();
    const detail = `text ${c!.text} on ${c!.ground}${c!.image ? `, under a background image on ${c!.image}` : ''}`;
    // No tolerance unless the rule asks for one: assertNumeric's default of 1 is a pixel, and on a
    // ratio it turns the AA threshold of 4.5 into 3.5.
    assertNumeric(Number(c!.ratio.toFixed(2)), { tolerance: 0, ...rule.contrast }, `${rule.description} contrast (${detail})`);
}

/** A standalone rule's `colorVar`: the text is in the named token's colour. */
export async function assertColorVar(page: Page, rule: StandaloneRule): Promise<void> {
    if (!rule.colorVar) return;
    const c = await measureColorVar(page, rule.selector, rule.colorVar);
    expect(c, `Element not found: ${rule.selector} (${rule.description})`).not.toBeNull();
    expect(c!.color, `${rule.description}: text colour is ${rule.colorVar} (${c!.expected})`).toBe(c!.expected);
}

/** A standalone rule's `mark`: what is painted inside the element, read from its pixels. */
export async function assertMark(page: Page, rule: StandaloneRule): Promise<void> {
    if (!rule.mark) return;
    const m = await measureMark(page, rule.selector);
    expect(m, `Element not found: ${rule.selector} (${rule.description})`).not.toBeNull();
    const detail = `mark ${m!.mark} on fill ${m!.fill}, ${m!.pixels} px`;
    if (rule.mark.pixels) assertNumeric(m!.pixels, { tolerance: 0, ...rule.mark.pixels }, `${rule.description} mark pixels (${detail})`);
    if (rule.mark.contrast) assertNumeric(Number(m!.contrast.toFixed(2)), { tolerance: 0, ...rule.mark.contrast }, `${rule.description} mark contrast (${detail})`);
}

// ── Composition ──

// What each operator means, and the rule that a relation which cannot assert throws, live in
// ./relations — pure, so a unit test pins them.
export async function assertComposition(page: Page, rule: CompositionRule) {
    const selectors: Record<string, string> = { parent: rule.parent };
    for (const [name, sel] of Object.entries(rule.children)) selectors[name] = sel;
    const measurements = await measureMultiple(page, selectors);
    expect(measurements.parent, `Parent not found: ${rule.parent}`).not.toBeNull();
    for (const rel of rule.relations) {
        const label = `${rule.description}: ${rel.description}`;
        for (const check of checkRelation(rel, measurements)) {
            expect(check.pass, `${label} — ${check.what}: ${check.detail}`).toBe(true);
        }
    }
}

// ── State (hover/focus/click/attribute) ──

export async function assertState(page: Page, rule: StateRule) {
    const before = await measureElement(page, rule.selector);
    expect(before, `Element not found: ${rule.selector}`).not.toBeNull();
    const primary = rule.selector.split(',')[0].trim();
    switch (rule.trigger) {
        case 'hover': await page.locator(primary).first().hover({ force: true }); break;
        case 'focus': await page.locator(primary).first().focus(); break;
        case 'click': await page.locator(primary).first().click(); break;
        case 'attribute': /* the state is already in the DOM (e.g. disabled) */ break;
    }
    await settle(page);
    const after = await measureElement(page, rule.selector);
    expect(after, `Element not found after state: ${rule.selector}`).not.toBeNull();
    if (rule.changes.opacity) assertNumeric(after!.opacity, rule.changes.opacity, `${rule.description} opacity`);
    if (rule.changes.backgroundColor) assertString(after!.backgroundColor, rule.changes.backgroundColor, `${rule.description} bg`);
    if (rule.changes.boxShadow) assertString(after!.boxShadow, rule.changes.boxShadow, `${rule.description} shadow`);
    if (rule.changes.cursor) assertString(after!.cursor, rule.changes.cursor, `${rule.description} cursor`);
    if (rule.changes.mustDiffer) {
        for (const prop of rule.changes.mustDiffer) {
            expect(after![prop], `${rule.description}: ${prop} must differ`).not.toBe(before![prop]);
        }
    }
}

// ── Positioning (floating elements: tooltip, popover, dropdown) ──

export async function assertPositioning(page: Page, rule: PositioningRule) {
    const trig = page.locator(rule.trigger.selector).first();
    switch (rule.trigger.action) {
        case 'hover': await trig.hover({ force: true }); break;
        case 'click': await trig.click(); break;
        case 'focus': await trig.focus(); break;
    }
    // A DETERMINISTIC wait: the floating element has to become visible (this handles show-delay/render
    // without a fixed waitForTimeout). Then a settle, to stabilise the positioning.
    await page.locator(rule.floating).first().waitFor({ state: 'visible', timeout: rule.wait ?? 2000 });
    await settle(page);
    const pair = await measureMultiple(page, { trigger: rule.trigger.selector, floating: rule.floating });
    const t = pair.trigger, f = pair.floating;
    expect(t, `trigger not found: ${rule.trigger.selector}`).not.toBeNull();
    expect(f, `floating not found: ${rule.floating}`).not.toBeNull();
    const tol = rule.tolerance ?? 4;
    const label = rule.description;

    switch (rule.placement) {
        case 'top': expect(f!.bottom, `${label} above trigger`).toBeLessThanOrEqual(t!.top + tol); break;
        case 'bottom': expect(f!.top, `${label} below trigger`).toBeGreaterThanOrEqual(t!.bottom - tol); break;
        case 'left': expect(f!.right, `${label} left of trigger`).toBeLessThanOrEqual(t!.left + tol); break;
        case 'right': expect(f!.left, `${label} right of trigger`).toBeGreaterThanOrEqual(t!.right - tol); break;
        case 'center':
            expect(Math.abs(f!.centerX - t!.centerX), `${label} centerX`).toBeLessThanOrEqual(tol);
            break;
    }
    // The DISTANCE, not only the side: without `gap` a positioning contract asserts "below the
    // trigger" and cannot tell 4px from 40px, so it cannot gate `--pdx-float-offset`.
    //
    // The placement check alone is satisfied by ANY element below the trigger, so a floating
    // element sitting flush against it — gap 0 — passes. Without this, a contract measures which
    // side of the trigger the element is on and calls it positioning.
    if (rule.gap) {
        const distance =
            rule.placement === 'top' ? t!.top - f!.bottom
            : rule.placement === 'bottom' ? f!.top - t!.bottom
            : rule.placement === 'left' ? t!.left - f!.right
            : rule.placement === 'right' ? f!.left - t!.right
            : 0;
        assertNumeric(distance, rule.gap, `${label} gap`);
    }
    if (rule.alignment === 'center' && (rule.placement === 'top' || rule.placement === 'bottom')) {
        expect(Math.abs(f!.centerX - t!.centerX), `${label} cross-axis center`).toBeLessThanOrEqual(tol + 2);
    }
    if (rule.withinViewport) {
        const vp = page.viewportSize();
        if (vp) {
            expect(f!.left, `${label} within viewport left`).toBeGreaterThanOrEqual(-tol);
            expect(f!.right, `${label} within viewport right`).toBeLessThanOrEqual(vp.width + tol);
        }
    }
}

// ── Overlay (dialog/drawer/modal) ──

export async function assertOverlay(page: Page, rule: OverlayRule) {
    const trig = page.locator(rule.trigger.selector).first();
    if (rule.trigger.action === 'click') await trig.click();
    await settle(page);

    const sels: Record<string, string> = { panel: rule.panel };
    if (rule.backdrop) sels.backdrop = rule.backdrop;
    const m = await measureMultiple(page, sels);
    expect(m.panel, `panel not found: ${rule.panel}`).not.toBeNull();
    const label = rule.description;
    const vp = page.viewportSize();

    if (rule.width) assertNumeric(m.panel!.width, rule.width, `${label} width`);
    if (rule.minWidth) assertNumeric(m.panel!.minWidth, rule.minWidth, `${label} minWidth`);
    if (rule.maxWidth) assertNumeric(m.panel!.maxWidth, rule.maxWidth, `${label} maxWidth`);
    if (rule.hasBackdrop) expect(m.backdrop, `${label} has backdrop`).not.toBeNull();
    if (rule.centering && vp) {
        if (rule.centering === 'horizontal' || rule.centering === 'both') {
            expect(Math.abs(m.panel!.centerX - vp.width / 2), `${label} h-centered`).toBeLessThanOrEqual(2);
        }
        if (rule.centering === 'vertical' || rule.centering === 'both') {
            expect(Math.abs(m.panel!.centerY - vp.height / 2), `${label} v-centered`).toBeLessThanOrEqual(2);
        }
    }
}
