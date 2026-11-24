// A URL binding and a component's prop binding compile to one call to core (#1346): `bindUrl` and
// `bindComponentProp`. Written out, each was its own effect with its last-value guard, the sanitiser
// and the removal: 116 B gzip for one `:href` in pdx-page-header. The calls write what that code
// wrote (core's `bound-url.test.ts`).

import { describe, it, expect } from 'vitest';
import { compile } from '../src/plugin';

function render(template: string, script = "let rows = $signal([{ href: '/a' }]);\nlet link = $signal('/x');\nlet label = $signal('t');"): string {
    const src = `<template>${template}</template>\n<script>\n${script}\n</script>\n`;
    const { code } = compile(src, 'url-call.pdx', [], undefined, { production: true });
    return code.slice(code.indexOf('render:'));
}

describe('a URL binding is one call to bindUrl', () => {
    it(':href at the top level: the call, with no inline sanitizeBoundUrl', () => {
        const out = render('<a :href="link">x</a>');
        expect(out).toMatch(/bindUrl\(__el\d+, "href", "href", \(\)=>ctx.link\(\)\)/);
        expect(out).not.toContain('sanitizeBoundUrl');
    });

    it(':href inside an @for row: the same call', () => {
        const out = render('@for (rows as r, i; track i) {<a :href="r.href">x</a>}');
        expect(out).toMatch(/bindUrl\(__el\d+, "href", "href", \(\)=>r\(\)\.href\)/);
        expect(out).not.toContain('sanitizeBoundUrl');
    });

    it(':xlink:href, an attribute only, names no property', () => {
        const out = render('<svg><use :xlink:href="link"></use></svg>');
        expect(out).toMatch(/bindUrl\(__el\d+, "xlink:href", null, \(\)=>ctx.link\(\)\)/);
    });

    it('a constant URL is the call with its once flag', () => {
        const out = render('<img :src="\'/logo.png\'">');
        expect(out).toMatch(/bindUrl\(__el\d+, "src", "src", '\/logo\.png', 1\)/);
    });
});

describe('a component prop binding is one call to bindComponentProp', () => {
    it('<pdx-x :title> is the call, with no inline assignBoundProperty effect', () => {
        const out = render('<pdx-x :title="label"></pdx-x>');
        expect(out).toMatch(/bindComponentProp\(__el\d+, "title", \(\)=>ctx.label\(\)\)/);
        expect(out).not.toMatch(/effect\(\(\) => \{[^}]*assignBoundProperty/);
    });

    it("a component's URL prop is bindUrl's", () => {
        const out = render('<pdx-x :href="link"></pdx-x>');
        expect(out).toMatch(/bindUrl\(__el\d+, "href", "href", \(\)=>ctx.link\(\)\)/);
    });
});
