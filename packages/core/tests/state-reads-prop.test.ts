// A `@state` whose expression reads a `@prop` (#980): the prop's alias has to be declared in setup, or
// the mount throws `ReferenceError: <prop> is not defined`. It was declared only for a prop the body,
// the effects, the lifecycle, the watches or a reactive @fetch URL read.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as core from '../src/index';
import { compile } from '../../compiler/src/plugin';

let seq = 0;
const hosts: HTMLElement[] = [];
// happy-dom has no ElementInternals: each host gets a CustomStateSet, a Set of names, as in
// component-states.test.ts.
let attached: Array<{ el: HTMLElement; states: Set<string> }> = [];
beforeEach(() => {
    attached = [];
    Object.defineProperty(HTMLElement.prototype, 'attachInternals', {
        configurable: true, writable: true,
        value(this: HTMLElement) {
            const states = new Set<string>();
            attached.push({ el: this, states });
            return { states };
        },
    });
});
afterEach(() => {
    for (const h of hosts.splice(0)) h.remove();
    delete (HTMLElement.prototype as { attachInternals?: unknown }).attachInternals;
});

/** A component compiled from `template` and `script`, mounted with `attrs`; returns its host and what setup threw. */
async function mounted(template: string, script: string, attrs: Record<string, string> = {}): Promise<{ el: HTMLElement; errors: string[] }> {
    const name = `stateprop${++seq}`;
    const { code } = compile(`<template>${template}</template>\n<script>\n${script}\n</script>\n`, `${name}.pdx`);
    const body = code.replace(/^\s*import\s*\{([^}]*)\}\s*from\s*'@pdxui\/core';?\s*$/gm, 'const {$1} = __core;');
    new Function('__core', body)(core);
    const errors: string[] = [];
    const original = console.error;
    console.error = (...args: unknown[]) => { errors.push(args.map(String).join(' ')); };
    try {
        const el = document.createElement(`app-${name}`);
        for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
        document.body.appendChild(el);
        hosts.push(el);
        await new Promise((r) => setTimeout(r, 0));
        return { el, errors };
    } finally {
        console.error = original;
    }
}
const hasState = (el: HTMLElement, s: string) => attached.find((a) => a.el === el)?.states.has(s) ?? false;

describe('a @state that reads a @prop no other code reads', () => {
    it('mounts, and follows the prop', async () => {
        const { el, errors } = await mounted('<p>x</p>', '@prop error: boolean = false;\n@state invalid = !!error;', { error: '' });
        expect(errors, 'setup threw').toEqual([]);
        expect(hasState(el, 'invalid')).toBe(true);
        el.removeAttribute('error');
        await new Promise((r) => setTimeout(r, 0));
        expect(hasState(el, 'invalid')).toBe(false);
    });
});

describe('the other runes whose code reads a @prop in setup', () => {
    it('a dynamic @title mounts and writes the prop', async () => {
        const { errors } = await mounted('<p>x</p>', "@prop heading: string = 'Start';\n@title heading;", { heading: 'Orders' });
        expect(errors, 'setup threw').toEqual([]);
        expect(document.title).toBe('Orders');
    });

    it('an @expose of a prop mounts and reaches the element', async () => {
        const { el, errors } = await mounted('<p>x</p>', "@prop tone: string = 'calm';\n@expose tone;", { tone: 'loud' });
        expect(errors, 'setup threw').toEqual([]);
        expect(typeof (el as unknown as Record<string, unknown>).tone).not.toBe('undefined');
    });
});
