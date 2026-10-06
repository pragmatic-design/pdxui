// Two compiler diagnostics that must not fire falsely, reproduced here.
//
// 1. "Reactive variable 'x' is declared but not used in the template" for a signal the template
//    DOES read — in a hyphenated binding (`:active-key="x()"`: the attribute regex must accept `-`) or
//    inside `@try { … } @catch { … }` (the template walker must visit it). Not cosmetic: the
//    warning's own advice is to rename the signal `_x`, which an agent does, and which makes a
//    working signal read as dead to the next person.
// 2. "<pdx-router-outlet> … will not be registered" in an app that INSTALLED the packages. A scan
//    for tags that need no import that walks up to a `packages/` folder, which exists in the
//    monorepo and nowhere else, finds nothing in node_modules/@pdxui — and the outlet the router
//    defines is reported missing while it renders.
//
// Each has its control: a signal that really is unused still warns, and a tag defined nowhere is
// still unknown. Without the controls, "never warn" would pass.
import { describe, it, expect, afterAll } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { compile } from '../src/plugin';
import { scanNoImportTags } from '../src/no-import-tags';

const unused = (src: string) => compile(src, 'probe.pdx').warnings
    .filter((w) => w.code === 'PDX_UNUSED_REACTIVE').map((w) => w.message);

describe('PDX_UNUSED_REACTIVE sees every read in the template', () => {
    it('a signal read only in a hyphenated binding is used', () => {
        const warnings = unused(`<template><nav :active-key="section()"></nav></template>
<script setup>
const section = $signal('home');
</script>`);
        expect(warnings, 'the read in :active-key was not seen').toEqual([]);
    });

    it('a signal read only inside @try … @catch is used', () => {
        const warnings = unused(`<template>
@try { <p>{{ label }}</p> } @catch (err) { <p>{{ fallback }}</p> }
</template>
<script setup>
let label = $signal('ok');
let fallback = $signal('failed');
</script>`);
        expect(warnings, 'the reads inside @try / @catch were not seen').toEqual([]);
    });

    it('control — a signal nothing reads still warns', () => {
        const warnings = unused(`<template><nav :active-key="section()"></nav></template>
<script setup>
const section = $signal('home');
let forgotten = $signal(0);
</script>`);
        expect(warnings).toEqual(["Reactive variable 'forgotten' is declared but not used in the template."]);
    });
});

describe('tags another @pdxui package defines, in an INSTALLED app', () => {
    // node_modules/@pdxui/{compiler,router} as npm lays them out: published packages ship src/.
    const root = mkdtempSync(join(tmpdir(), 'pdx-147-'));
    const scope = join(root, 'node_modules', '@pdxui');
    mkdirSync(join(scope, 'compiler', 'dist'), { recursive: true });
    mkdirSync(join(scope, 'router', 'src'), { recursive: true });
    writeFileSync(join(scope, 'router', 'src', 'outlet.ts'),
        "class PdxRouterOutlet extends HTMLElement {}\ncustomElements.define('pdx-router-outlet', PdxRouterOutlet);\n");
    afterAll(() => rmSync(root, { recursive: true, force: true }));

    it('finds pdx-router-outlet from the compiler\'s own location', () => {
        const tags = scanNoImportTags(join(scope, 'compiler', 'dist'));
        expect(tags.has('pdx-router-outlet'), 'the outlet @pdxui/router defines was not found').toBe(true);
    });

    it('control — a tag defined nowhere is still not found', () => {
        expect(scanNoImportTags(join(scope, 'compiler', 'dist')).has('pdx-not-a-real-component')).toBe(false);
    });
});
