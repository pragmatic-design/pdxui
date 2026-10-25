// A .pdx component's array or object prop default is its own in each instance (#677).
//
// The compiler emitted a literal default, `default: []`, one array for every instance. Two instances
// of the compiled component, mounted with the real core, must read two arrays.

import { describe, it, expect, afterEach } from 'vitest';
import * as core from '@pdxui/core';
import { compile } from '../../../compiler/src/plugin';
import { cleanup, tick } from './helpers';

afterEach(() => cleanup());

function define(name: string, script: string): void {
    const src = `<template><p>{{ tags.length }}</p></template>\n<script>\n${script}\n</script>\n`;
    const { code } = compile(src, `${name}.pdx`, [], undefined, {});
    const body = code.replace(/import\s*\{([^}]*)\}\s*from\s*'@pdxui\/core';?/, 'const {$1} = __core;');
    new Function('__core', body)(core);
}

describe('a .pdx with an array and an object prop default', () => {
    it('two instances read two arrays and two objects', async () => {
        define('default-probe', "@prop tags: string[] = [];\n@prop opts: { a: number } = { a: 1 };");
        const a = document.createElement('app-default-probe') as HTMLElement & { tags: string[]; opts: object };
        const b = document.createElement('app-default-probe') as HTMLElement & { tags: string[]; opts: object };
        document.body.append(a, b);
        await tick();
        expect(a.tags).toEqual([]);
        expect(a.tags).not.toBe(b.tags);
        expect(a.opts).toEqual({ a: 1 });
        expect(a.opts).not.toBe(b.opts);
    });
});
