// The seven context functions that left @pdxui/core (#495): an import of one in a .pdx is
// PDX_REMOVED_FORM naming the replacement, `inject(token, host, fallback?)` or `@inject`, and
// `pdx migrate` flags it (each is a registry entry written with `removedExport`).

import { describe, it, expect } from 'vitest';
import { compile } from '../src/plugin';
import { LANGUAGE_CHANGES } from '../src/language/changes';

const SEVEN = ['tryInject', 'useProvided', 'tryUseProvided', 'requestContext', 'provideWritable', 'useWritable', 'tryUseWritable'];

const pdx = (script: string) => `<template><p>{{ a }}</p></template>\n<script>\n${script}\nlet a = $signal(1);\n</script>\n`;

describe('the seven context functions that left @pdxui/core', () => {
    it('each is a removed-export entry of the registry, naming inject or @inject', () => {
        for (const name of SEVEN) {
            const entry = LANGUAGE_CHANGES.find((c) => c.id === `export:@pdxui/core:${name}`);
            expect(entry, `no entry for ${name}`).toBeDefined();
            expect(entry!.kind).toBe('removed');
            expect(entry!.fix).toBe('flag');
            expect(entry!.message).toMatch(/inject\(token, host|@inject/);
        }
    });

    it('an import of useProvided from @pdxui/core in a .pdx is PDX_REMOVED_FORM', () => {
        const { warnings } = compile(pdx("import { useProvided } from '@pdxui/core';"), 'card.pdx');
        const [w] = warnings.filter((x) => x.code === 'PDX_REMOVED_FORM');
        expect(w, 'no PDX_REMOVED_FORM').toBeDefined();
        expect(w.message).toContain('useProvided');
        expect(w.line).toBe(3);
    });

    it('control — an import of inject and context is not', () => {
        const { warnings } = compile(pdx("import { inject, context } from '@pdxui/core';"), 'card.pdx');
        expect(warnings.filter((x) => x.code === 'PDX_REMOVED_FORM')).toEqual([]);
    });
});
