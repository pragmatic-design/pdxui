// A prop, model or typed snippet becomes a property of the element (#542). One named after a member
// of PdxElement — `body`, its render; `track`, `emit` — replaced it, and the component rendered
// nothing with nothing said. It is PDX_NAME_RESERVED, at the declaration. The list is the class's,
// held in lockstep by `packages/core/tests/reserved-element-names.test.ts`.

import { describe, it, expect } from 'vitest';
import { compile } from '../src/plugin';

const src = (script: string) => `<template><p>x</p></template>\n<script>\n${script}\n</script>\n`;
const reserved = (script: string) => compile(src(script), 'card.pdx').warnings.filter(w => w.code === 'PDX_NAME_RESERVED');

describe('PDX_NAME_RESERVED', () => {
    it('a @prop, a @slot and a @model named after an element member are each an error, at the declaration', () => {
        const [prop] = reserved('let a = $signal(1);\n@prop body: string;');
        expect(prop).toMatchObject({ severity: 'error', line: 4 });
        expect(prop.message).toContain("'body'");
        expect(reserved('@slot body: ();')).toHaveLength(1);
        expect(reserved('@model track: number = 0;')).toHaveLength(1);
        expect(reserved('@prop emit: string;')).toHaveLength(1);
    });

    it("a name that would break the element's DOM — style, className, an on* handler — is an error (#545)", () => {
        const [style] = reserved('let a = $signal(1);\n@prop style: string;');
        expect(style).toMatchObject({ severity: 'error', line: 4 });
        expect(style.message).toContain("'style'");
        for (const decl of ['@model className: string = \'\';', '@slot children: ();', '@prop dataset: object;',
            '@prop classList: object;', '@prop innerHTML: string;', '@prop textContent: string;',
            '@prop shadowRoot: object;', '@prop onclick: object;', '@prop onkeypress: object;', '@prop onfocusin: object;']) {
            expect(reserved(decl), decl).toHaveLength(1);
        }
    });

    it("HTMLElement's members kept on purpose, and names that only start with on, are not (#545)", () => {
        for (const name of ['id', 'prefix', 'offsetTop', 'once', 'online', 'onSelect']) {
            expect(reserved(`@prop ${name}: string;`), name).toEqual([]);
        }
    });

    it('a name the element does not have, or one core keeps on purpose, is not', () => {
        expect(reserved('@prop label: string;')).toEqual([]);
        // The host's global attributes, read into the prop and taken off the host.
        expect(reserved('@prop title: string;')).toEqual([]);
        // A form component's `form` replaces the form-associated getter on purpose.
        expect(reserved('@prop form: object;')).toEqual([]);
    });
});
