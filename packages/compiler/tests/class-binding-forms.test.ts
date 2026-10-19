// `:class` is specialised at compile time when the compiler can see the classes it yields (#112).
//
// The generic routine — split the value, filter, remove what is gone, add what is new — runs for every
// change of every binding. Specialised:
//   1. an object literal: one classList.toggle per key, each in its own effect (the #96 expansion);
//   2. a conditional or `&&` whose branches are string literals: one effect that toggles each class;
//   3. any other value on a plain element with no other class source: `className` is assigned;
//   4. everything else keeps the generic routine.

import { describe, it, expect } from 'vitest';
import { compile } from '../src/plugin';

function render(template: string): string {
    const src = `<template>${template}</template>\n<script>\nlet on = $signal(true);\nlet size = $signal('lg');\nlet name = $signal('x');\nlet other = $signal('y');\n</script>\n`;
    const { code } = compile(src, 'class-forms.pdx', [], undefined, { production: true });
    return code.slice(code.indexOf('render:'));
}

const GENERIC = /\.split\(\/\\s\+\/\)/;

describe(':class specialised forms', () => {
    it('1. an object literal: one toggle per key, each in its own effect', () => {
        const out = render('<p :class="{ active: on, big: size === \'lg\' }">o</p>');
        expect(out).toMatch(/effect\(\(\)=>\{__el\d+\.classList\.toggle\("active",!!\(ctx\.on\(\)\)\);\}\);/);
        expect(out).toMatch(/effect\(\(\)=>\{__el\d+\.classList\.toggle\("big",!!\(ctx\.size\(\) === 'lg'\)\);\}\);/);
        expect(out).not.toMatch(GENERIC);
    });

    it('2. a conditional of string literals: one effect toggling each class', () => {
        const out = render('<p :class="on ? \'a\' : \'b\'">c</p>');
        expect(out).toMatch(/effect\(\(\)=>\{const __c=!!\(ctx\.on\(\)\);__el\d+\.classList\.toggle\("a",__c\);__el\d+\.classList\.toggle\("b",!__c\);\}\);/);
        expect(out).not.toMatch(GENERIC);
    });

    it('2. `c ? \'a\' : \'\'` and `c && \'a\'`: the one class', () => {
        for (const expr of ["on ? 'danger' : ''", "on && 'danger'"]) {
            const out = render(`<p :class="${expr}">c</p>`);
            expect(out, expr).toMatch(/effect\(\(\)=>\{const __c=!!\(ctx\.on\(\)\);__el\d+\.classList\.toggle\("danger",__c\);\}\);/);
            expect(out, expr).not.toMatch(GENERIC);
        }
    });

    it('3. any other value on a plain element with no other class: className is assigned', () => {
        const out = render('<p :class="name">s</p>');
        expect(out).toMatch(/effect\(\(\)=>\{__el\d+\.className=interpolationText\(ctx\.name\(\)\);\}\);/);
        expect(out).not.toMatch(GENERIC);
    });

    it('4. a static class beside it keeps the generic routine: className would wipe it', () => {
        expect(render('<p class="base" :class="name">s</p>')).toMatch(GENERIC);
    });

    it('4. a conditional naming a static class keeps the generic routine: a toggle would remove it', () => {
        expect(render('<p class="a" :class="on ? \'a\' : \'b\'">s</p>')).toMatch(GENERIC);
    });

    it('3. a string with a toggle joined to it, as pdx migrate writes :class.x beside a value, assigns className', () => {
        expect(render('<p :class="[name, on && \'big\'].filter(Boolean).join(\' \')">s</p>')).toMatch(/\.className=interpolationText\(/);
    });

    it('4. a component keeps the generic routine: it may put classes on its own host', () => {
        expect(render('<x-card :class="name"></x-card>')).toMatch(GENERIC);
    });

    it('the generic routine reads its value through interpolationText: `a || b` is valid JavaScript', () => {
        const out = render('<p class="base" :class="name || other">s</p>');
        expect(out).toContain('interpolationText(ctx.name() || ctx.other())');
        const body = out.replace(/^render: /, '').replace(/,\s*\}\);\s*$/, '');
        expect(() => new Function('ctx', `return ${body}`), 'the render does not parse').not.toThrow();
    });
});
