// A compiled component's `@variants` axes, declared under the descriptor's `variants` (#986), are
// what core makes of a TypeScript component's: a prop per axis, reflected on the host under its
// kebab attribute (#834), with a value outside the axis reflected as the default.

import { describe, it, expect, afterEach } from 'vitest';
import * as core from '../src/index';
import { compile } from '../../compiler/src/plugin';

let seq = 0;
const hosts: HTMLElement[] = [];
afterEach(() => { for (const h of hosts.splice(0)) h.remove(); });

/** A component compiled from `script`, mounted; returns its host. */
async function mounted(script: string, props: Record<string, unknown> = {}): Promise<HTMLElement & Record<string, unknown>> {
    const name = `variants${++seq}`;
    const { code } = compile(`<template><p>x</p></template>\n<script>\n${script}\n</script>\n`, `${name}.pdx`);
    const body = code.replace(/^\s*import\s*\{([^}]*)\}\s*from\s*'@pdxui\/core';?\s*$/gm, 'const {$1} = __core;');
    new Function('__core', body)(core);
    const el = document.createElement(`app-${name}`) as HTMLElement & Record<string, unknown>;
    Object.assign(el, props);
    document.body.appendChild(el);
    hosts.push(el);
    await new Promise((r) => setTimeout(r, 0));
    return el;
}
const tick = () => new Promise((r) => setTimeout(r, 0));

describe('a compiled @variants axis', () => {
    it('reflects its default, then the value it is given', async () => {
        const el = await mounted('@variants { tone: { calm, loud } = loud; }');
        expect(el.getAttribute('tone')).toBe('loud');
        el.tone = 'calm';
        await tick();
        expect(el.getAttribute('tone')).toBe('calm');
    });

    it('an axis of two words is reflected under its kebab attribute', async () => {
        const el = await mounted('@variants { connectorStyle: { solid, dashed } = solid; }', { connectorStyle: 'dashed' });
        expect(el.getAttribute('connector-style')).toBe('dashed');
    });

    it('a value outside the axis reflects the default, as a TypeScript component\'s does', async () => {
        const el = await mounted("@variants { size: { md: '.m', sm: '.s' } = md; }", { size: 'huge' });
        expect(el.getAttribute('size')).toBe('md');
    });
});
