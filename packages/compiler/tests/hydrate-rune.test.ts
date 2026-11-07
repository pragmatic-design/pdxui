// `@hydrate trigger;` in a script (#160, part 4d): the component's descriptor carries the triggers a
// generated host waits for. A trigger the runtime does not know, and `when (…)` — which would read a
// script that runs only once the host is taken over — stop the compile.

import { describe, it, expect } from 'vitest';
import { compile } from '../src/plugin';

const pdx = (script: string) => `<template><p>x</p></template>\n<script>\n${script}\n</script>\n`;

describe('@hydrate in a script', () => {
    it('puts its triggers in the descriptor', () => {
        const { code } = compile(pdx('@hydrate viewport | idle(2000);'), 'card.pdx');
        expect(code).toContain("hydrate: { trigger: 'viewport | idle(2000)' }");
    });

    it('a component without it carries nothing', () => {
        expect(compile(pdx(''), 'card.pdx').code).not.toContain('hydrate:');
    });

    it('a trigger that is not one is an error', () => {
        const { warnings, code } = compile(pdx('@hydrate visible;'), 'card.pdx');
        const w = warnings.find((x) => x.code === 'PDX_HYDRATE_UNKNOWN_TRIGGER');
        expect(w?.severity).toBe('error');
        expect(w?.message).toContain("'visible'");
        expect(code).not.toContain('hydrate:');
    });

    it('when (…) is an error in a script: it would read the script before it runs', () => {
        const { warnings } = compile(pdx('let ready = $signal(false);\n@hydrate when (ready);'), 'card.pdx');
        expect(warnings.find((x) => x.code === 'PDX_HYDRATE_UNKNOWN_TRIGGER')?.message).toContain("'when (ready)'");
    });
});
