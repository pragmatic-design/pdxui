// Every string a user can read has to come from the locale registry.
//
// `setLocaleStrings` reaches what a component registers, and everything else is a literal in the
// source: an app in any language other than English cannot fully translate its own UI, and an
// Italian accessibility tree reads "Close dialog", "Previous page", "Pagination", with a 404 page
// that says "Page not found · Back to home" — and the app developer cannot fix it.
//
// A front-end framework has to route EVERY user-visible
// string through the locale layer even for a single-language app, or the first translation is a hunt
// through the sources.
//
// This is a ratchet: `ALLOWED` may only shrink. A new literal fails the build.
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const UI = join(__dirname, '../../ui/src');
const ROUTER = join(__dirname, '../../router/src');

/** Attributes and assignments whose value a user reads (or hears, through a screen reader). */
const PATTERNS: { name: string; re: RegExp }[] = [
    // aria-label="Some Text" inside an html`` template
    { name: 'aria-label attribute', re: /aria-label="([A-Z][^"${}]{2,})"/g },
    // setAttribute('aria-label', 'Some Text')
    { name: 'aria-label setAttribute', re: /aria-label',\s*'([A-Z][^']{2,})'/g },
    // el.textContent = 'Some Text'  — only multi-word or capitalised prose. A leading symbol does not
    // make it any less prose: pdx-json-editor's `'＋ Add item'` slips past a pattern that wants a
    // capital first.
    { name: 'textContent assignment', re: /\.textContent\s*=\s*'([^'A-Za-z0-9]*[A-Z][^']{2,})'/g },
    { name: 'placeholder attribute', re: /placeholder="([A-Z][^"${}]{2,})"/g },
    { name: 'title attribute', re: /\stitle="([A-Z][^"${}]{2,})"/g },
    // ⚠️ The four above miss strings that matter most to an app — `1–10 of 47`, `No
    // results`, `N options available` — because they are built in template literals and
    // concatenations, not written into an attribute. A guard that reports zero while strings are
    // still hard-coded is worse than no guard. These two catch that shape.
    // Single line only: the router assigns a multi-line CSS block to a <style> element's
    // textContent, and `@keyframes … { to { … } }` contains the word "to".
    { name: 'textContent template', re: /\.textContent\s*=\s*`([^`\n]*\b(?:of|and|or|to)\b[^`\n]*)`/g },
    { name: 'prose in a concatenation', re: /['"]\s*\+\s*[\w().]+\s*\+\s*['"]([a-z ]{4,})['"]/g },
    // ⚠️ The two below catch prose written inside an `innerHTML` string ("+ Add Filter") and an
    // `aria-label` built from a template literal. Neither is an attribute assignment and neither
    // uses single quotes, so without them this file reports ZERO while an app has to keep a
    // MutationObserver alive to re-label both.
    //
    // Prose in an innerHTML, after the last tag it contains.
    //
    // ⚠️ The body must admit `"`, or the pattern cannot cross the quoted attributes of an inline
    // SVG and reports clean on the exact line it is meant for — which is why every pattern here is
    // put back and watched. Single-quoted only: that is how the sources write it, and allowing all
    // three delimiters makes the expression unreadable for no extra coverage.
    { name: 'prose in innerHTML', re: /\.innerHTML\s*=\s*'[^']*>([^<']*[A-Za-z]{2,}[^<']*)'/g },
    // aria-label from a template literal: `Filter ${col.header}`
    { name: 'aria-label template', re: /aria-label',\s*`([A-Z][^`]*)`/g },
    // ⚠️ Labels passed as function ARGUMENTS — `makeBtn('‹', …, 'Previous page')` — are prose too,
    // even when the same keys sit in the component's own registry entry: a guard that looks only at
    // assignments reports clean on a half-translated component. Two capitalised words in an argument
    // position, which is prose in every case seen so far.
    { name: 'prose as an argument', re: /[(,]\s*'([A-Z][a-z]+ [a-z][a-z ]{2,})'\s*[,)]/g },
    // ⚠️ `title="…"` above is the ATTRIBUTE; a tooltip assigned as the
    // PROPERTY — `cell.title = 'Click to edit'`, `del.title = 'Remove'` — needs its own pattern.
    // And questions asked through the browser's prompt — «Link URL:», «Image URL:», «Alt text:» —
    // escape "prose as an argument": a capital second word, a colon before the quote.
    { name: 'title assignment', re: /\.title\s*=\s*'([A-Z][^']{2,})'/g },
    // Any single-quoted literal handed to the browser's own dialogs: `prompt(`, `window.prompt?.(`,
    // `confirm(`, `alert(`.
    { name: 'literal in a browser dialog', re: /\b(?:prompt|confirm|alert)(?:\?\.)?\(\s*'([^']{2,})'/g },
    // ⚠️ An accessible name that is a prop's DEFAULT — `menuLabel: { type:
    // String, default: 'More actions' }` — is not an aria-label literal, and a `|| 'Choose date'`
    // FALLBACK is not an assignment, yet an app with no label set hears them in English.
    { name: 'label prop default', re: /\b(?:label|ariaLabel|[a-z]\w*Label)\s*:\s*\{\s*type:\s*String,\s*default:\s*'([A-Z][^']{2,})'/g },
    // Both ways of writing the name: `setAttribute('aria-label', x || '…')` and a template binding,
    // `:aria-label="${() => x || '…'}"`.
    { name: 'aria-label fallback', re: /aria-label(?:',|="\$\{)[^;\n]*?\|\|\s*'([A-Z][^']{2,})'/g },
    // ⚠️ `nextBtn.textContent = isLast ? 'Complete' : 'Next'` — a textContent
    // assigned a conditional whose branches are literals — bypasses the registry keys a component
    // registers for the same words.
    { name: 'textContent conditional', re: /\.textContent\s*=[^;\n]*?[?:]\s*'([A-Z][^']{2,})'/g },
    // ⚠️ The shapes no pattern above reaches: the confirm service's «Confirm» / «Cancel», «Are you
    // sure?», «Type a command...» — an app that sets no title shows them all.
    // A `|| 'Text'` fallback anywhere, not only in an aria-label write: into textContent, a template
    // text node, a variable that later becomes an accessible name.
    { name: 'literal fallback', re: /\|\|\s*'([A-Z][a-z][^']{1,})'/g },
    // Either branch of a ternary: `isEdit() ? 'Edit' : 'New'`, `visible ? 'Hide password' : …`.
    { name: 'ternary literal', re: /\?\s*'([A-Z][a-z][^']*)'\s*:/g },
    { name: 'ternary literal (else)', re: /\?\s*'[^'\n]*'\s*:\s*'([A-Z][a-z][^']*)'/g },
    // ⚠️ A name given only when there is no other: `ctx.label() ? null :
    // 'Toggle'` — the then-branch is `null`, not a literal, so the two ternary patterns above miss
    // it, and an unlabelled pdx-switch would be «Toggle» in any language.
    { name: 'ternary literal (else of null)', re: /\?\s*null\s*:\s*'([A-Z][a-z][^']*)'/g },
    // Prose glued to a value: `'Remove ' + tag`, `count + ' selected'`.
    { name: 'leading concatenation', re: /'([A-Z][a-z][^'\n]*\s)'\s*\+/g },
    { name: 'trailing concatenation', re: /\+\s*'(\s[a-z][a-z ]{2,})'/g },
    // The attribute form is above; the property form is `input.placeholder = 'Search…'`.
    { name: 'placeholder assignment', re: /\.placeholder\s*=\s*'([A-Z][^']{2,})'/g },
    { name: 'createTextNode literal', re: /createTextNode\(\s*'([^']*[A-Za-z]{2,}[^']*)'\s*\)/g },
    // A word in parentheses, which every pattern wanting a capital FIRST let through: the grid's
    // «(Empty)» group and «(Blanks)» filter option.
    { name: 'parenthesised literal', re: /'(\([A-Z][a-z][^']*\))'/g },
    // The prop-default pattern above only knew props NAMED as labels. These are shown as text.
    {
        name: 'visible-text prop default',
        re: /\b(?:title|placeholder|message|description|text|[a-z]\w*(?:Title|Placeholder|Message|Description|Text))\s*:\s*\{\s*type:\s*String,\s*default:\s*'([A-Z][^']{2,})'/g,
    },
    // Prose between two tags of a template: `<button …>Retry</button>`, `Type <strong>…`. Only
    // letters, spaces and punctuation, so a TypeScript generic (`Set<string>`) is not text.
    { name: 'template text', re: /<\/?[a-z][\w-]*(?:\s[^<>]*)?>\s*([A-Za-z][A-Za-z ,.:!?…’-]*[A-Za-z.:!?…])\s*(?=<)/g },
];

/**
 * Literals that are NOT user-visible prose and never will be. Each entry is a value, and it is here
 * because it is a technical token, not because translating it is inconvenient.
 */
const NOT_PROSE = new Set([
    'Infinity', 'NaN', 'Object', 'Array', 'String', 'Number', 'Boolean',
    // The name printed on a key cap (pdx-command's footer): the key, not a word about it.
    'ESC',
    // `KeyboardEvent.key` values. They are identifiers in a web API — what the browser puts in the
    // event, never what a user reads — so translating one would break the comparison it is written
    // for. Here because pdx-sortable-list picks the pair with a ternary (`vertical ? 'ArrowDown' :
    // 'ArrowRight'`) and the ternary pattern is what catches a real hard-coded label.
    'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight',
]);

/**
 * ⚠️ RATCHET. Every entry is a user-visible string still hard-coded. This list may only get shorter.
 * Adding to it is how the defect comes back, so a new one has to be fixed instead.
 */
const ALLOWED: Record<string, string[]> = {};

function sources(dir: string, acc: string[] = []): string[] {
    for (const e of readdirSync(dir)) {
        const p = join(dir, e);
        if (statSync(p).isDirectory()) sources(p, acc);
        else if (e.endsWith('.ts') && !e.endsWith('.d.ts')) acc.push(p);
    }
    return acc;
}

type Hit = { file: string; pattern: string; value: string };

/**
 * Comments are prose about the code, not the code. `pdx-page-header`'s header block shows
 * `<pdx-page-header title="Patients">` as usage, and flagging that would have sent someone to
 * "translate" an example.
 */
function stripComments(src: string): string {
    return src
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .split('\n')
        .filter((l) => !/^\s*\/\//.test(l))
        .join('\n');
}

/**
 * The registries themselves — `shared/i18n.ts`, `data-grid/grid-i18n.ts` — are where the English
 * defaults are supposed to be written, and the parenthesised pattern reads their `'(Empty)'` values.
 */
const REGISTRY = /(?:^|[\\/-])i18n\.ts$/;

function findLiterals(root: string, label: string): Hit[] {
    const hits: Hit[] = [];
    for (const file of sources(root)) {
        if (REGISTRY.test(file)) continue;
        const text = stripComments(readFileSync(file, 'utf-8'));
        const rel = `${label}/${file.slice(root.length + 1).replace(/\\/g, '/')}`;
        for (const { name, re } of PATTERNS) {
            for (const m of text.matchAll(re)) {
                // HTML entities are markup, not words: `&nbsp;` alone must not read as prose.
                const value = m[1].replace(/&[a-z]+;/g, ' ').trim();
                if (NOT_PROSE.has(value)) continue;
                // Prose is at least two words, or one capitalised word of substance.
                if (!/[A-Za-z]{2,}/.test(value)) continue;
                if ((ALLOWED[rel] ?? []).includes(value)) continue;
                hits.push({ file: rel, pattern: name, value });
            }
        }
    }
    return hits;
}

describe('user-visible strings come from the locale registry', () => {
    it('finds sources to scan (an empty scan would pass forever)', () => {
        expect(sources(UI).length).toBeGreaterThan(50);
        expect(sources(ROUTER).length).toBeGreaterThanOrEqual(5);
        // The registry exclusion skips exactly the two registries, not a whole folder.
        expect(sources(UI).filter((f) => REGISTRY.test(f)).map((f) => f.slice(UI.length + 1).replace(/\\/g, '/')).sort())
            .toEqual(['data-grid/grid-i18n.ts', 'shared/i18n.ts']);
    });

    it('the pattern set actually matches something (verified against a known literal)', () => {
        // If the regexes stopped matching — a refactor to another quoting style, say — this suite
        // would go green while nothing had been translated. Prove the detector still detects.
        const sample = `<button aria-label="Close dialog">x</button>`;
        const matched = PATTERNS.some((p) => new RegExp(p.re.source).test(sample));
        expect(matched).toBe(true);
    });

    it('@pdxui/ui has no hard-coded user-visible string', () => {
        const hits = findLiterals(UI, 'ui');
        const shown = hits.map((h) => `${h.file}: ${h.value} (${h.pattern})`).sort();
        expect(shown, `${hits.length} literal(s) a consumer cannot translate`).toEqual([]);
    });

    it('@pdxui/router has no hard-coded user-visible string', () => {
        const hits = findLiterals(ROUTER, 'router');
        const shown = hits.map((h) => `${h.file}: ${h.value} (${h.pattern})`).sort();
        expect(shown, `${hits.length} literal(s) a consumer cannot translate`).toEqual([]);
    });

    it('the allow-list is empty, and stays that way', () => {
        // Not decoration: the ratchet is the whole mechanism. If a future change needs an exception,
        // that exception is a decision to leave a string untranslatable — it belongs in a ticket,
        // not in a quiet addition here.
        expect(Object.keys(ALLOWED)).toEqual([]);
    });
});
