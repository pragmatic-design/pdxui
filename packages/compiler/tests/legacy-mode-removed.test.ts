// The legacy script mode is removed (#158): `defineProps`, `defineEmits` and a top-level `return { … }`
// are forms the beta removed, `pdx migrate` converts them, `@mixin` is removed too, and a file without
// a script compiles like one with an empty `<script>` — there is no second code generator.
import { describe, it, expect } from 'vitest';
import { compile } from '../src/plugin';
import { legacyScript, mixinRemoved } from '../src/language/legacy-script';

const pdx = (template: string, script: string, open = '<script>') => `<template>\n  ${template}\n</template>\n${open}\n${script}\n</script>\n`;
const removed = (source: string) => compile(source, 'legacy.pdx').warnings.filter((w) => w.code === 'PDX_REMOVED_FORM');
const fix = (text: string) => (legacyScript.fix as (t: string) => string)(text);
/** The defects of a compile: errors and warnings, not the design questions. */
const defects = (source: string, name = 'x.pdx') => compile(source, name).warnings.filter((w) => w.severity !== 'info').map((w) => w.code);

describe('the legacy markers are removed forms', () => {
    it('defineProps is PDX_REMOVED_FORM at its line, naming @prop', () => {
        const source = pdx('<p>{{ label }}</p>', "const props = defineProps({ label: { type: String, default: 'a' } });");
        const [w] = removed(source);
        expect(w?.severity).toBe('error');
        expect(w?.message).toContain('@prop');
        expect(w?.line).toBe(5);
    });

    it('defineEmits and a top-level return { … } are too', () => {
        expect(removed(pdx('<p>x</p>', 'const emit = defineEmits();')).length).toBe(1);
        expect(removed(pdx('<p>{{ n }}</p>', 'const n = 1;\nreturn { n };')).length).toBe(1);
    });

    it('control — a return inside a function is not the marker', () => {
        expect(removed(pdx('<p>{{ pick() }}</p>', 'function pick() {\n  return { a: 1 };\n}'))).toEqual([]);
    });

    it('control — a marker in a comment or a string is not one', () => {
        expect(removed(pdx('<p>{{ s }}</p>', "// defineProps is the old way\nconst s = 'defineEmits(...)';"))).toEqual([]);
    });
});

describe('pdx migrate converts a legacy script', () => {
    const LEGACY = pdx(
        '<p>{{ label }} {{ count }}</p><button @click="save">save</button>',
        "const props = defineProps({ label: { type: String, default: 'a' }, count: { type: Number, default: 0 } });\n"
        + "const emit = defineEmits<{ saved: number }>();\n"
        + 'function save() { emit(\'saved\', 1); }\n'
        + 'return { save };',
    );
    const WRITTEN = pdx(
        '<p>{{ label }} {{ count }}</p><button @click="save">save</button>',
        // ctx.emit, which the legacy `emit` called, does not bubble (#138): a plain @event.
        "@prop label: string = 'a';\n@prop count: number = 0;\n@event saved: number;\n"
        + 'function save() { saved(1); }',
    );

    it('into the declarative form: @prop, @event, no return', () => {
        expect(fix(LEGACY)).toBe(WRITTEN);
    });

    it('the converted file compiles with no defect, to what the declarative file compiles to', () => {
        const after = fix(LEGACY);
        expect(defects(after)).toEqual([]);
        expect(compile(after, 'm.pdx').code).toBe(compile(WRITTEN, 'm.pdx').code);
        expect(legacyScript.detect(after), 'not idempotent').toEqual([]);
    });

    it('a prop without a default keeps being optional', () => {
        expect(fix(pdx('<p>{{ items }}</p>', 'const props = defineProps({ items: Array, on: { type: Boolean } });')))
            .toBe(pdx('<p>{{ items }}</p>', '@prop items: unknown[] | undefined = undefined;\n@prop on: boolean | undefined = undefined;'));
    });

    it('control — what it cannot convert stays, and is still found: a renamed return, a typed defineProps', () => {
        const renamed = pdx('<p>{{ a }}</p>', 'const x = 1;\nreturn { a: x };');
        expect(fix(renamed)).toBe(renamed);
        expect(legacyScript.detect(fix(renamed)).length).toBe(1);
        const typed = pdx('<p>{{ a }}</p>', 'const props = defineProps<{ a: string }>();');
        expect(fix(typed)).toBe(typed);
    });
});

describe('@mixin is removed', () => {
    it('is PDX_REMOVED_FORM, and pdx migrate flags it', () => {
        const source = pdx('<p>{{ clock }}</p>', "@mixin './use-clock.ts' as clock;");
        expect(removed(source).map((w) => w.message).join()).toContain('imported function');
        expect(mixinRemoved.fix).toBe('flag');
        expect(mixinRemoved.detect(source)).toEqual([{ line: 5, found: "@mixin './use-clock.ts' as clock" }]);
    });
});

describe('one code generator', () => {
    it('a file without a script compiles like one with an empty <script>', () => {
        const template = '<template>\n  <p class="a">{{ greeting }}</p>\n</template>\n';
        expect(compile(template, 'only.pdx').code).toBe(compile(`${template}<script>\n</script>\n`, 'only.pdx').code);
    });
});

describe('<script setup>', () => {
    it('is PDX_SETUP_REDUNDANT, an info: setup has no meaning', () => {
        const w = compile(pdx('<p>x</p>', '', '<script setup>'), 's.pdx').warnings.find((x) => x.code === 'PDX_SETUP_REDUNDANT');
        expect(w?.severity).toBe('info');
        expect(w?.line).toBe(4);
    });

    it('control — <script> is not', () => {
        expect(compile(pdx('<p>x</p>', ''), 's.pdx').warnings.map((x) => x.code)).not.toContain('PDX_SETUP_REDUNDANT');
    });
});
