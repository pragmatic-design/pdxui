/**
 * DIMENSION 4 — Keyboard / WAI-ARIA, data-driven from the manifests.
 *
 * It runs a deterministic key sequence (page.keyboard.press, no timing) and
 * checks focus, ARIA attributes, the focus trap, the events emitted (expectEvent), the element
 * pointed at by aria-activedescendant (expectActiveDescendant) and the move or resize of an
 * element (expectGeometryChange). After the last step, with `trapContainer`, it checks
 * that Tab and Shift+Tab do not take the focus out of the container.
 * A field of KeyStep or of KeyboardSpec that the runner does not read fails the first two tests:
 * HANDLED_STEP_FIELDS, HANDLED_SPEC_FIELDS.
 *
 * Theme-independent → run on 'neutral'.
 */
import { test, expect } from './contracts/fixture';
import { goToScenario } from './contracts/measure';
import { settle } from './contracts/assertions';
import { manifests, scenarioPage } from './contracts/generated/manifests';

/** How many times the trap check presses Tab, then Shift+Tab: more than any trapped panel's tab stops. */
const TRAP_PRESSES = 10;

/**
 * The KeyStep fields this runner checks, and the only ones a manifest may write. A field added to
 * the type and not to the runner costs nothing: a step that writes a field no one reads passes
 * whatever the component does. The first test below fails on a field that is not in this list.
 */
const HANDLED_STEP_FIELDS = new Set<string>(['key', 'expectFocus', 'expectFocusWithin', 'expectAttr', 'expectEvent', 'expectActiveDescendant', 'expectGeometryChange']);

type Box = { x: number; y: number; width: number; height: number };

/** The first element `selector` matches, as a rect; the step fails if it matches nothing. */
async function boxOf(page: any, selector: string): Promise<Box> {
    return page.evaluate((sel: string) => {
        const el = document.querySelector(sel);
        if (!el) throw new Error(`expectGeometryChange: ${sel} matches nothing`);
        const r = el.getBoundingClientRect();
        return { x: r.x, y: r.y, width: r.width, height: r.height };
    }, selector);
}

test('keyboard: every step field a manifest writes is one this runner checks', () => {
    const unread: string[] = [];
    for (const m of manifests) {
        for (const [i, step] of (m.keyboard?.steps ?? []).entries()) {
            for (const field of Object.keys(step)) {
                if (!HANDLED_STEP_FIELDS.has(field)) unread.push(`${m.name} step ${i + 1}: ${field}`);
            }
        }
    }
    expect(unread).toEqual([]);
});

/**
 * The KeyboardSpec fields this runner reads, and the only ones a manifest may write — the same
 * guard one level up: a spec field the runner does not read is a promise nothing keeps.
 */
const HANDLED_SPEC_FIELDS = new Set<string>(['scenario', 'initialFocus', 'steps', 'trapContainer']);

test('keyboard: every spec field a manifest writes is one this runner reads', () => {
    const unread: string[] = [];
    for (const m of manifests) {
        for (const field of Object.keys(m.keyboard ?? {})) {
            if (!HANDLED_SPEC_FIELDS.has(field)) unread.push(`${m.name}: ${field}`);
        }
    }
    expect(unread).toEqual([]);
});

async function focusMatches(page: any, selector: string): Promise<boolean> {
    return page.evaluate((sel: string) => {
        const a = document.activeElement;
        return !!a && a.matches(sel);
    }, selector);
}

async function focusWithin(page: any, container: string): Promise<boolean> {
    return page.evaluate((sel: string) => {
        const c = document.querySelector(sel);
        return !!c && !!document.activeElement && c.contains(document.activeElement);
    }, container);
}

/** Whether the focus is inside `container`, and what holds it, for the trap check's message. */
async function focusProbe(page: any, container: string): Promise<{ inside: boolean; focused: string }> {
    return page.evaluate((sel: string) => {
        const c = document.querySelector(sel);
        const a = document.activeElement;
        const focused = a ? a.outerHTML.slice(0, 120) : 'nothing';
        return { inside: !!c && !!a && c.contains(a), focused };
    }, container);
}

for (const m of manifests) {
    if (!m.keyboard) continue;
    const k = m.keyboard;
    const pageSlug = scenarioPage[k.scenario];
    const steps = k.steps ?? [];

    test(`keyboard: ${m.name}`, async ({ page }) => {
        await goToScenario(page, k.scenario, 'neutral', { page: pageSlug });
        // Settle: the components with a focusGroup (radio-group/segmented) set the roving
        // tabindex in a rAF after the mount; without the wait the first Tab finds no focusable.
        await settle(page);
        if (k.initialFocus) await page.locator(k.initialFocus).first().focus();

        for (const [i, step] of steps.entries()) {
            // A counter on the element, installed before the key and removed after the read, so the
            // listeners of earlier steps do not add up.
            if (step.expectEvent) {
                await page.evaluate(({ selector, name }) => {
                    const target = document.querySelector(selector);
                    if (!target) throw new Error(`expectEvent: ${selector} matches nothing`);
                    const probe = { n: 0, off: () => {} };
                    const count = () => { probe.n++; };
                    target.addEventListener(name, count);
                    probe.off = () => target.removeEventListener(name, count);
                    (window as unknown as { __pdxKeyProbe: typeof probe }).__pdxKeyProbe = probe;
                }, step.expectEvent);
            }
            // The rect before the key, compared after it: the element must have moved or resized.
            const before = step.expectGeometryChange ? await boxOf(page, step.expectGeometryChange) : null;
            await page.keyboard.press(step.key);
            await settle(page);
            const at = `after step ${i + 1} (${step.key})`;

            if (step.expectGeometryChange && before) {
                const after = await boxOf(page, step.expectGeometryChange);
                const moved = (['x', 'y', 'width', 'height'] as const).some((k) => Math.abs(after[k] - before[k]) > 0.5);
                expect(moved, `${at}: ${step.expectGeometryChange} did not move or resize — before ${JSON.stringify(before)}, after ${JSON.stringify(after)}`).toBe(true);
            }

            if (step.expectEvent) {
                const n = await page.evaluate(() => {
                    const probe = (window as unknown as { __pdxKeyProbe: { n: number; off: () => void } }).__pdxKeyProbe;
                    probe.off();
                    return probe.n;
                });
                expect(n, `${at}: ${step.expectEvent.name} on ${step.expectEvent.selector}`).toBe(step.expectEvent.count ?? 1);
            }

            if (step.expectFocus) {
                expect(await focusMatches(page, step.expectFocus), `${at}: focus on ${step.expectFocus}`).toBe(true);
            }
            if (step.expectFocusWithin) {
                expect(await focusWithin(page, step.expectFocusWithin), `${at}: focus within ${step.expectFocusWithin}`).toBe(true);
            }
            if (step.expectAttr) {
                const val = await page.locator(step.expectAttr.selector).first().getAttribute(step.expectAttr.name);
                expect(val, `${at}: ${step.expectAttr.selector}[${step.expectAttr.name}]`).toBe(step.expectAttr.value);
            }
            // The element the focused control's aria-activedescendant names, matched against a
            // selector: the id is generated, the element it must reach is not.
            if (step.expectActiveDescendant) {
                const found = await page.evaluate(({ selector, target }) => {
                    const owner = document.querySelector(selector);
                    const id = owner?.getAttribute('aria-activedescendant');
                    const el = id ? document.getElementById(id) : null;
                    return { id: id ?? null, matches: !!el && el.matches(target), text: el?.textContent?.trim() ?? null };
                }, step.expectActiveDescendant);
                expect(found.matches, `${at}: ${step.expectActiveDescendant.selector} aria-activedescendant="${found.id}" (${found.text}) is not ${step.expectActiveDescendant.target}`).toBe(true);
            }
        }

        // The focus trap, after the last step: Tab and then Shift+Tab, TRAP_PRESSES times each, must
        // leave the focus inside the container. One Tab from a panel's first control reaches its second
        // with or without a trap, so a single expectFocusWithin step cannot tell the two apart.
        if (k.trapContainer) {
            const container = k.trapContainer;
            expect(await page.locator(container).count(), `trapContainer ${container} matches nothing after the last step`).toBeGreaterThan(0);
            for (const key of ['Tab', 'Shift+Tab']) {
                for (let n = 1; n <= TRAP_PRESSES; n++) {
                    await page.keyboard.press(key);
                    await settle(page);
                    const probe = await focusProbe(page, container);
                    expect(probe.inside, `trap: ${key} ×${n} took the focus out of ${container}, to ${probe.focused}`).toBe(true);
                }
            }
        }
    });
}
