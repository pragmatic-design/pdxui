// A binding on a native element whose property is certain is the assignment alone (#685).
//
// The compiler asked `name in el` in every binding on a plain element, and the element answered it
// on every update: `:checked` on an <input> asked whether an input has `checked`. Where the element
// certainly has the property (src/compiler/native-properties.ts), the attribute branch never runs:
// the binding is core's `bindNativeProperty`, which assigns and does not ask (#1207). A name the table
// does not know keeps the question, `bindAttributeOrProperty`, and a custom element is never asked.
// What each writes — null cleared by the property's type, as core does — is core's, and held there
// (packages/core/tests/bound-attribute.test.ts).

import { describe, it, expect } from 'vitest';
import { compile } from '../src/plugin';

const render = (template: string, script = 'let on = $signal(false);\nlet v = $signal(\'x\');') =>
    compile(`<template>${template}</template>\n<script>\n${script}\n</script>\n`, 'p.pdx', [], undefined, { production: true }).code;

describe('a bound property the native element certainly has', () => {
    it('is assigned without asking the element, and without the attribute branch', () => {
        const code = render('<input type="checkbox" :checked="on"><input :value="v" :disabled="on">');
        expect(code).not.toMatch(/bindAttributeOrProperty\(__el\d+, "(checked|value|disabled)"/);
        expect(code).toMatch(/bindNativeProperty\(__el\d+, "checked", "checked", /);
        expect(code).toMatch(/bindNativeProperty\(__el\d+, "value", "value", /);
        expect(code).toMatch(/bindNativeProperty\(__el\d+, "disabled", "disabled", /);
    });

    it('control: a name the table does not know, on a native element, still asks', () => {
        expect(render('<div :itemprop="v"></div>')).toMatch(/bindAttributeOrProperty\(__el\d+, "itemprop", "itemprop", /);
        expect(render('<video :muted="on"></video>')).toMatch(/bindAttributeOrProperty\(__el\d+, "muted", "muted", /);
    });

    it('control: a component is never asked, and an aria attribute is the attribute', () => {
        const code = render('<app-x :checked="on"></app-x><input :aria-label="v">');
        expect(code).toMatch(/assignBoundProperty\(__el\d+, "checked"/);
        expect(code).toMatch(/bindAttribute\(__el\d+, "aria-label", /);
    });
});
