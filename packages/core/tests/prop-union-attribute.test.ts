// A compiled component reads the attribute of a prop typed as a union of one kind (#960): `'top' |
// 'bottom'` is a String, so `pos="bottom"` sets the prop. It was compiled as an Object, which core keeps
// property-only, and the attribute did nothing.

import { describe, it, expect, afterEach } from 'vitest';
import * as core from '../src/index';
import { compile } from '../../compiler/src/plugin';

let seq = 0;
const hosts: HTMLElement[] = [];
afterEach(() => { for (const h of hosts.splice(0)) h.remove(); });

/** A component compiled from `template` and `script`, mounted with `attrs`; returns its host. */
async function mounted(template: string, script: string, attrs: Record<string, string> = {}): Promise<HTMLElement> {
    const name = `union${++seq}`;
    const { code } = compile(`<template>${template}</template>\n<script>\n${script}\n</script>\n`, `${name}.pdx`);
    const body = code.replace(/^\s*import\s*\{([^}]*)\}\s*from\s*'@pdxui\/core';?\s*$/gm, 'const {$1} = __core;');
    new Function('__core', body)(core);
    const el = document.createElement(`app-${name}`);
    for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
    document.body.appendChild(el);
    hosts.push(el);
    await new Promise((r) => setTimeout(r, 0));
    return el;
}
const text = (el: HTMLElement) => el.querySelector('p')!.textContent;

describe('a prop typed as a union of string literals', () => {
    it('reads its attribute', async () => {
        const el = await mounted('<p>{{ pos }}</p>', "@prop pos: 'top' | 'bottom' = 'top';", { pos: 'bottom' });
        expect(text(el)).toBe('bottom');
    });

    it('follows its attribute when it changes', async () => {
        const el = await mounted('<p>{{ pos }}</p>', "@prop pos: 'top' | 'bottom' = 'top';");
        expect(text(el)).toBe('top');
        el.setAttribute('pos', 'bottom');
        await new Promise((r) => setTimeout(r, 0));
        expect(text(el)).toBe('bottom');
    });

    it('a kebab-case attribute reaches a camelCase prop', async () => {
        const el = await mounted('<p>{{ searchPosition }}</p>', "@prop searchPosition: 'trigger' | 'dropdown' = 'trigger';", { 'search-position': 'dropdown' });
        expect(text(el)).toBe('dropdown');
    });

    it('absent with no default: null when its type says null, else the empty string', async () => {
        const withNull = await mounted("<p>{{ pos === null ? 'null' : 'not null' }}</p>", "@prop pos?: 'top' | 'bottom' | null;");
        expect(text(withNull)).toBe('null');
        const without = await mounted("<p>{{ JSON.stringify(pos) }}</p>", "@prop pos?: 'top' | 'bottom';");
        expect(text(without)).toBe('""');
    });
});

describe('a model typed as a union of string literals, with no { attribute }', () => {
    it('reads its attribute as a string, not as JSON', async () => {
        // `"1"` is valid JSON: read as JSON it was the number 1, which its type does not allow.
        const el = await mounted('<p>{{ typeof level }}:{{ level }}</p>', "@model level: '1' | '2' = '2';", { level: '1' });
        expect(text(el)).toBe('string:1');
    });
});
