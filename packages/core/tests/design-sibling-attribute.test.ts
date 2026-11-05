// No selector of the design system puts a sibling combinator next to an attribute selector (#881).
//
// Chromium can keep an element alive after its removal when two things meet: the page's CSS has a
// sibling combinator (`+` or `~`) beside an attribute selector — `[data-part="item"] + [data-part="item"]`
// — and that attribute was set while the element was in the page. Measured on about:blank with
// nothing but such a rule: up to 20 of 20 detached elements stayed alive, and none without the rule,
// or with `>`, a descendant combinator, `:nth-child()` or `:has()` in its place. Whether it happens
// depends on how the elements sit in the tree — `[a] + [a]` kept 20 elements removed one by one and
// none removed together with their siblings, while `[a] + .y`, the attribute left of the combinator,
// kept them both ways (#891). A `[data-part] + [data-part]` rule is how `pdx-carousel`, `pdx-rich-text` and
// `pdx-avatar-group` kept their removed nodes, and through them two whole components (#881).
//
// Since which tree it bites cannot be told from the rule, the shape is allowed nowhere. A position
// among siblings is written with `:nth-child(n + 2 of [data-part="item"])` instead, which says the
// same thing and keeps nothing, and a style that followed a sibling's attribute reads one of its own.

import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const SRC = join(__dirname, '..', '..', 'design', 'src');

function cssFiles(dir: string): string[] {
    return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
        e.isDirectory() ? cssFiles(join(dir, e.name)) : e.name.endsWith('.css') ? [join(dir, e.name)] : []);
}

/** Split at top-level occurrences of `sep`: not inside parentheses or brackets. */
function splitTop(text: string, sep: RegExp): string[] {
    const parts: string[] = [];
    let depth = 0, start = 0;
    for (let i = 0; i < text.length; i++) {
        const c = text[i];
        if (c === '(' || c === '[') depth++;
        else if (c === ')' || c === ']') depth--;
        else if (depth === 0 && sep.test(c)) { parts.push(text.slice(start, i)); start = i + 1; }
    }
    parts.push(text.slice(start));
    return parts;
}

/** Every selector of the stylesheets, with where it is. */
function selectors(): { selector: string; where: string }[] {
    const out: { selector: string; where: string }[] = [];
    for (const file of cssFiles(SRC)) {
        const css = readFileSync(file, 'utf-8').replace(/\/\*[\s\S]*?\*\//g, '');
        for (const match of css.matchAll(/([^{};]+)\{/g)) {
            const prelude = match[1].trim();
            if (prelude.startsWith('@') || prelude === '') continue;
            for (const selector of splitTop(prelude, /,/)) out.push({ selector: selector.trim(), where: file.slice(SRC.length + 1).replace(/\\/g, '/') });
        }
    }
    return out;
}

/** Whether a top-level `+` or `~` in `selector` has an attribute selector in the compound on either side. */
function siblingBesideAttribute(selector: string): boolean {
    const compounds = splitTop(selector, /[+~]/);
    if (compounds.length < 2) return false;
    // The compound right before a combinator is the last of its piece, the one right after the first.
    for (let i = 0; i < compounds.length - 1; i++) {
        const before = splitTop(compounds[i].trim(), /[\s>]/).filter(Boolean).pop() ?? '';
        const after = splitTop(compounds[i + 1].trim(), /[\s>]/).filter(Boolean)[0] ?? '';
        if (/^[^(]*\[|\]\s*$/.test(before) || before.includes('[') || after.includes('[')) return true;
    }
    return false;
}

/**
 * Selectors allowed the shape anyway, each with the reason. Empty: the wizard's connector and the
 * drawer's backdrop were the last two, public CSS that moved to the element they style before the beta
 * (#891).
 */
const KNOWN: string[] = [];

describe('the design system\'s sibling combinators', () => {
    it('none sits beside an attribute selector', () => {
        const found = selectors()
            .filter(({ selector }) => siblingBesideAttribute(selector))
            .filter(({ selector }) => !KNOWN.some((k) => selector.includes(k)))
            .map(({ selector, where }) => `${where}: ${selector}`);
        expect(found, 'a sibling combinator beside an attribute selector keeps removed elements alive in Chromium').toEqual([]);
    });

    it('every known exception is still in the stylesheets', () => {
        const all = selectors().map(({ selector }) => selector);
        for (const k of KNOWN) expect(all.some((s) => s.includes(k)), `${k} is gone: take it out of KNOWN, and say so on #881`).toBe(true);
    });

    it('the check finds the shape it is for', () => {
        expect(siblingBesideAttribute(':where(pdx-list):state(dividers) > [data-part="list"] > [data-part="item"] + [data-part="item"]')).toBe(true);
        expect(siblingBesideAttribute('.pdx-drawer[push] ~ .pdx-drawer-backdrop')).toBe(true);
        expect(siblingBesideAttribute('[data-part="list"] > :nth-child(n + 2 of [data-part="item"])')).toBe(false);
        expect(siblingBesideAttribute('.pdx-list-dividers > .pdx-list-item + .pdx-list-item')).toBe(false);
    });
});
