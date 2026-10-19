// PDX_SIGNAL_MUTATED_IN_PLACE: a $signal's value changed in place updates nothing (#151).
//
// `set` compares with Object.is, and an in-place mutation does not even call it: `items.push(x)` on a
// `$signal([])` leaves the list on screen as it was, and the compiler said nothing. Every mutating
// call and every write to a member of a $signal's value is reported where it is written; `push` and a
// property assignment carry the fix to the immutable form, which compiles clean. A $store is a proxy,
// where in-place mutation is the point: it is not reported.

import { describe, it, expect } from 'vitest';
import { compile } from '../src/plugin';
import type { ValidationWarning } from '../src/compiler/validate';

const CODE = 'PDX_SIGNAL_MUTATED_IN_PLACE';

const file = (script: string, template = '<p>{{ items.length }} {{ user.name }}</p>'): string =>
    `<template>\n  ${template}\n</template>\n<script>\n${script}\n</script>\n`;

const DECLS = 'let items = $signal<number[]>([]);\nlet user = $signal({ name: "a", age: 1, address: { city: "x" } });\nlet tags = $signal(new Set<string>());\nlet byId = $signal(new Map<number, string>());';

const findings = (source: string): ValidationWarning[] => compile(source, 'C:/x/example.pdx').warnings.filter(w => w.code === CODE);

/** The source with a finding's fix applied. */
function applied(source: string, w: ValidationWarning): string {
    let out = source;
    for (const e of [...w.fix!.edits].sort((a, b) => b.start - a.start)) out = out.slice(0, e.start) + e.newText + out.slice(e.end);
    return out;
}

describe('PDX_SIGNAL_MUTATED_IN_PLACE', () => {
    const mutations = [
        'items.push(1);', 'items.pop();', 'items.shift();', 'items.unshift(1);', 'items.splice(0, 1);',
        'items.sort();', 'items.reverse();', 'items.fill(0);', 'items.copyWithin(0, 1);',
        'tags.add("a");', 'tags.delete("a");', 'tags.clear();', 'byId.set(1, "a");',
        'user.name = "b";', 'user.age += 1;', 'user.age++;', 'user.address.city = "y";', 'items[0] = 2;',
    ];
    for (const m of mutations) {
        it(`reports \`${m}\` as a warning, on its line`, () => {
            const source = file(`${DECLS}\nfunction change() {\n  ${m}\n}`);
            const found = findings(source);
            expect(found, `no ${CODE} for ${m}`).toHaveLength(1);
            expect(found[0].severity).toBe('warn');
            // The template is lines 1-3, `<script>` line 4, the four declarations 5-8, the function 9.
            expect(found[0].line).toBe(10);
            expect(found[0].column).toBe(3);
        });
    }

    it('fixes push into a new array, which compiles clean', () => {
        const source = file(`${DECLS}\nfunction add(x: number) {\n  items.push(x, 2);\n}`);
        const [w] = findings(source);
        expect(w.fix, 'push carries no fix').toBeDefined();
        const fixed = applied(source, w);
        expect(fixed).toContain('items = [...items, x, 2];');
        expect(compile(fixed, 'C:/x/example.pdx').warnings.filter(x => x.severity !== 'info')).toEqual([]);
    });

    it('fixes a property assignment into a new object, which compiles clean', () => {
        const source = file(`${DECLS}\nfunction rename(v: string) {\n  user.name = v;\n}`);
        const [w] = findings(source);
        expect(w.fix, 'a property assignment carries no fix').toBeDefined();
        const fixed = applied(source, w);
        expect(fixed).toContain('user = { ...user, name: v };');
        expect(compile(fixed, 'C:/x/example.pdx').warnings.filter(x => x.severity !== 'info')).toEqual([]);
    });

    it('offers no fix where the immutable form is not one rewrite away', () => {
        for (const m of ['items.sort();', 'user.address.city = "y";', 'items[0] = 2;', 'user.age += 1;', 'const n = items.push(1);']) {
            const [w] = findings(file(`${DECLS}\nfunction change() {\n  ${m}\n}`));
            expect(w, `no finding for ${m}`).toBeDefined();
            expect(w.fix, `${m} should carry only the hint`).toBeUndefined();
        }
    });

    it('does not report what changes nothing in place', () => {
        const quiet = [
            'items = [...items, 1];', 'const copy = items.slice();', 'const n = items.length;', 'user = { ...user, name: "b" };',
            'const local = [1]; local.push(2);', 'function f(items: number[]) { items.push(1); }',
            'const s = items.map(x => x * 2);',
        ];
        for (const q of quiet) {
            expect(findings(file(`${DECLS}\nfunction change() {\n  ${q}\n}`)), `reported: ${q}`).toEqual([]);
        }
    });

    it('does not report a :ref target, which holds an element whose properties are set on purpose', () => {
        const source = file('let bar = $signal(null);\nlet box = $signal(null);\n$effect(() => {\n  if (bar) bar.style.width = "10%";\n  if (box) box.classList.add("on");\n});',
            '<div :ref="bar"></div><div ref="box"></div>');
        expect(findings(source)).toEqual([]);
    });

    it('does not report a $store, where in-place mutation is the point', () => {
        const source = file('let state = $store({ items: [] as number[], name: "a" });\nfunction add() {\n  state.items.push(1);\n  state.name = "b";\n}', '<p>{{ state.name }}</p>');
        expect(findings(source)).toEqual([]);
    });
});

// The same mutation written in a template event handler updates nothing either (#210).
describe('PDX_SIGNAL_MUTATED_IN_PLACE in a template event handler', () => {
    it('reports `@click="items.push(1)"` at its attribute, and its fix compiles clean', () => {
        const source = file(DECLS, '<button @click="items.push(1)">add</button> {{ items.length }}');
        const found = findings(source);
        expect(found, `no ${CODE} for a push in a handler`).toHaveLength(1);
        // The template's content is line 2, after two spaces; `items` is 16 characters into the tag.
        expect(found[0].line).toBe(2);
        expect(found[0].column).toBe(19);
        expect(source.split('\n')[1].slice(found[0].column! - 1)).toMatch(/^items\.push\(1\)/);
        const fixed = applied(source, found[0]);
        expect(fixed).toContain('@click="items = [...items, 1]"');
        expect(compile(fixed, 'C:/x/example.pdx').warnings.filter(x => x.severity !== 'info')).toEqual([]);
    });

    it('reports a field written from an arrow handler, and a fixable field write', () => {
        const arrow = findings(file(DECLS, '<input @input="e => user.name = e.target.value"> {{ user.name }}'));
        expect(arrow, 'no finding for a field written from an arrow handler').toHaveLength(1);
        const source = file(DECLS, `<button @click='user.name = "b"'>rename</button> {{ user.name }}`);
        const [w] = findings(source);
        expect(w?.fix, 'a field write in a handler carries no fix').toBeDefined();
        expect(applied(source, w)).toContain(`@click='user = { ...user, name: "b" }'`);
    });

    it('does not report a handler that mutates a loop item', () => {
        const source = file('let rows = $signal([{ id: 1, done: false }]);',
            '@for (rows as row; track row.id) { <button @click="row.done = true">{{ row.id }}</button> }');
        expect(findings(source)).toEqual([]);
    });

    it('does not report a name the handler or the template binds over a $signal', () => {
        const quiet = [
            // A loop variable, a destructured one and an index named like the script's $signals.
            '@for (groups as items; track items.id) { <button @click="items.push(1)">x</button> }',
            '@for (people as { user }; track user.id) { <button @click="user.name = \'b\'">x</button> }',
            // An arrow parameter.
            '<button @click="items => items.push(1)">x</button>',
            // A function reference, an immutable write, a :ref target.
            '<button @click="add">x</button><button @click="items = [...items, 1]">y</button>',
        ];
        for (const template of quiet) {
            const source = file(`${DECLS}\nlet groups = $signal([]);\nlet people = $signal([]);\nfunction add() {}`, template);
            expect(findings(source), `reported: ${template}`).toEqual([]);
        }
        const ref = file('let box = $signal(null);', '<div :ref="box"></div><button @click="box.classList.add(\'on\')">x</button>');
        expect(findings(ref)).toEqual([]);
    });
});
