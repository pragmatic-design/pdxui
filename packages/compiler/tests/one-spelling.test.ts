// One spelling per template form (#129): `ref=`, the `:show` attribute, `:class.x` and `:style.x`
// are removed in favour of `:ref`, `@show`, the `:class` object and the `:style` object. Each is
// PDX_REMOVED_FORM naming the kept form, `pdx migrate` rewrites it, and what it writes compiles with
// no diagnostic of its own. A single template pipe is PDX_PIPE_SINGLE (info), whose fix is the call.

import { describe, it, expect } from 'vitest';
import { compile } from '../src/plugin';
import { LANGUAGE_CHANGES } from '../src/language/changes';

function sfc(template: string, script = "let on = $signal(true);\nlet c = $signal('red');\nlet a = $signal('blue');\nlet box = $signal(null);\nlet n = $signal(1);\nfunction money(v, cur) { return cur + v; }\nfunction upper(v) { return String(v).toUpperCase(); }\nfunction trim(v) { return String(v).trim(); }"): string {
    return `<template>\n${template}\n</template>\n<script setup>\n${script}\n</script>\n`;
}
const warnings = (source: string) => compile(source, 'one.pdx', [], undefined, {}).warnings;
const removed = (source: string) => warnings(source).filter(w => w.code === 'PDX_REMOVED_FORM').map(w => w.message);
const change = (id: string) => {
    const c = LANGUAGE_CHANGES.find(x => x.id === id);
    if (!c || c.fix === 'flag') throw new Error(`no mechanical change ${id}`);
    return c as typeof c & { fix: (t: string) => string };
};
/** Every finding of a source, as `code: message`, the removed forms' and the errors'. */
const errorsAndRemoved = (source: string) => warnings(source)
    .filter(w => w.code === 'PDX_REMOVED_FORM' || w.severity === 'error').map(w => `${w.code}: ${w.message}`);

describe('ref= → :ref', () => {
    const src = sfc('<div ref="box">x</div>');
    it('is PDX_REMOVED_FORM naming :ref', () => {
        expect(removed(src)).toEqual([expect.stringContaining(':ref')]);
    });
    it('migrate rewrites it, and the result compiles clean', () => {
        const out = change('ref-attribute').fix(src);
        expect(out).toContain('<div :ref="box">x</div>');
        expect(errorsAndRemoved(out)).toEqual([]);
    });
});

describe(':show → @show', () => {
    it('is PDX_REMOVED_FORM naming @show', () => {
        expect(removed(sfc('<div :show="on">x</div>'))).toEqual([expect.stringContaining('@show')]);
    });
    it('migrate wraps the element, nested tags of its name included, and the result compiles clean', () => {
        const src = sfc('<div class="a" :show="on && n > 0"><div>inner</div><span>{{ n }}</span></div>\n<p>after</p>');
        const out = change('show-attribute').fix(src);
        expect(out).toContain('@show (on && n > 0) { <div class="a"><div>inner</div><span>{{ n }}</span></div> }\n<p>after</p>');
        expect(errorsAndRemoved(out)).toEqual([]);
    });
    it('an attribute alone on its line goes with its line, and a multi-line element becomes a block', () => {
        const src = sfc('  <div\n    class="a"\n    :show="on"\n    data-test="x">\n    <span>{{ n }}</span>\n  </div>');
        const out = change('show-attribute').fix(src);
        expect(out).toContain('  @show (on) {\n    <div\n      class="a"\n      data-test="x">\n      <span>{{ n }}</span>\n    </div>\n  }\n');
        expect(errorsAndRemoved(out)).toEqual([]);
    });
    it('a multi-line element holding a <pre> is not re-indented', () => {
        const out = change('show-attribute').fix(sfc('  <div :show="on">\n<pre>a\n b</pre>\n  </div>'));
        expect(out).toContain('  @show (on) {\n  <div>\n<pre>a\n b</pre>\n  </div>\n  }\n');
    });
    it('a void or self-closing element is wrapped whole', () => {
        const out = change('show-attribute').fix(sfc('<input :show="on" />\n<br>'));
        expect(out).toContain('@show (on) { <input /> }');
    });
});

describe('@show over one element costs what the :show attribute cost', () => {
    const build = (template: string) => compile(sfc(template), 'one.pdx', [], undefined, { production: true }).code;
    it('one element: its display is bound where it is built, with no show() block', () => {
        const code = build('<section>\n  @show (on) {\n    <p class="a">{{ n }}</p>\n  }\n</section>');
        expect(code).toMatch(/effect\(\(\)=>\{__el\d+\.style\.display=\(ctx\.on\(\)\)\?'':'none';\}\);/);
        expect(code).not.toMatch(/\bshow\(/);
    });
    it('more than one element, or a text node beside it, keeps show()', () => {
        expect(build('@show (on) { <p>a</p><p>b</p> }')).toMatch(/\bshow\(\(\)=>ctx\.on\(\),/);
        expect(build('@show (on) { Total: <b>{{ n }}</b> }')).toMatch(/\bshow\(\(\)=>ctx\.on\(\),/);
    });
});

describe(':class.x → :class object', () => {
    it('is PDX_REMOVED_FORM naming the object form', () => {
        expect(removed(sfc('<p :class.active="on">x</p>'))).toEqual([expect.stringContaining(':class="{')]);
    });
    it('migrate merges every :class.x of an element into one object, with an existing one', () => {
        const out = change('class-dot').fix(sfc('<p :class="{ big: n > 1 }" :class.active="on" :class.is-red="c === \'red\'">x</p>'));
        expect(out).toContain(`<p :class="{ big: n > 1, active: on, 'is-red': c === 'red' }">x</p>`);
        expect(errorsAndRemoved(out)).toEqual([]);
    });
});

describe(':class.x beside a string :class', () => {
    it('keeps the string form, the toggles joined to it, and compiles clean', () => {
        const out = change('class-dot').fix(sfc('<p :class="c" :class.active="on">x</p>'));
        expect(out).toContain(`<p :class="[c, on && 'active'].filter(Boolean).join(' ')">x</p>`);
        expect(errorsAndRemoved(out)).toEqual([]);
    });
});

describe(':style.x → :style object', () => {
    it('is PDX_REMOVED_FORM naming the object form', () => {
        expect(removed(sfc('<p :style.color="c">x</p>'))).toEqual([expect.stringContaining(':style="{')]);
    });
    it('migrate merges :style.color and :style.--accent into one object, custom properties quoted', () => {
        const out = change('style-dot').fix(sfc('<p :style.color="c" :style.--accent="a">x</p>'));
        expect(out).toContain(`<p :style="{ color: c, '--accent': a }">x</p>`);
        expect(errorsAndRemoved(out)).toEqual([]);
    });
    it('a merged attribute alone on its line leaves no blank line behind', () => {
        const out = change('style-dot').fix(sfc('<p\n  :style.color="c"\n  :style.--accent="a"\n  data-test="x">x</p>'));
        expect(out).toContain(`<p\n  :style="{ color: c, '--accent': a }"\n  data-test="x">x</p>`);
    });
});

describe('what is not a removed form', () => {
    it(':ref, @show, the objects, and the forms in the script are left alone', () => {
        const src = sfc('<div :ref="box">x</div>\n@show (on) { <p>y</p> }\n<p :class="{ active: on }" :style="{ color: c }">z</p>',
            "let on = $signal(true);\nlet c = $signal('red');\nlet box = $signal(null);\nconst sample = '<div ref=\"x\" :show=\"y\">';");
        expect(removed(src)).toEqual([]);
    });
});

describe('PDX_PIPE_SINGLE', () => {
    const pipeFindings = (source: string) => warnings(source).filter(w => w.code === 'PDX_PIPE_SINGLE');
    it('a single pipe is an info whose fix is the call', () => {
        const src = sfc('<p>{{ n | upper }}</p>');
        const [w] = pipeFindings(src);
        expect(w?.severity).toBe('info');
        expect(w?.fix?.edits).toHaveLength(1);
        const { start, end, newText } = w!.fix!.edits[0];
        expect(src.slice(0, start) + newText + src.slice(end)).toContain('<p>{{ upper(n) }}</p>');
    });
    it('with arguments, the value goes first', () => {
        const src = sfc("<p>{{ n | money('EUR') }}</p>");
        const { start, end, newText } = pipeFindings(src)[0].fix!.edits[0];
        expect(src.slice(0, start) + newText + src.slice(end)).toContain("<p>{{ money(n, 'EUR') }}</p>");
    });
    it('a chain of two or more, and || or |=, raise nothing', () => {
        expect(pipeFindings(sfc('<p>{{ n | trim | upper }}</p><p>{{ n || 0 }}</p>'))).toEqual([]);
    });
});
