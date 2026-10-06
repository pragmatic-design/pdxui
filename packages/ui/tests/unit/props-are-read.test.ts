// Every prop a component declares is read by that component.
//
// A prop declared and published in custom-elements.json, on the site and in the skill, but read by
// nothing, does nothing and warns nobody — `:source="ds" field="body"` on pdx-rich-text, for one. A
// declared prop is a promise in the published API, and this measures whether it is kept.
//
// Read means: the component's module names it as `ctx.<name>`, calls `<name>()`, or quotes it, which
// is how a component reads a prop through a helper or an attribute name. The exceptions are listed
// below, each with its reason; a new one needs one too.

import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const SRC = join(__dirname, '..', '..', 'src');

/** Props a component declares and deliberately does not read, by `tag.prop`, with the reason. */
const NOT_READ: Record<string, string> = {
    // An identifying attribute, like `name` on a native <fieldset>: the page queries it, the component does not.
    'pdx-form-section.name': 'identifies the section to the page',
};

function tsFiles(dir: string): string[] {
    const out: string[] = [];
    for (const name of readdirSync(dir)) {
        const full = join(dir, name);
        if (statSync(full).isDirectory()) out.push(...tsFiles(full));
        else if (name.endsWith('.ts')) out.push(full);
    }
    return out;
}

/** The component a module registers, its top-level prop names, and the module's text outside them. */
function declaredProps(src: string): { tag: string; names: string[]; rest: string } | null {
    const m = src.match(/component\(\s*'(pdx-[a-z0-9-]+)'\s*,\s*\{\s*props:\s*\{/);
    if (!m || m.index === undefined) return null;
    const start = m.index + m[0].length;
    let i = start, depth = 1;
    while (depth > 0 && i < src.length) { if (src[i] === '{') depth++; else if (src[i] === '}') depth--; i++; }
    const block = src.slice(start, i - 1);
    const names: string[] = [];
    let d = 0;
    for (const line of block.split('\n')) {
        const key = d === 0 ? /^\s*([A-Za-z_$][\w$]*)\s*:/.exec(line) : null;
        if (key) names.push(key[1]);
        for (const ch of line) { if ('{[('.includes(ch)) d++; else if ('}])'.includes(ch)) d--; }
    }
    return { tag: m[1], names, rest: src.slice(0, start) + src.slice(i) };
}

describe('the props a component declares', () => {
    const components = tsFiles(SRC)
        .map((f) => ({ file: relative(SRC, f).replace(/\\/g, '/'), found: declaredProps(readFileSync(f, 'utf8')) }))
        .filter((c): c is { file: string; found: NonNullable<ReturnType<typeof declaredProps>> } => c.found !== null);

    it('were found, so the assertion below is not vacuous', () => {
        expect(components.length, 'no component with props: the scan broke').toBeGreaterThan(80);
    });

    it('are each read by the component, or listed with a reason', () => {
        const unread: string[] = [];
        for (const { file, found } of components) {
            for (const name of found.names) {
                const read = new RegExp(`ctx\\.${name}\\b|\\b${name}\\s*\\(\\)|['"]${name}['"]`).test(found.rest);
                if (!read && !(`${found.tag}.${name}` in NOT_READ)) unread.push(`${found.tag}.${name} (${file})`);
            }
        }
        expect(unread, 'declared and never read: read it, remove it, or list it with a reason').toEqual([]);
    });

    it('listed as not read are still declared and still not read', () => {
        // An exception that outlived its reason hides the next unread prop of the same name.
        const stale: string[] = [];
        for (const key of Object.keys(NOT_READ)) {
            const [tag, name] = [key.slice(0, key.lastIndexOf('.')), key.slice(key.lastIndexOf('.') + 1)];
            const c = components.find((x) => x.found.tag === tag);
            const read = c && new RegExp(`ctx\\.${name}\\b|\\b${name}\\s*\\(\\)|['"]${name}['"]`).test(c.found.rest);
            if (!c || !c.found.names.includes(name) || read) stale.push(key);
        }
        expect(stale, 'these exceptions no longer apply: remove them').toEqual([]);
    });
});
