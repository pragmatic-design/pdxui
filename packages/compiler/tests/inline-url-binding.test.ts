// A URL binding compiled with inlineBindings goes through the same sanitiser as the interpreted path.
//
// The interpreted path (core's `bindProperty`) sanitises the URL names, so `:href="item.url"`
// holding `javascript:alert(1)` is dropped in dev; a `propBind` that emitted `el["href"] = value`
// would leave it live in a `production: true, inlineBindings: true` build. The inline path calls
// core's `sanitizeBoundUrl` for those names and removes the attribute when it refuses.
//
// The compiler does not import core, so the list of URL names is a copy. The last case keeps it
// the same list as core's two, so the copy cannot drift in silence.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { compile } from '../src/plugin';
import { URL_BINDINGS } from '../src/compiler/codegen-template-inline';

function inline(template: string, script = "let url = $signal('/');"): string {
    const source = `<template>\n${template}\n</template>\n<script setup>\n${script}\n</script>`;
    return compile(source, 'inline-url.pdx', [], undefined, { production: true, inlineBindings: true }).code;
}

describe('inlineBindings: a URL binding is sanitised', () => {
    it(':href goes through sanitizeBoundUrl, never straight into the element', () => {
        const code = inline('<a :href="url">Go</a>');
        expect(code).toMatch(/sanitizeBoundUrl\(\w+, "href", ctx\.url\(\)\)/);
        expect(code, 'the raw value must not be assigned').not.toMatch(/\["href"\] = ctx\./);
        expect(code).toMatch(/import \{[^}]*\bsanitizeBoundUrl\b[^}]*\} from '@pdxui\/core'/);
        expect(() => new Function(code.replace(/^import .*$/gm, '')), 'the emitted module must parse').not.toThrow();
    });

    it(':src on an image too, and a refused value removes the attribute', () => {
        const code = inline('<img :src="url" />');
        expect(code).toMatch(/sanitizeBoundUrl\(\w+, "src", ctx\.url\(\)\)/);
        expect(code).toMatch(/removeAttribute\("src"\)/);
    });

    it('a two-way binding on a URL name is sanitised as well', () => {
        const code = inline('<input ::formaction="url" />');
        expect(code).toMatch(/sanitizeBoundUrl\(\w+, "formaction", /);
    });
});

describe('the controls', () => {
    it(':title and :value still compile to a direct assignment, with no sanitiser', () => {
        const code = inline('<input :title="url" :value="url" />');
        // The value read once into __v: null goes to core's clearBoundProperty, as core does.
        expect(code).toMatch(/const __v = ctx\.url\(\); if \(__v == null\) clearBoundProperty\(\w+, "title", "title"\); else \w+\["title"\] = __v;/);
        expect(code).toMatch(/const __v = ctx\.url\(\); if \(__v == null\) clearBoundProperty\(\w+, "value", "value"\); else \w+\["value"\] = __v;/);
        expect(code).not.toContain('sanitizeBoundUrl');
    });

    it('the interpreted build is unchanged: it binds through html``, which sanitises at runtime', () => {
        const source = "<template>\n<a :href=\"url\">Go</a>\n</template>\n<script setup>\nlet url = $signal('/');\n</script>";
        const code = compile(source, 'dev-url.pdx', [], undefined, { production: true, inlineBindings: false }).code;
        expect(code).not.toContain('sanitizeBoundUrl');
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
