// A binding on a native element whose property is certain is the assignment alone (#685).
//
// The compiler asked `name in el` in every binding on a plain element, and the element answered it
// on every update: `:checked` on an <input> asked whether an input has `checked`. Where the element
// certainly has the property (src/compiler/native-properties.ts), the attribute branch never runs and
// is not written. A name the table does not know keeps the question, and so does a custom element.

import { describe, it, expect } from 'vitest';
import { compile } from '../src/plugin';

const render = (template: string, script = 'let on = $signal(false);\nlet v = $signal(\'x\');') =>
    compile(`<template>${template}</template>\n<script>\n${script}\n</script>\n`, 'p.pdx', [], undefined, { production: true }).code;

describe('a bound property the native element certainly has', () => {
    it('is assigned without asking the element, and without the attribute branch', () => {
        const code = render('<input type="checkbox" :checked="on"><input :value="v" :disabled="on">');
        expect(code).not.toMatch(/"(checked|value|disabled)" in __el/);
        expect(code).not.toMatch(/removeAttribute\("(checked|value|disabled)"\)/);
        expect(code).toMatch(/__el\d+\["checked"\] = __v/);
        expect(code).toMatch(/__el\d+\["value"\] = __v/);
    });

    it('still clears it by its type for null, as core does', () => {
        expect(render('<input :value="v">')).toMatch(/clearBoundProperty\(__el\d+, "value", "value"\)/);
    });

    it('control: a name the table does not know, on a native element, still asks', () => {
        expect(render('<div :itemprop="v"></div>')).toMatch(/"itemprop" in __el\d+/);
        expect(render('<video :muted="on"></video>')).toMatch(/"muted" in __el\d+/);
    });

    it('control: a component is never asked, and an aria attribute is the attribute', () => {
        const code = render('<app-x :checked="on"></app-x><input :aria-label="v">');
        expect(code).toMatch(/assignBoundProperty\(__el\d+, "checked"/);
        expect(code).toMatch(/setAttribute\("aria-label"/);
    });
});
