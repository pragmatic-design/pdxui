// The untyped messaging APIs that left @pdxui/core (#144): `createBus`, `createChannel`,
// `createCommands`, and `createCompoundParent`, which no library component needs. An import of one in
// a .pdx is PDX_REMOVED_FORM naming the mechanism for that direction, and `pdx migrate` flags it.

import { describe, it, expect } from 'vitest';
import { compile } from '../src/plugin';
import { LANGUAGE_CHANGES } from '../src/language/changes';

const GONE = ['createBus', 'createChannel', 'createCommands', 'createCompoundParent'];

const pdx = (script: string) => `<template><p>{{ a }}</p></template>\n<script>\n${script}\nlet a = $signal(1);\n</script>\n`;

describe('the messaging APIs that left @pdxui/core', () => {
    it('each is a removed-export entry of the registry, flagged, naming its replacement', () => {
        for (const name of GONE) {
            const entry = LANGUAGE_CHANGES.find((c) => c.id === `export:@pdxui/core:${name}`);
            expect(entry, `no entry for ${name}`).toBeDefined();
            expect(entry!.kind).toBe('removed');
            expect(entry!.fix).toBe('flag');
            expect(entry!.issue).toBe(144);
            expect(entry!.message).toMatch(/@store|@event|@expose|@provide|@inject|@prop/);
        }
    });

    it('an import of createBus from @pdxui/core in a .pdx is PDX_REMOVED_FORM on its line', () => {
        const { warnings } = compile(pdx("import { createBus } from '@pdxui/core';"), 'card.pdx');
        const [w] = warnings.filter((x) => x.code === 'PDX_REMOVED_FORM');
        expect(w, 'no PDX_REMOVED_FORM').toBeDefined();
        expect(w.message).toContain('createBus');
        expect(w.line).toBe(3);
    });

    it('control — an import of discoverChildren, which stays, is not', () => {
        const { warnings } = compile(pdx("import { discoverChildren } from '@pdxui/core';"), 'card.pdx');
        expect(warnings.filter((x) => x.code === 'PDX_REMOVED_FORM')).toEqual([]);
    });
});
