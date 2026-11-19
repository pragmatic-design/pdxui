// A @prop or @model typed as a union of one kind reads its attribute as that kind (#960, the owner's
// rule, 2026-11-09): `'top' | 'bottom'` is a String, `1 | 2` a Number, `true | false` a Boolean, and
// `null`/`undefined` aside. A union of kinds, or with an object type, stays Object — property-only for
// a prop, JSON for a model. It was Object for every union, so `search-position="dropdown"` did nothing.
//
// What is held is the type core's `prop` ends up with: the descriptor entry is run against the real
// `prop`. A literal default whose kind is the type leaves `{ type }` out and core infers it (#1207); the
// entry's text is held where that matters, below.

import { describe, it, expect } from 'vitest';
import { compile } from '../src/plugin';
import { prop } from '../../core/src/component/component-descriptor';

/** The descriptor entry the compiler writes for `name`, as text. */
function entryOf(script: string, name: string): string {
    const { code } = compile(`<template><p>x</p></template>\n<script>\n${script}\n</script>\n`, 'union.pdx');
    const line = code.split('\n').find((l) => l.trim().startsWith(`${name}:`));
    if (!line) throw new Error(`no entry for ${name}:\n${code}`);
    return line.trim().replace(/,$/, '');
}

/** The runtime type core's `prop` gives the entry for `name`: `String`, `Number`, `Object`… */
function typeOf(script: string, name: string): string {
    const value = entryOf(script, name).slice(name.length + 1);
    const spec = new Function('prop', 'wireFormModel', `return (${value});`)(prop, undefined) as { type: { name: string } };
    return spec.type.name;
}

describe('the runtime type of a union', () => {
    it('string literals are a String', () => {
        expect(typeOf("@prop pos: 'top' | 'bottom' = 'top';", 'pos')).toBe('String');
    });

    it('numeric literals or number are a Number; true, false or boolean a Boolean', () => {
        expect(typeOf('@prop n: 1 | 2 = 1;', 'n')).toBe('Number');
        expect(typeOf('@prop n: 1 | number = 1;', 'n')).toBe('Number');
        expect(typeOf('@prop b: true | false = false;', 'b')).toBe('Boolean');
    });

    it('null and undefined aside: a union of one kind and null is that kind', () => {
        expect(typeOf("@prop pos: 'top' | 'bottom' | null = null;", 'pos')).toBe('String');
        expect(typeOf("@prop pos: 'top' | undefined = 'top';", 'pos')).toBe('String');
    });

    it('an array of one kind of literal is an Array, as any T[] was', () => {
        expect(typeOf("@prop tags: ('a' | 'b')[] = [];", 'tags')).toBe('Array');
        expect(typeOf('@prop items: Item[] = [];', 'items')).toBe('Array');
    });

    it('a model of string literals and no { attribute } is a String, not JSON', () => {
        expect(typeOf("@model mode: 'view' | 'edit' = 'view';", 'mode')).toBe('String');
    });

    it('control — a union of kinds, or with an object type, stays Object', () => {
        expect(typeOf("@prop v: 'a' | 1 = 'a';", 'v')).toBe('Object');
        expect(typeOf('@prop f: Favourites | null = null;', 'f')).toBe('Object');
        expect(typeOf('@prop s: DataSource<unknown> | null = null;', 's')).toBe('Object');
    });

    it('control — the plain types keep their runtime type', () => {
        expect(typeOf("@prop label: string = '';", 'label')).toBe('String');
        expect(typeOf('@prop count: number = 0;', 'count')).toBe('Number');
        expect(typeOf('@prop open: boolean = false;', 'open')).toBe('Boolean');
    });
});

describe('the type is written unless core infers the same one from the default (#1207)', () => {
    it('a literal default of the type\'s kind leaves it out', () => {
        expect(entryOf("@prop pos: 'top' | 'bottom' = 'top';", 'pos')).toBe("pos: prop('top')");
        expect(entryOf('@prop n: number = -1.5;', 'n')).toBe('n: prop(-1.5)');
        expect(entryOf('@prop b: boolean = true;', 'b')).toBe('b: prop(true)');
    });

    it('a default core would infer otherwise keeps it: the string default of an Object prop', () => {
        // Inferred from 'a', core would make it a String; the analyser chose Object.
        expect(entryOf("@prop v: 'a' | 1 = 'a';", 'v')).toBe("v: prop('a', { type: Object })");
    });

    it('a default that is not a literal keeps it: a name, null, a template literal', () => {
        expect(entryOf("const D = 'x';\n@prop a: string = D;", 'a')).toBe('a: prop(D, { type: String })');
        expect(entryOf("@prop pos: 'top' | null = null;", 'pos')).toBe('pos: prop(null, { type: String })');
        expect(entryOf('@prop t: string = `x`;', 't')).toBe('t: prop(`x`, { type: String })');
    });
});

describe('an absent prop with no default', () => {
    it('holds null when its type says null', () => {
        expect(entryOf("@prop pos?: 'top' | 'bottom' | null;", 'pos')).toBe('pos: prop(null, { type: String })');
    });

    it('holds the empty value of its kind otherwise, as before', () => {
        expect(entryOf("@prop pos?: 'top' | 'bottom';", 'pos')).toBe('pos: prop.optional({ type: String })');
    });
});
