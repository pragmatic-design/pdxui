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
//    defines is reported missing while it renders. Since #991 the resolver walks nothing: it reads
//    the list generated from the packages, which ships inside the compiler, wherever it is installed.
//
// Each has its control: a signal that really is unused still warns, and a tag defined nowhere is
// still unknown. Without the controls, "never warn" would pass.
import { describe, it, expect } from 'vitest';
import { compile } from '../src/plugin';
import { ComponentResolver } from '../src/component-resolver';

const unused = (src: string) => compile(src, 'probe.pdx').warnings
    .filter((w) => w.code === 'PDX_UNUSED_REACTIVE').map((w) => w.message);

describe('PDX_UNUSED_REACTIVE sees every read in the template', () => {
    it('a signal read only in a hyphenated binding is used', () => {
        const warnings = unused(`<template><nav :active-key="section()"></nav></template>
<script>
const section = $signal('home');
</script>`);
        expect(warnings, 'the read in :active-key was not seen').toEqual([]);
    });

    it('a signal read only inside @try … @catch is used', () => {
        const warnings = unused(`<template>
@try { <p>{{ label }}</p> } @catch (err) { <p>{{ fallback }}</p> }
</template>
<script>
let label = $signal('ok');
let fallback = $signal('failed');
</script>`);
        expect(warnings, 'the reads inside @try / @catch were not seen').toEqual([]);
    });

    it('control — a signal nothing reads still warns', () => {
        const warnings = unused(`<template><nav :active-key="section()"></nav></template>
<script>
const section = $signal('home');
let forgotten = $signal(0);
</script>`);
        expect(warnings).toEqual(["Reactive variable 'forgotten' is declared but not used in the template."]);
    });
});

describe('tags another @pdxui package defines, in an INSTALLED app', () => {
    // The resolver's answer is the generated list, not a walk of whatever is on disk around it: the
    // same in node_modules/@pdxui as in the monorepo (resolver-no-import-scan.test.ts holds that it
    // walks nothing).
    it('knows pdx-router-outlet, which @pdxui/router defines', () => {
        expect(new ComponentResolver().knownWithoutImport('pdx-router-outlet'), 'the outlet @pdxui/router defines was not found').toBe(true);
    });

    it('control — a tag defined nowhere is still not known', () => {
        expect(new ComponentResolver().knownWithoutImport('pdx-not-a-real-component')).toBe(false);
    });
});
