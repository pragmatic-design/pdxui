// Each `@defer` of a module loads its code through one module-level deferCode (#685).
//
// Its blocks had a load function each, written inline in the render: a block never knew the code had
// arrived for another, and rendered its body a flush later every time. Core's `defer-code.test.ts`
// holds what a shared deferCode does; this holds that the compiler emits one per `@defer`.

import { describe, it, expect } from 'vitest';
import { compile } from '../src/plugin';

const compileWith = (template: string) => compile(
    `<template>${template}</template>\n<script>\nlet on = $signal(true);\n</script>\n`,
    'p.pdx', [], undefined, { production: true, importPathOf: (tag: string) => (tag === 'x-chart' ? './x-chart.js' : tag === 'x-map' ? './x-map.js' : null) },
).code;

describe('a @defer\'s code', () => {
    it('is a module-level deferCode, passed to defer() by name', () => {
        const code = compileWith('@defer (immediate) { <x-chart></x-chart> }');
        expect(code).toMatch(/^const (__code\d+)=deferCode\(\(\) => Promise\.all\(\[import\('\.\/x-chart\.js'\)\]\)\);$/m);
        const name = code.match(/^const (__code\d+)=deferCode/m)![1];
        expect(code).toContain(`defer({trigger:'immediate'},${name},`);
    });

    it('one per @defer: two blocks load their own code', () => {
        const code = compileWith('@defer (immediate) { <x-chart></x-chart> } @defer (viewport) { <x-map></x-map> }');
        expect([...code.matchAll(/^const __code\d+=deferCode\(/gm)].length).toBe(2);
    });

    it('control: a @defer with no code to load passes null, as before', () => {
        const code = compileWith('@defer (immediate) { <p>x</p> }');
        expect(code).not.toMatch(/deferCode/);
        expect(code).toMatch(/defer\(\{trigger:'immediate'\},null,/);
    });
});
