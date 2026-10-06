import { readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { test, expect, type Page } from '@playwright/test';
import { createTheme } from '../src/engine/index';

// A subtree with its own `pdx-theme` is not reached by the outer theme's component rules.
//
// Theme component rules are descendant selectors — `[pdx-theme="pragmatic-gold"] .pdx-primary` —
// and without a guard they match every `.pdx-primary` under the page's root, including the ones
// under a nested `[pdx-theme="corporate"]`: on /design/themes every card's primary would be the gold
// gradient.
//
// The page: the harness with theme O on <html> and theme I on <body>, for every pair O ≠ I of the
// shipped themes. Two measures:
//   - no rule of O's stylesheet matches <body> or anything under it (state pseudo-classes read as
//     always on, pseudo-elements read as their element), and
//   - the primary buttons paint as they do with I alone on the page.

const HARNESS = '/demo/test-harness.html';
const THEMES = readdirSync(fileURLToPath(new URL('../src/themes/', import.meta.url)))
    .filter((f) => f.endsWith('.css'))
    .map((f) => f.replace(/\.css$/, ''));

// A context option: `test.use({ reducedMotion })` is not a test option, and it is ignored in silence
// — the page matches no reduced-motion query.
test.use({ contextOptions: { reducedMotion: 'reduce' } });

async function setThemes(page: Page, root: string, body: string): Promise<void> {
    await page.evaluate(([root, body]) => {
        document.documentElement.setAttribute('pdx-theme', root);
        document.body.setAttribute('pdx-theme', body);
        void getComputedStyle(document.body).color;
        // Reduced motion makes every transition and animation finite; end them at their final value.
        for (const a of document.getAnimations()) a.finish();
    }, [root, body] as const);
}

/** The rules of `theme`'s own stylesheet that match <body> or an element under it. */
async function rulesReachingBody(page: Page, theme: string): Promise<{ reaching: string[]; rules: number; nested: number }> {
    return page.evaluate((theme) => {
        const sheets: CSSStyleSheet[] = [];
        const collectSheets = (sheet: CSSStyleSheet) => {
            sheets.push(sheet);
            for (const r of Array.from(sheet.cssRules)) if (r instanceof CSSImportRule && r.styleSheet) collectSheets(r.styleSheet);
        };
        // The harness also links Google Fonts, whose rules a cross-origin page cannot read.
        for (const s of Array.from(document.styleSheets)) if (!s.href || new URL(s.href).origin === location.origin) collectSheets(s);
        const own = sheets.find((s) => s.href?.endsWith(`/themes/${theme}.css`));
        if (!own) throw new Error(`no stylesheet for ${theme}`);

        const elements = [document.body, ...Array.from(document.body.querySelectorAll('*'))];
        const reaching: string[] = [];
        let rules = 0;
        let nested = 0;
        const visit = (list: CSSRuleList) => {
            for (const r of Array.from(list)) {
                if (r instanceof CSSStyleRule) {
                    if (r.selectorText.includes('&')) { nested++; continue; }
                    rules++;
                    const probe = r.selectorText
                        .replace(/::?(before|after|placeholder|marker|selection|backdrop|first-line|first-letter)\b/g, '')
                        .replace(/::[\w-]+(\([^)]*\))?/g, '')
                        .replace(/:(hover|active|focus-visible|focus-within|focus)\b/g, ':is(*)');
                    if (elements.some((el) => el.matches(probe))) reaching.push(r.selectorText);
                }
                if ('cssRules' in r && (r as CSSGroupingRule).cssRules) visit((r as CSSGroupingRule).cssRules);
            }
        };
        visit(own.cssRules);
        return { reaching, rules, nested };
    }, theme);
}

async function primaryPaint(page: Page): Promise<Record<string, string>> {
    return page.evaluate(() => {
        const out: Record<string, string> = {};
        document.querySelectorAll('button.pdx-primary, a.pdx-primary').forEach((el, i) => {
            const cs = getComputedStyle(el);
            for (const p of ['background-color', 'background-image', 'color']) out[`${i} ${p}`] = cs.getPropertyValue(p);
        });
        return out;
    });
}

test.describe('a nested theme is not reached by the outer theme\'s rules', () => {
    for (const outer of THEMES) {
        test(`${outer} outside, each other theme inside`, async ({ page }) => {
            await page.goto(HARNESS);
            const reaching: string[] = [];
            const paint: string[] = [];
            for (const inner of THEMES) {
                if (inner === outer) continue;
                await setThemes(page, inner, inner);
                const alone = await primaryPaint(page);
                await setThemes(page, outer, inner);
                const found = await rulesReachingBody(page, outer);
                expect(found.nested, `${outer}.css uses nested rules this measure does not read`).toBe(0);
                if (found.reaching.length) reaching.push(`${inner}: ${found.reaching.length} of ${found.rules}, e.g. ${found.reaching.slice(0, 3).join(' | ')}`);
                const nestedPaint = await primaryPaint(page);
                const diff = Object.keys(alone).filter((k) => alone[k] !== nestedPaint[k]);
                if (diff.length) paint.push(`${inner}: ${diff.slice(0, 2).map((k) => `${k} = ${nestedPaint[k]} (alone: ${alone[k]})`).join(' | ')}`);
            }
            // One assertion, so a red run shows both measures.
            expect({ reaching, paint }, `${outer}'s rules reach into a nested theme`).toEqual({ reaching: [], paint: [] });
        });
    }

    test('every component rule of a theme ends at a nested theme root, including rules the harness does not render', async ({ page }) => {
        // The measure above only sees the elements the harness has. This one reads every rule: each
        // selector below the theme root carries the guard on its subject. The token blocks are one
        // compound (`[pdx-theme="x"]`) and have nothing below them.
        await page.goto(HARNESS);
        const unguarded = await page.evaluate((themes) => {
            const sheets: CSSStyleSheet[] = [];
            const collectSheets = (sheet: CSSStyleSheet) => {
                sheets.push(sheet);
                for (const r of Array.from(sheet.cssRules)) if (r instanceof CSSImportRule && r.styleSheet) collectSheets(r.styleSheet);
            };
            for (const s of Array.from(document.styleSheets)) if (!s.href || new URL(s.href).origin === location.origin) collectSheets(s);
            const splitTop = (sel: string, isSep: (c: string) => boolean) => {
                const parts: string[] = [];
                let depth = 0, start = 0, quote = '';
                for (let i = 0; i < sel.length; i++) {
                    const c = sel[i];
                    if (quote) { if (c === '\\') i++; else if (c === quote) quote = ''; continue; }
                    if (c === '"' || c === "'") quote = c;
                    else if (c === '(' || c === '[') depth++;
                    else if (c === ')' || c === ']') depth--;
                    else if (depth === 0 && isSep(c)) { parts.push(sel.slice(start, i)); start = i + 1; }
                }
                parts.push(sel.slice(start));
                return parts;
            };
            const out: string[] = [];
            for (const theme of themes) {
                const own = sheets.find((s) => s.href?.endsWith(`/themes/${theme}.css`));
                if (!own) throw new Error(`no stylesheet for ${theme}`);
                const foreign = `[pdx-theme="${theme}"] [pdx-theme]:not([pdx-theme="${theme}"])`;
                const guard = `:not(:where(${foreign}, ${foreign} *))`;
                const visit = (list: CSSRuleList) => {
                    for (const r of Array.from(list)) {
                        if (r instanceof CSSStyleRule) {
                            for (const sel of splitTop(r.selectorText, (c) => c === ',').map((s) => s.trim())) {
                                const compounds = splitTop(sel, (c) => c === ' ' || c === '>' || c === '+' || c === '~').filter(Boolean);
                                if (compounds.length > 1 && !compounds[compounds.length - 1].includes(guard)) out.push(`${theme}: ${sel}`);
                            }
                        }
                        if ('cssRules' in r && (r as CSSGroupingRule).cssRules) visit((r as CSSGroupingRule).cssRules);
                    }
                };
                visit(own.cssRules);
            }
            return out;
        }, THEMES);
        expect(unguarded).toEqual([]);
    });

    test('the measure sees the case: a theme\'s rules do reach its own subtree', async ({ page }) => {
        // Guards the measure itself: with the same theme inside and out, the rules must be found.
        await page.goto(HARNESS);
        expect(THEMES.length).toBe(13);
        await setThemes(page, 'pragmatic-gold', 'pragmatic-gold');
        const found = await rulesReachingBody(page, 'pragmatic-gold');
        expect(found.reaching.some((s) => s.startsWith('[pdx-theme="pragmatic-gold"] .pdx-primary'))).toBe(true);
        expect((await primaryPaint(page))['0 background-image']).toContain('linear-gradient');
    });
});

// A generated theme's rules stop at a nested theme too. createTheme().toCSS() writes the
// design language's cssOverrides as nested rules of `[pdx-theme="name"]`; a theme saved from the
// builder is that CSS. Without the guard they reach a nested root as unguarded shipped rules do.
// The measure: the generated sheet injected, the generated theme on <html>, corporate on
// <body>; nested rules are read with `&` resolved to their parent.

async function generatedRulesReachingBody(page: Page, name: string): Promise<{ reaching: string[]; rules: number }> {
    return page.evaluate((name) => {
        const sheet = Array.from(document.styleSheets).find((s) =>
            !s.href && Array.from(s.cssRules).some((r) => r instanceof CSSStyleRule && r.selectorText === `[pdx-theme="${name}"]`));
        if (!sheet) throw new Error(`no injected sheet for ${name}`);
        const elements = [document.body, ...Array.from(document.body.querySelectorAll('*'))];
        const reaching: string[] = [];
        let rules = 0;
        const visit = (list: CSSRuleList, parent: string | null) => {
            for (const r of Array.from(list)) {
                if (r instanceof CSSStyleRule) {
                    const full = parent ? r.selectorText.replace(/&/g, `:is(${parent})`) : r.selectorText;
                    if (parent) {
                        rules++;
                        const probe = full
                            .replace(/::?(before|after|placeholder|marker|selection|backdrop|first-line|first-letter)\b/g, '')
                            .replace(/:(hover|active|focus-visible|focus-within|focus|checked)\b/g, ':is(*)');
                        if (elements.some((el) => el.matches(probe))) reaching.push(r.selectorText.slice(0, 80));
                    }
                    visit(r.cssRules, full);
                } else if ('cssRules' in r && (r as CSSGroupingRule).cssRules) {
                    visit((r as CSSGroupingRule).cssRules, parent);
                }
            }
        };
        visit(sheet.cssRules, null);
        return { reaching, rules };
    }, name);
}

test.describe('a generated theme is not reached into a nested theme', () => {
    const name = 'generated-pragmatic';
    const css = createTheme({ name, brandColor: '#b45309', language: 'pragmatic' }).toCSS();

    test('none of its rules matches under a nested corporate', async ({ page }) => {
        await page.goto(HARNESS);
        await page.addStyleTag({ content: css });
        await setThemes(page, name, 'corporate');
        const found = await generatedRulesReachingBody(page, name);
        expect(found.rules, 'the generated sheet has no nested rules: nothing measured').toBeGreaterThan(20);
        expect(found.reaching).toEqual([]);
    });

    test('the measure sees the case: with the generated theme on <body> too, its rules do reach', async ({ page }) => {
        await page.goto(HARNESS);
        await page.addStyleTag({ content: css });
        await setThemes(page, name, name);
        const found = await generatedRulesReachingBody(page, name);
        expect(found.reaching.some((s) => s.startsWith('& .pdx-primary'))).toBe(true);
    });
});

// A generated theme leaves the page's motion scale alone. createTheme().toCSS() declares
// `--pdx-motion-scale` only when the author sets one: a saved theme sits in pdx.themes, after
// pdx.adaptive, so on <html> a declared scale beats the reduced-motion `:root { --pdx-motion-scale: 0 }`
// and the duration tokens come back at full length. No shipped theme declares it. The probe reads a duration
// token through `transition-delay`, which the reduced-motion rule does not force to zero.

async function motionOn(page: Page, host: 'html' | 'body'): Promise<{ reduced: boolean; scale: string; delay: string }> {
    return page.evaluate((host) => {
        const el = host === 'html' ? document.documentElement : document.body;
        const probe = document.createElement('div');
        probe.style.transitionDelay = 'var(--pdx-duration-base)';
        el.appendChild(probe);
        const out = {
            reduced: matchMedia('(prefers-reduced-motion: reduce)').matches,
            scale: getComputedStyle(el).getPropertyValue('--pdx-motion-scale').trim(),
            delay: getComputedStyle(probe).transitionDelay,
        };
        probe.remove();
        return out;
    }, host);
}

test.describe('a generated theme leaves the page\'s motion scale alone', () => {
    const name = 'generated-neutral';
    const saved = (input: Record<string, unknown> = {}) =>
        `@layer pdx.themes { ${createTheme({ name, brandColor: '#2563eb', language: 'neutral', ...input }).toCSS()} }`;

    test('the measure sees the page\'s zero: a shipped theme on <html>, under reduced motion', async ({ page }) => {
        await page.goto(HARNESS);
        await setThemes(page, 'corporate', 'corporate');
        expect(await motionOn(page, 'html')).toEqual({ reduced: true, scale:'0', delay: '0s' });
    });

    test('on <html>, under reduced motion, the scale stays 0 and a duration token is 0s', async ({ page }) => {
        await page.goto(HARNESS);
        await page.addStyleTag({ content: saved() });
        await setThemes(page, name, name);
        expect(await motionOn(page, 'html')).toEqual({ reduced: true, scale:'0', delay: '0s' });
    });

    test('the measure sees the case: an author\'s motionScale is declared and applies', async ({ page }) => {
        await page.goto(HARNESS);
        await page.addStyleTag({ content: saved({ motionScale: 0.5 }) });
        await setThemes(page, name, name);
        expect(await motionOn(page, 'html')).toEqual({ reduced: true, scale:'0.5', delay: '0.1s' });
    });

    test('nested under a shipped theme, a duration token is the page\'s: it resolves on :root', async ({ page }) => {
        await page.goto(HARNESS);
        await page.addStyleTag({ content: saved({ motionScale: 1 }) });
        await setThemes(page, 'corporate', name);
        expect((await motionOn(page, 'body')).delay).toBe('0s');
    });
});

// A nested theme computes like the theme alone: its tokens, not the outer theme's.
//
// The tokens derived in tokens.css — `--pdx-color-text: light-dark(var(--pdx-gray-900), …)`, the
// ramps on the hue anchors, the shadows on the shadow colour, the spacing on the density — declared
// on :root only would resolve once, with the page theme's primitives, because a custom property
// inherits its computed value: under a nested corporate the text would stay cupertino's. And with
// `color` set on <body> only, a nested root that is not <body> would keep the outer theme's resolved
// text colour.
//
// The page: the harness content moved into one <div>. "Alone" is <html> and the div both in theme I;
// "nested" is <html> in O and the div in I. Every element in the div must compute the same paint, box
// and type properties either way, for every pair O ≠ I.

const MEASURED = [
    'color', 'background-color', 'background-image', 'border-top-color', 'border-bottom-color', 'box-shadow', 'outline-color',
    'width', 'height', 'padding-top', 'padding-left', 'margin-top', 'margin-left', 'border-top-width', 'border-top-left-radius',
    'font-family', 'font-size', 'font-weight', 'line-height', 'letter-spacing', 'text-transform',
];

async function nestInDiv(page: Page): Promise<void> {
    await page.evaluate(() => {
        const nest = document.createElement('div');
        nest.id = 'pdx-nest';
        while (document.body.firstChild) nest.appendChild(document.body.firstChild);
        document.body.appendChild(nest);
    });
}

async function setNested(page: Page, root: string, inner: string): Promise<void> {
    await page.evaluate(async ([root, inner]) => {
        document.documentElement.setAttribute('pdx-theme', root);
        document.getElementById('pdx-nest')!.setAttribute('pdx-theme', inner);
        void document.body.offsetHeight;
        for (const a of document.getAnimations()) a.finish();
        // A theme's web font loads when text first uses it: measured before, a width is the
        // fallback font's (8px narrower for the first theme measured on the page).
        await document.fonts.ready;
    }, [root, inner] as const);
}

/** Every measured property of the nest and everything in it, keyed by element index and property. */
async function computedUnderNest(page: Page): Promise<Record<string, string>> {
    return page.evaluate((props) => {
        const nest = document.getElementById('pdx-nest')!;
        const out: Record<string, string> = {};
        [nest, ...Array.from(nest.querySelectorAll('*'))].forEach((el, i) => {
            const cs = getComputedStyle(el);
            for (const p of props) out[`${i} ${el.tagName.toLowerCase()}${el.className && typeof el.className === 'string' ? '.' + el.className.split(' ')[0] : ''} ${p}`] = cs.getPropertyValue(p);
        });
        return out;
    }, MEASURED);
}

test.describe('a nested theme computes like the theme alone', () => {
    for (const outer of THEMES) {
        test(`${outer} outside, each other theme inside: every element as under the inner theme alone`, async ({ page }) => {
            await page.goto(HARNESS);
            await nestInDiv(page);
            const differing: string[] = [];
            for (const inner of THEMES) {
                if (inner === outer) continue;
                await setNested(page, inner, inner);
                const alone = await computedUnderNest(page);
                await setNested(page, outer, inner);
                const nested = await computedUnderNest(page);
                const diff = Object.keys(alone).filter((k) => alone[k] !== nested[k]);
                if (diff.length) differing.push(`${inner}: ${diff.length} values, e.g. ${diff.slice(0, 2).map((k) => `${k} = ${nested[k]} (alone: ${alone[k]})`).join(' | ')}`);
            }
            expect(differing, `${outer} outside changes a nested theme`).toEqual([]);
        });
    }

    test('the measure sees the case: two different themes do compute differently', async ({ page }) => {
        // Guards the measure: if the nest computed the same under any two themes, "no difference"
        // above would prove nothing.
        await page.goto(HARNESS);
        await nestInDiv(page);
        await setNested(page, 'corporate', 'corporate');
        const corporate = await computedUnderNest(page);
        await setNested(page, 'cupertino', 'cupertino');
        const cupertino = await computedUnderNest(page);
        const differ = Object.keys(corporate).filter((k) => corporate[k] !== cupertino[k]);
        expect(differ.length).toBeGreaterThan(100);
        expect(Object.keys(corporate).length).toBeGreaterThan(1000);
    });
});
