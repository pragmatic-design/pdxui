// A function that hands back a SIGNAL must not be documented as handing back a value.
//
// A page teaching:
//
//     getLocale();         // 'it'
//
// is wrong: it returns `ReadonlySignal<string>`; reading it is `getLocale()()`. Following such a
// page throws `TypeError: locale2.startsWith is not a function` inside the app's bootstrap, so the
// symptom is not a wrong string on a screen — it is a page that will not mount at all.
//
// Several exported functions return a signal, which is what makes this worth a rule rather than a
// corrected line: the next one added is one page away from the same mistake. The shape being forbidden is the one that carries the claim — a call whose
// result is DISCARDED, written only to say "this is the value", usually with the value in a comment
// beside it. Every honest use assigns it, derives from it, or calls it twice.

import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const REPO = join(__dirname, '..', '..', '..');
const DOCS = join(REPO, 'packages', 'site', 'content', 'docs');
/** The packages whose exports the documentation teaches. */
const SOURCES = ['core', 'router'];

/** Every exported function whose declared return type is a signal, read from the source. */
function signalAccessors(): string[] {
    const names = new Set<string>();
    for (const pkg of SOURCES) {
        const root = join(REPO, 'packages', pkg, 'src');
        for (const file of walk(root)) {
            const text = readFileSync(file, 'utf8');
            for (const m of text.matchAll(/export function ([A-Za-z0-9_]+)\s*\([^)]*\)\s*:\s*ReadonlySignal</g)) {
                names.add(m[1]);
            }
        }
    }
    return [...names];
}

function walk(dir: string): string[] {
    const out: string[] = [];
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const full = join(dir, entry.name);
        if (entry.isDirectory()) out.push(...walk(full));
        else if (entry.name.endsWith('.ts')) out.push(full);
    }
    return out;
}

/** The documentation pages, minus the generated reference — it prints signatures, not usage. */
function docPages(): { name: string; text: string }[] {
    return readdirSync(DOCS)
        .filter((f) => f.endsWith('.md') && f !== 'api.md')
        .map((name) => ({ name, text: readFileSync(join(DOCS, name), 'utf8') }));
}

describe('the documentation does not teach a signal as a value', () => {
    const accessors = signalAccessors();

    it('found the accessors to check', () => {
        // Without this the rule below passes over an empty list, which is how a scan stops meaning
        // anything the day a signature is reformatted.
        expect(accessors.length, 'no ReadonlySignal-returning export was found in core or router')
            .toBeGreaterThanOrEqual(5);
        expect(accessors).toContain('getLocale');
    });

    it('never shows one as a call whose result is thrown away', () => {
        // `getLocale();` on its own line does nothing except claim that the call IS the value —
        // there is no other reason to write it. `getLocale()()`, `const x = getLocale()` and
        // `$derived(getLocale()())` are all allowed, because each of them reads the signal.
        const offences: string[] = [];
        for (const page of docPages()) {
            page.text.split('\n').forEach((line, i) => {
                for (const name of accessors) {
                    const discarded = new RegExp(`^\\s*${name}\\s*\\([^()]*\\)\\s*;`);
                    if (discarded.test(line)) offences.push(`${page.name}:${i + 1} — ${line.trim()}`);
                }
            });
        }
        expect(offences, `a documented call discards a signal, which reads as "this is the value":\n${offences.join('\n')}`)
            .toEqual([]);
    });

    it('i18n.md shows how the locale is actually read', () => {
        // The page a reader learns this on has to show the second call, not merely avoid the wrong
        // form: `getLocale()` alone is what they will copy.
        const text = docPages().find((p) => p.name === 'i18n.md')?.text ?? '';
        expect(text, 'i18n.md is gone').toContain('getLocale');
        expect(text, 'i18n.md never shows the locale being READ — `getLocale()()`')
            .toContain('getLocale()()');
        expect(text, 'i18n.md does not say that getLocale returns the signal')
            .toMatch(/returns the \*\*signal\*\*|hands back the signal/i);
    });
});
