/**
 * DIMENSION 3 — Style isolation (immunity to somebody else's style), data-driven from the manifests.
 *
 * It measures the targets BEFORE, injects hostile global CSS the way the design system's contract
 * says a host loads it (in a `host` layer declared before `pdx`, see tooling/hostile-css.ts), and
 * measures again AFTER. What is compared is the computed colour, background, font, line height,
 * letter spacing and top border, exactly, plus the height and the four radii within `tolerancePx`.
 * Unlayered host CSS wins over the design system by design, and is not what this measures.
 *
 * A property that changes is a leak, except a text property (colour, font, line height, letter
 * spacing) that changed only because the container did: a component's text follows where it is
 * placed (see INHERITED).
 * A leak the manifest lists (`leaks`, each with the issue that
 * removes it) is expected, and fails the run when it STOPS leaking, so the entry goes when the issue
 * lands. A leak it does not list fails. A failure is a real vulnerability of the design system, not
 * of the test.
 *
 * Two themes: `neutral`, and `material`, which sets behaviour attributes. Theme rules decide which
 * selectors a component wins with, so a leak can belong to one theme and not the other.
 *
 * PDX_ISOLATION_RECORD=<dir> also writes what each test observed to <dir>/<component>.<theme>.json:
 * the source for filling the `leaks` lists after a change to the hostile CSS or to the design system.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Page } from '@playwright/test';
import { test, expect } from './contracts/fixture';
import { goToScenario } from './contracts/measure';
import { freezeAnimations, settle } from './contracts/assertions';
import { manifests, scenarioPage } from './contracts/generated/manifests';
import { HOSTILE_STYLESHEET } from '../../tooling/hostile-css';
import type { IsolatedProperty } from '../../manifests/_types';

const THEMES = ['neutral', 'material'];

/** Compared exactly, as getComputedStyle reports them. */
const EXACT = ['color', 'backgroundColor', 'fontFamily', 'fontSize', 'lineHeight', 'letterSpacing',
    'borderTopWidth', 'borderTopStyle', 'borderTopColor'] as const;

/**
 * The text properties a component takes from the container it is placed in, like a native element
 * (decisions.md, point 38; #170). A host rule that styles the container reaches the component through
 * inheritance, and that is intended; a host rule that hits the component's own element is the leak.
 *
 * The two are told apart by measuring the target a third time with the host's rules kept off the
 * target itself (`followed`): a value equal to that one came from the container. Comparing with the
 * container's computed value would not do: the host's `line-height: 2.2` is inherited as a number and
 * resolves against the target's own font size, and a component's `font-size: 0.85em` scales the
 * container's — both follow the container and neither equals it.
 */
const INHERITED = ['color', 'fontFamily', 'fontSize', 'lineHeight', 'letterSpacing'] as const;

type Style = Record<(typeof EXACT)[number], string> & { height: number; radius: number[] };

/** The marker on the target while the host's rules are kept off it. */
const SELF = 'data-pdx-isolation-self';

async function styleOf(page: Page, selector: string): Promise<Style | null> {
    return page.evaluate(({ sel, exact }) => {
        const el = document.querySelector(sel);
        if (!el) return null;
        const cs = getComputedStyle(el);
        const out: Record<string, unknown> = {};
        for (const k of exact) out[k] = cs[k as keyof CSSStyleDeclaration];
        out.height = el.getBoundingClientRect().height;
        out.radius = [cs.borderTopLeftRadius, cs.borderTopRightRadius, cs.borderBottomLeftRadius,
            cs.borderBottomRightRadius].map((r) => parseFloat(r) || 0);
        return out as Style;
    }, { sel: selector, exact: EXACT as readonly string[] });
}

/** The target's text properties with every host rule rewritten to skip the marked element. */
async function followedOf(page: Page, selector: string): Promise<Record<(typeof INHERITED)[number], string>> {
    return page.evaluate(({ sel, inherited, self }) => {
        const el = document.querySelector(sel)!;
        el.setAttribute(self, '');
        const cs = getComputedStyle(el);
        const out = Object.fromEntries(inherited.map((k) => [k, cs[k as keyof CSSStyleDeclaration] as string]));
        el.removeAttribute(self);
        return out as Record<string, string>;
    }, { sel: selector, inherited: INHERITED as readonly string[], self: SELF }) as Promise<Record<(typeof INHERITED)[number], string>>;
}

/**
 * The properties that differ between two measures of one target. A text property is not counted
 * when its value is the one the target takes with the host's rules kept off it.
 */
function changed(before: Style, after: Style, followed: Record<(typeof INHERITED)[number], string>,
    tolerancePx: number, skipHeight: boolean): IsolatedProperty[] {
    const followsContainer = (k: (typeof EXACT)[number]) =>
        (INHERITED as readonly string[]).includes(k) && after[k] === followed[k as (typeof INHERITED)[number]];
    const out: IsolatedProperty[] = EXACT.filter((k) => before[k] !== after[k] && !followsContainer(k));
    if (!skipHeight && Math.abs(after.height - before.height) > tolerancePx) out.push('height');
    if (before.radius.some((r, i) => Math.abs(after.radius[i] - r) > tolerancePx)) out.push('radius');
    return out;
}

for (const m of manifests) {
    if (!m.isolation) continue;
    const { scenario, targets } = m.isolation;
    const pageSlug = scenarioPage[scenario];

    for (const theme of THEMES.filter((t) => !m.themes || m.themes.includes(t))) {
        test(`isolation: ${m.name} (${theme})`, async ({ page }) => {
            await goToScenario(page, scenario, theme, { page: pageSlug });
            await freezeAnimations(page);

            const before: Record<string, Style> = {};
            for (const t of targets) {
                const s = await styleOf(page, t.selector);
                expect(s, `target not found before: ${t.selector}`).not.toBeNull();
                before[t.selector] = s!;
            }

            // First in the document, so `host` is the first layer name the cascade meets.
            const first = await page.evaluate((css) => {
                const style = document.createElement('style');
                style.dataset.test = 'hostile';
                style.textContent = css;
                document.head.prepend(style);
                return document.styleSheets[0]?.ownerNode === style;
            }, HOSTILE_STYLESHEET);
            expect(first, 'the hostile stylesheet must be the first of the document').toBe(true);
            await settle(page);

            const after: Record<string, Style> = {};
            for (const t of targets) {
                const s = await styleOf(page, t.selector);
                expect(s, `target not found after: ${t.selector}`).not.toBeNull();
                after[t.selector] = s!;
            }

            // Every host rule now skips an element carrying SELF; the rest of the page keeps them.
            const rewritten = await page.evaluate((self) => {
                const sheet = (document.querySelector('style[data-test="hostile"]') as HTMLStyleElement).sheet!;
                let n = 0;
                const walk = (rules: CSSRuleList) => {
                    for (const r of Array.from(rules)) {
                        if (r instanceof CSSStyleRule) { r.selectorText = `:where(${r.selectorText}):not([${self}])`; n++; }
                        else if ('cssRules' in r) walk((r as CSSGroupingRule).cssRules);
                    }
                };
                walk(sheet.cssRules);
                return n;
            }, SELF);
            expect(rewritten, 'no host rule was rewritten to skip the target').toBeGreaterThan(0);

            const observed: Record<string, { changed: IsolatedProperty[]; before: Style; after: Style;
                followed: Record<(typeof INHERITED)[number], string> }> = {};
            for (const t of targets) {
                const followed = await followedOf(page, t.selector);
                observed[t.selector] = {
                    changed: changed(before[t.selector], after[t.selector], followed, t.tolerancePx ?? 1, !!t.skipHeight),
                    before: before[t.selector],
                    after: after[t.selector],
                    followed,
                };
            }

            const record = process.env.PDX_ISOLATION_RECORD;
            if (record) {
                mkdirSync(record, { recursive: true });
                writeFileSync(join(record, `${m.name}.${theme}.json`), JSON.stringify(observed, null, 2));
            }

            for (const t of targets) {
                const { changed: leaked, before: b, after: a } = observed[t.selector];
                const listed = (t.leaks ?? [])
                    .filter((l) => !l.themes || l.themes.includes(theme))
                    .flatMap((l) => l.properties.map((property) => ({ property, issue: l.issue })));
                const unlisted = leaked.filter((p) => !listed.some((l) => l.property === p));
                const stopped = listed.filter((l) => !leaked.includes(l.property));
                const values = (p: IsolatedProperty) => (p === 'height' || p === 'radius'
                    ? `${JSON.stringify(b[p])} → ${JSON.stringify(a[p])}` : `${b[p]} → ${a[p]}`);
                expect(unlisted.map((p) => `${p}: ${values(p)}`),
                    `${t.selector}: the hostile CSS changes properties no leak entry names`).toEqual([]);
                expect(stopped.map((l) => `${l.property} (#${l.issue})`),
                    `${t.selector}: these listed leaks no longer leak; remove their entries`).toEqual([]);
            }
        });
    }
}
