// A URL binding compiled with inlineBindings goes through the same sanitiser as the interpreted path.
//
// The interpreted path (core's `bindProperty`) sanitises the URL names, so `:href="item.url"`
// holding `javascript:alert(1)` is dropped in dev; a `propBind` that emitted `el["href"] = value`
// would leave it live in a `production: true, inlineBindings: true` build. The inline path calls
// core's `bindUrl` for those names (#1346), which runs `sanitizeBoundUrl` and removes the attribute
// when it refuses: that it does is core's `bound-url.test.ts`.
//
// The compiler does not import core, so the list of URL names is a copy. The last case keeps it
// the same list as core's two, so the copy cannot drift in silence.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { compile } from '../src/plugin';
import { URL_BINDINGS } from '../src/compiler/codegen-template-inline';

function inline(template: string, script = "let url = $signal('/');"): string {
    const source = `<template>\n${template}\n</template>\n<script>\n${script}\n</script>`;
    return compile(source, 'inline-url.pdx', [], undefined, { production: true }).code;
}

describe('inlineBindings: a URL binding is sanitised', () => {
    it(':href goes through core\'s bindUrl, never straight into the element', () => {
        const code = inline('<a :href="url">Go</a>');
        expect(code).toMatch(/bindUrl\(\w+, "href", "href", \(\)=>ctx\.url\(\)\)/);
        expect(code, 'the raw value must not be assigned').not.toMatch(/\["href"\] = /);
        expect(code).toMatch(/import \{[^}]*\bbindUrl\b[^}]*\} from '@pdxui\/core'/);
        expect(() => new Function(code.replace(/^import .*$/gm, '')), 'the emitted module must parse').not.toThrow();
    });

    it(':src on an image too', () => {
        const code = inline('<img :src="url" />');
        expect(code).toMatch(/bindUrl\(\w+, "src", "src", \(\)=>ctx\.url\(\)\)/);
        expect(code, 'the raw value must not be assigned').not.toMatch(/\["src"\] = /);
    });

    it('a two-way binding on a URL name goes through core\'s bindTwoWay, which sanitises it', () => {
        // The inline path calls the runtime's two-way wiring (#97); that it sanitises a URL name is
        // core's two-way-url.test.ts.
        const code = inline('<input ::formaction="url" />');
        expect(code).toMatch(/bindTwoWay\(\w+, 'formaction', ctx\.url\)/);
        expect(code, 'the raw value must not be assigned').not.toMatch(/\["formaction"\] = /);
    });
});

describe('the controls', () => {
    it(':title and :value still compile to a direct assignment, with no sanitiser', () => {
        const code = inline('<input :title="url" :value="url" />');
        // Core's property binding (#1207): null goes to clearBoundProperty, anything else is assigned.
        expect(code).toMatch(/bindNativeProperty\(\w+, "title", "title", \(\)=>ctx\.url\(\)\)/);
        expect(code).toMatch(/bindNativeProperty\(\w+, "value", "value", \(\)=>ctx\.url\(\)\)/);
        expect(code).not.toContain('sanitizeBoundUrl');
    });
});

describe('a snippet body, built inline', () => {
    it(':href goes through bindUrl there too', () => {
        // The alpha slot body was an html`` template, which core's bindProperty sanitised at runtime (#364).
        const source = "<template>\n<pdx-list>@snippet item(row) { <a :href=\"url\">Go</a> }</pdx-list>\n</template>\n<script>\nlet url = $signal('/');\n</script>";
        const code = compile(source, 'slot-url.pdx', [], undefined, { production: true }).code;
        // The template's only <a> is the snippet's.
        expect(code).toMatch(/bindUrl\(\w+, "href", "href", \(\)=>ctx\.url\(\)\)/);
        expect(code, 'the raw value must not be assigned').not.toMatch(/\["href"\] = (ctx\.|__b)/);
        expect(code).not.toMatch(/html`/);
    });
});

describe('the URL names are the ones core sanitises', () => {
    const CORE = join(__dirname, '..', '..', 'core', 'src', 'renderer');

    /** The names in a `const NAME = new Set([...])` literal of a core source file. */
    function coreSet(file: string, name: string): string[] {
        const src = readFileSync(join(CORE, file), 'utf8');
        // Match: const URL_PROPS = new Set(['href', 'src', …]);  Groups: [1]=the list
        const m = src.match(new RegExp(`const ${name} = new Set\\(\\[([^\\]]*)\\]\\)`));
        expect(m, `${name} not found in ${file}`).not.toBeNull();
        return [...m![1].matchAll(/'([^']+)'/g)].map(x => x[1]).sort();
    }

    it('matches template.ts URL_PROPS and dom.ts URL_ATTRS', () => {
        const mine = [...URL_BINDINGS].sort();
        expect(mine).toEqual(coreSet('template.ts', 'URL_PROPS'));
        expect(mine).toEqual(coreSet('dom.ts', 'URL_ATTRS'));
    });
});
