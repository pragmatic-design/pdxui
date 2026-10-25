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
const FORM_MODEL = join(__dirname, '..', '..', '..', 'core', 'src', 'form', 'form-model.ts');

/**
 * The props core's `wireFormModel` reads for a component that declares a model `{ form: true }`
 * (#135): the host's `name`, which the form submits the value under, and the declared `value`, a
 * boolean model's checked value. Read there, not in the component's module, so the scan below would
 * not see them. Each is held to the line of form-model.ts that reads it.
 */
const READ_BY_FORM_MODEL: Record<string, RegExp> = {
    // Match: wireFormModel reading the host's `name` attribute. Groups: none
    name: /el\.attr\('name'\)/,
    // Match: wireFormModel reading the declared `value` prop. Groups: none
    value: /declared\('value'\)/,
};

/** Whether a module declares a model `{ form: true }`, which core wires to its form. */
const declaresFormModel = (src: string): boolean => /\bform:\s*(?:true|wireFormModel)\b/.test(src);

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

/** Past whitespace and `//` comment lines, from `i`. */
function skipBlank(src: string, i: number): number {
    for (;;) {
        while (i < src.length && /\s/.test(src[i])) i++;
        if (!src.startsWith('//', i)) return i;
        const eol = src.indexOf('\n', i);
        i = eol === -1 ? src.length : eol + 1;
    }
}

/**
 * Past one entry of an object literal, from `i` to just after its comma — or to its closing `}`,
 * where it stops. Brackets are balanced, and strings and comments are stepped over whole.
 */
function skipEntry(src: string, i: number): number {
    let depth = 0;
    while (i < src.length) {
        const c = src[i];
        if (c === '"' || c === "'" || c === '`') {
            for (i++; i < src.length && src[i] !== c; i++) if (src[i] === '\\') i++;
            i++;
        } else if (src.startsWith('//', i)) {
            const eol = src.indexOf('\n', i);
            i = eol === -1 ? src.length : eol + 1;
        } else if (src.startsWith('/*', i)) {
            const end = src.indexOf('*/', i + 2);
            i = end === -1 ? src.length : end + 2;
        } else if ('{[('.includes(c)) { depth++; i++; }
        else if ('}])'.includes(c)) {
            if (depth === 0) return i;
            depth--; i++;
        } else if (c === ',' && depth === 0) return i + 1;
        else i++;
    }
    return i;
}

/**
 * Where a descriptor's props block opens, just past its `{`, whatever comes before it — `models`
 * (#125), `variants` (#627), a comment. -1 when the descriptor declares none.
 */
function propsStart(src: string, descriptor: number): number {
    let i = descriptor;
    for (;;) {
        i = skipBlank(src, i);
        if (i >= src.length || src[i] === '}') return -1;
        // Match: `props: {` at i. Groups: none
        const props = /^props:\s*\{/.exec(src.slice(i, i + 32));
        if (props) return i + props[0].length;
        i = skipEntry(src, i);
    }
}

interface Declared { tag: string; names: string[]; rest: string; formModel: boolean }

/**
 * Every component a module registers with props — a module may register two, pdx-toggle's does —
 * with its top-level prop names, the module's text outside that props block, and whether its own
 * descriptor declares a form model.
 */
function declaredProps(src: string): Declared[] {
    const out: Declared[] = [];
    // Match: a registration up to its descriptor's `{`. Groups: [1]=tag
    const registrations = [...src.matchAll(/component\(\s*'(pdx-[a-z0-9-]+)'\s*,\s*\{/g)];
    registrations.forEach((m, k) => {
        const start = propsStart(src, m.index! + m[0].length);
        if (start < 0) return;
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
        const own = src.slice(m.index, registrations[k + 1]?.index ?? src.length);
        out.push({ tag: m[1], names, rest: src.slice(0, start) + src.slice(i), formModel: declaresFormModel(own) });
    });
    return out;
}

describe('the props a component declares', () => {
    const components = tsFiles(SRC).flatMap((f) =>
        declaredProps(readFileSync(f, 'utf8')).map((found) => ({ file: relative(SRC, f).replace(/\\/g, '/'), found })));

    it('were found, so the assertion below is not vacuous', () => {
        // Every registration with a props block: 114 on 2026-10-24 (#658), 82 when models-first
        // descriptors were skipped; 113 since pdx-pin-input was removed (#286).
        expect(components.length, 'no component with props: the scan broke').toBeGreaterThanOrEqual(113);
    });

    it('are each read by the component, or listed with a reason', () => {
        const unread: string[] = [];
        for (const { file, found } of components) {
            for (const name of found.names) {
                const read = new RegExp(`ctx\\.${name}\\b|\\b${name}\\s*\\(\\)|['"]${name}['"]`).test(found.rest)
                    || (found.formModel && name in READ_BY_FORM_MODEL);
                if (!read && !(`${found.tag}.${name}` in NOT_READ)) unread.push(`${found.tag}.${name} (${file})`);
            }
        }
        expect(unread, 'declared and never read: read it, remove it, or list it with a reason').toEqual([]);
    });

    it('read by core\'s form model are still read there', () => {
        // The category above outlives its reason the day wireFormModel stops reading one of them.
        const source = readFileSync(FORM_MODEL, 'utf8');
        const gone = Object.entries(READ_BY_FORM_MODEL).filter(([, line]) => !line.test(source)).map(([name]) => name);
        expect(gone, 'wireFormModel no longer reads these: a component that declares them reads them itself, or drops them').toEqual([]);
    });

    it('reach the components that open their descriptor with models (#658)', () => {
        // Before, a descriptor whose first entry was `models` was skipped, and none of its props was read.
        expect(components.map((c) => c.found.tag)).toEqual(expect.arrayContaining(['pdx-switch', 'pdx-select', 'pdx-input']));
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
