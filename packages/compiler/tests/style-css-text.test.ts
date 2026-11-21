// `:style="expr"` writes `style.cssText` (#1240), as the language reference says (docs/language/template.md,
// `:style`). The compiler bound it as a property, `bindAttributeOrProperty(el, "style", "style", …)`,
// which assigns `el.style = value`: a browser forwards that to `cssText`, happy-dom throws on an SVG
// element, whose `style` has only a getter. What `bindStyleText` writes is core's, held there
// (packages/core/tests/bound-attribute.test.ts).

import { describe, it, expect } from 'vitest';
import { compile } from '../src/plugin';

const render = (template: string, script = "let s = $signal('color: red');") =>
    compile(`<template>${template}</template>\n<script>\n${script}\n</script>\n`, 'p.pdx', [], undefined, { production: true }).code;

describe(':style="expr" on a plain element (#1240)', () => {
    it('on HTML and on SVG: bindStyleText, never a property binding of style', () => {
        const code = render('<div :style="s"></div><svg><circle :style="s"></circle></svg>');
        expect(code).not.toMatch(/bind(AttributeOrProperty|NativeProperty|Attribute)\(__el\d+, "style"/);
        expect(code.match(/bindStyleText\(__el\d+, /g)).toHaveLength(2);
    });

    // `:style.once` is not here: `:style.x` is the removed form (#129), a CSS property named `once`.
    it('a value written once, a literal, is written to style.cssText too, on HTML and on SVG', () => {
        for (const template of [`<div :style="'color: red'"></div>`, `<svg><circle :style="'fill: red'"></circle></svg>`]) {
            const code = render(template);
            // Core's bindStyleText with its once flag, which writes style.cssText (#1270; core's
            // bound-attribute-write test holds the write to the binding's).
            expect(code, template).toMatch(/bindStyleText\(__el\d+, '(color|fill): red', 1\)/);
            expect(code, template).not.toMatch(/\["style"\] = /);
            expect(code, template).not.toMatch(/bind\w+\(__el\d+, "style"/);
        }
    });

    it('control: the object form still sets each property', () => {
        const code = render('<div :style="{ width: w }"></div>', "let w = $signal('1px');");
        expect(code).not.toMatch(/bindStyleText/);
        expect(code).toMatch(/setProperty|setStyleProp|bindStyle/);
    });
});
