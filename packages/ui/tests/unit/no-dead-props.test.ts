// A prop this library declares is a promise. This is the test that it is kept.
//
// A prop can be declared, typed, defaulted, documented on the site, shown in a demo — and read by
// nothing: an app reaches for `preventClose` and cannot make a dialog refuse to close.
//
// A prop that does not exist sends the reader to look for another way. A prop that exists, has a
// type and a default, appears in the generated catalogue and in the site's props table, and does
// nothing, sends them to write code around a thing they believe already works — and the failure is
// silent. This test moves that discovery from "an app hit it in production" to "the build is red".
//
// ⚠️ A `\b` in a RegExp built from a shell-quoted string, escaped into a literal backslash-b, makes
// this scan report every prop dead: only an absurd number shows a broken scan, and a green run does
// not. So the scan is asserted against a planted case below before it is trusted with a real answer.

import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const SRC = join(__dirname, '..', '..', 'src');

/** Props this library declares and deliberately does not read. Must stay empty. */
const ALLOWED: string[] = [];

function componentFiles(dir: string, acc: string[] = []): string[] {
    for (const entry of readdirSync(dir)) {
        const p = join(dir, entry);
        if (statSync(p).isDirectory()) componentFiles(p, acc);
        else if (/^pdx-.*\.ts$/.test(entry)) acc.push(p);
    }
    return acc;
}

/**
 * Shared helpers that read props off the `ctx` they are handed: a call is a read of those props, in
 * a file where the name may otherwise appear only in a comment (`shared/own-prop.ts`).
 */
const HELPER_READS: Record<string, string[]> = {
    reflectNameToHost: ['name'],
};

/**
 * The source without its comments. A `//` right after `:` or a quote is a URL in a string
 * (`'http://www.w3.org/2000/svg'`), not a comment, and is kept.
 */
function stripComments(text: string): string {
    return text
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/(^|[^:'"`\\])\/\/[^\n]*/gm, '$1');
}

/**
 * Props declared by the component in `text` and never mentioned again in it.
 *
 * Generous about code: a prop counts as read if its name appears anywhere in the code outside its
 * own declaration — `ctx.name()`, a string key, a property access. A false negative costs nothing;
 * a false positive would send someone chasing a prop that works. But NOT a comment: a header that
 * promises "disabled propagation" would count the word as a read of a `disabled` that disables
 * nothing.
 */
function deadProps(text: string): { checked: number; dead: string[] } {
    const tag = (text.match(/component\('([\w-]+)'/) ?? [])[1];
    if (!tag) return { checked: 0, dead: [] };

    const block = text.match(/props:\s*\{([\s\S]*?)\n {4}\},/);
    if (!block) return { checked: 0, dead: [] };

    // Everything except the props block — where a use would have to appear — and no comments.
    const rest = stripComments(text.slice(0, block.index) + text.slice((block.index ?? 0) + block[0].length));

    const viaHelpers = new Set(Object.entries(HELPER_READS)
        .filter(([helper]) => new RegExp(`\\b${helper}\\(`).test(rest))
        .flatMap(([, props]) => props));

    let checked = 0;
    const dead: string[] = [];
    for (const m of block[1].matchAll(/^ {8}'?([\w]+)'?:\s*\{/gm)) {
        const name = m[1];
        checked++;
        if (!viaHelpers.has(name) && !new RegExp(`\\b${name}\\b`).test(rest)) dead.push(`${tag}.${name}`);
    }
    return { checked, dead };
}

describe('the scan can fail', () => {
    // Three shapes, because a scan that only ever returns [] passes the real assertion below.
    const LIVE = [
        "// pdx-probe — a header comment that names 'keyed', and must not count for it.",
        "import { component, html } from '@pdxui/core';",
        "component('pdx-probe', {",
        '    props: {',
        '        used: { type: String, default: null },',
        '        keyed: { type: Boolean, default: false },',
        '    },',
        '    setup(ctx) {',
        "        const ns = 'http://www.w3.org/2000/svg'; const k = (ctx as any)['keyed'];",
        '        return { label: ctx.used(), ns, k };',
        '    },',
        '});',
    ].join('\n');

    it('sees a prop that is never mentioned again', () => {
        const planted = LIVE.replace('        used: {', '        forgotten: { type: String, default: null },\n        used: {');
        expect(deadProps(planted).dead).toContain('pdx-probe.forgotten');
    });

    it('sees a prop that is only mentioned in a comment', () => {
        const planted = LIVE
            .replace('        used: {', '        promised: { type: Boolean, default: false },\n        used: {')
            .replace('    setup(ctx) {', '    setup(ctx) {\n        // promised propagation — a word, not a read.\n        /* promised, again */');
        expect(deadProps(planted).dead).toEqual(['pdx-probe.promised']);
    });

    it('counts a shared helper that reads the prop, and not the same helper named in a comment', () => {
        const withName = LIVE.replace('        used: {', '        name: { type: String, default: null },\n        used: {');
        expect(deadProps(withName.replace('    setup(ctx) {', '    setup(ctx) {\n        reflectNameToHost(ctx);')).dead).toEqual([]);
        expect(deadProps(withName.replace('    setup(ctx) {', '    setup(ctx) {\n        // reflectNameToHost(ctx) one day')).dead)
            .toEqual(['pdx-probe.name']);
    });

    it('does not accuse a prop that is read, by call or by string key after a URL', () => {
        expect(deadProps(LIVE).dead).toEqual([]);
    });

    it('counts the props it looked at', () => {
        expect(deadProps(LIVE).checked).toBe(2);
    });
});

describe('every prop @pdxui/ui declares is read by the component that declares it', () => {
    const files = componentFiles(SRC);
    let checked = 0;
    const dead: string[] = [];
    for (const file of files) {
        const result = deadProps(readFileSync(file, 'utf-8'));
        checked += result.checked;
        dead.push(...result.dead);
    }

    it('actually reached the components', () => {
        // Without this, a broken path or regex reports zero dead props for the best of reasons.
        expect(files.length).toBeGreaterThan(80);
        expect(checked, 'the scan found almost no props, which means it found almost no components')
            .toBeGreaterThan(900);
    });

    it('leaves nothing declared and unread', () => {
        expect(dead.filter(d => !ALLOWED.includes(d))).toEqual([]);
    });

    it('has an empty allow-list, because a documented exception is still a broken promise', () => {
        expect(ALLOWED).toEqual([]);
    });
});
