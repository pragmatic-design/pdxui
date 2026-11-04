// An `@if` / `@else if` / `@else` chain compiles to one branch, core's whenChain (#685).
//
// It compiled to a when() per link, nested in the previous one's else: an effect, two markers and a
// fragment for each `@else if`. A chain is one choice among its branches, and is now one effect that
// picks the first condition that holds. Core holds what it renders (`when-chain.test.ts`, and the
// render parity table's `an @if chain as a @for row` and `an @if chain that switches`).

import { describe, it, expect } from 'vitest';
import { compile } from '../src/plugin';

const render = (template: string) => compile(
    `<template>${template}</template>\n<script>\nlet a = $signal(true);\nlet b = $signal(false);\n</script>\n`,
    'p.pdx', [], undefined, { production: true },
).code;

const count = (code: string, re: RegExp) => [...code.matchAll(re)].length;

describe('an @if chain', () => {
    it('with an @else if and an @else is one whenChain, with no when()', () => {
        const code = render('<p>@if (a) { <b>a</b> } @else if (b) { <i>b</i> } @else { <u>c</u> }</p>');
        expect(count(code, /\bwhenChain\(/g)).toBe(1);
        expect(count(code, /\bwhen\(/g)).toBe(0);
        expect(code).toMatch(/whenChain\(\(\)=>\(ctx\.a\(\)\)\?0:\(ctx\.b\(\)\)\?1:2,\[/);
    });

    it('without an @else picks -1 when no condition holds', () => {
        const code = render('<p>@if (a) { <b>a</b> } @else if (b) { <i>b</i> }</p>');
        expect(code).toMatch(/whenChain\(\(\)=>\(ctx\.a\(\)\)\?0:\(ctx\.b\(\)\)\?1:-1,\[/);
    });

    it('control: a lone @if and an @if with an @else stay when()', () => {
        expect(render('<p>@if (a) { <b>a</b> }</p>')).not.toMatch(/whenChain\(/);
        expect(render('<p>@if (a) { <b>a</b> } @else { <u>c</u> }</p>')).not.toMatch(/whenChain\(/);
    });

    it('control: a chain with a transition on any link stays nested when(), which runs transitions', () => {
        const code = render("<p>@if (a) { <b>a</b> } @else if (b) @transition('fade-in', 'fade-out') { <i>b</i> } @else { <u>c</u> }</p>");
        expect(code).not.toMatch(/whenChain\(/);
        expect(count(code, /\bwhen\(/g)).toBe(2);
    });
});
