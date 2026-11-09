// `@virtual(…, serverRows: n)` (#930): a .pdx compiled for the server writes the first n rows of its
// virtual list, and the spacer after them stands for the rest. The option goes from the template, through
// the compiler, to core's `eachVirtual`.

import { describe, it, expect } from 'vitest';
import * as core from '../src/index';
import { compile } from '../../compiler/src/plugin';
import { renderToString } from '../src/server/render-string';

let seq = 0;

/** A component with `template`, compiled as a server build compiles it, rendered to a string. */
function serverMarkup(template: string, script: string): string {
    const name = `vsrows${++seq}`;
    const src = `<template>${template}</template>\n<script>\n${script}\n</script>\n`;
    const { code } = compile(src, `${name}.pdx`, [], undefined, { production: true, ssr: true });
    const body = code.replace(/^\s*import\s*\{([^}]*)\}\s*from\s*'@pdxui\/core';?\s*$/gm, 'const {$1} = __core;');
    new Function('__core', body)(core);
    const tag = `app-${name}`;
    return renderToString(() => new Function('html', `return html\`<${tag}></${tag}>\``)(core.html));
}

const rows = (markup: string) => markup.match(/data-virtual-index="\d+"/g) ?? [];
const script = "let items = $signal(['a', 'b', 'c', 'd', 'e']);";

describe('@virtual(…, serverRows) on the server', () => {
    it('writes that many rows, and a spacer for the rest by the estimate', () => {
        const m = serverMarkup('<ul>@for (items as it; track it) @virtual(20, serverRows: 2) { <li>{{ it }}</li> }</ul>', script);
        expect(rows(m)).toEqual(['data-virtual-index="0"', 'data-virtual-index="1"']);
        expect(m).toContain('height: 60px;');
    });

    it('serverRows: 0 writes no row, only the spacers', () => {
        const m = serverMarkup('<ul>@for (items as it; track it) @virtual(20, serverRows: 0) { <li>{{ it }}</li> }</ul>', script);
        expect(rows(m)).toEqual([]);
        expect(m).toContain('height: 100px;');
    });

    it('without it, the default: all five of a short list', () => {
        const m = serverMarkup('<ul>@for (items as it; track it) @virtual(20) { <li>{{ it }}</li> }</ul>', script);
        expect(rows(m)).toHaveLength(5);
    });
});
