// Which compiled blocks core imports instead of cloning (#1296). A block is cloned, and a component in
// it upgraded when the copy is inserted: a PDX component takes over a property its binding set before.
// A third-party element may not, so a block that holds one is imported, which upgrades it before the
// bindings run. The compiler knows the tags: PDX's are `pdx-…` and the project's prefix (`app-…`).

import { describe, it, expect } from 'vitest';
import { compile } from '../src/plugin';

const blocks = (template: string): string[] => {
    const { code } = compile(`<template>${template}</template>\n<script>\nlet a = $signal(1);\n</script>`, 'test.pdx');
    // Match: a hoisted block, `const __blkN=staticBlock(…);`. Groups: [1]=its arguments
    return [...code.matchAll(/=staticBlock\((.*)\);$/gm)].map((m) => m[1]);
};
const imported = (args: string) => /,true$/.test(args);

describe('a compiled block is cloned, and imported only around a third-party element (#1296)', () => {
    it('a block of PDX components is cloned: the library\'s and the project\'s', () => {
        expect(blocks('<div><pdx-button>{{ a }}</pdx-button><app-card></app-card></div>').map(imported)).toEqual([false]);
    });

    it('a block that holds a third-party element is imported', () => {
        expect(blocks('<div><sl-button>{{ a }}</sl-button></div>').map(imported)).toEqual([true]);
    });

    it('an element with is= is a third-party element', () => {
        expect(blocks('<div><button is="fancy-button">{{ a }}</button></div>').map(imported)).toEqual([true]);
    });

    it('the control: plain markup is cloned', () => {
        expect(blocks('<div><span>{{ a }}</span></div>').map(imported)).toEqual([false]);
    });

    it('only the block that holds it: an @if branch of its own', () => {
        const args = blocks('<p>{{ a }}</p>@if (a) { <sl-tag>x</sl-tag> }');
        expect(args.map(imported).sort()).toEqual([false, true]);
    });
});
