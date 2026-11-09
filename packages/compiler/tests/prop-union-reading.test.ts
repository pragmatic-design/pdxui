// A @prop or @model typed as a union of one kind reads its attribute as that kind (#960, the owner's
// rule, 2026-11-09): `'top' | 'bottom'` is a String, `1 | 2` a Number, `true | false` a Boolean, and
// `null`/`undefined` aside. A union of kinds, or with an object type, stays Object — property-only for
// a prop, JSON for a model. It was Object for every union, so `search-position="dropdown"` did nothing.

import { describe, it, expect } from 'vitest';
import { compile } from '../src/plugin';

/** The descriptor entry the compiler writes for `name`, as text. */
function entryOf(script: string, name: string): string {
    const { code } = compile(`<template><p>x</p></template>\n<script>\n${script}\n</script>\n`, 'union.pdx');
    const line = code.split('\n').find((l) => l.trim().startsWith(`${name}:`));
    if (!line) throw new Error(`no entry for ${name}:\n${code}`);
    return line.trim().replace(/,$/, '');
}

describe('the runtime type of a union', () => {
    it('string literals are a String', () => {
        expect(entryOf("@prop pos: 'top' | 'bottom' = 'top';", 'pos')).toBe("pos: prop('top', { type: String })");
    });

    it('numeric literals or number are a Number; true, false or boolean a Boolean', () => {
        expect(entryOf('@prop n: 1 | 2 = 1;', 'n')).toContain('type: Number');
        expect(entryOf('@prop n: 1 | number = 1;', 'n')).toContain('type: Number');
        expect(entryOf('@prop b: true | false = false;', 'b')).toContain('type: Boolean');
    });

    it('null and undefined aside: a union of one kind and null is that kind', () => {
        expect(entryOf("@prop pos: 'top' | 'bottom' | null = null;", 'pos')).toContain('type: String');
        expect(entryOf("@prop pos: 'top' | undefined = 'top';", 'pos')).toContain('type: String');
    });

    it('an array of one kind of literal is an Array, as any T[] was', () => {
        expect(entryOf("@prop tags: ('a' | 'b')[] = [];", 'tags')).toContain('type: Array');
        expect(entryOf('@prop items: Item[] = [];', 'items')).toContain('type: Array');
    });

    it('a model of string literals and no { attribute } is a String, not JSON', () => {
        expect(entryOf("@model mode: 'view' | 'edit' = 'view';", 'mode')).toContain('type: String');
    });

    it('control — a union of kinds, or with an object type, stays Object', () => {
        expect(entryOf("@prop v: 'a' | 1 = 'a';", 'v')).toContain('type: Object');
        expect(entryOf('@prop f: Favourites | null = null;', 'f')).toContain('type: Object');
        expect(entryOf('@prop s: DataSource<unknown> | null = null;', 's')).toContain('type: Object');
    });

    it('control — the plain types keep their runtime type', () => {
        expect(entryOf("@prop label: string = '';", 'label')).toContain('type: String');
        expect(entryOf('@prop count: number = 0;', 'count')).toContain('type: Number');
        expect(entryOf('@prop open: boolean = false;', 'open')).toContain('type: Boolean');
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
