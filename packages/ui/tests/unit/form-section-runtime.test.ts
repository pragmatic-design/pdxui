// The recipe's probe, compiled and mounted: a section in its own .pdx is part of the form.
//
// recipes.md («A long form filled in more than one sitting») measures it with a probe: a form with
// two named controls, one written beside `<pdx-form>` and one inside a child component, typed into
// both. A child that calls `useForm()`/`tryUseForm()` declares itself a section of the form above
// it, and the compiler wires its template (packages/compiler/tests/form-binding-injected.test.ts);
// otherwise the child's control is never wired, and the form holds `{ here: 'A', deep: '' }`. This is
// that probe: both .pdx files compiled with the real compiler, run against the real @pdxui/core,
// mounted in happy-dom — which connects the child BEFORE its <pdx-form>, the case the lookup has to
// survive.
import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import * as core from '@pdxui/core';
import { compile } from '../../../compiler/src/plugin';
import { tick, cleanup } from './helpers';
import '../../src/form/pdx-form';
import '../../src/input/pdx-input';

/** Compile a .pdx and run the module: the core import becomes the injected namespace. */
function load(filename: string, source: string): void {
    const { code } = compile(source, filename, [], undefined, {});
    const body = code.replace(/import\s*\{([^}]*)\}\s*from\s*'@pdxui\/core';?/, 'const {$1} = __core;');
    expect(body, `${filename} imports something besides @pdxui/core`).not.toMatch(/^import /m);
    new Function('__core', body)(core);
}

const SECTION = `<template>
<pdx-input class="deep" name="deep"></pdx-input>
</template>
<script setup>
import { tryUseForm } from '@pdxui/core';
const form = tryUseForm();
</script>`;

const PROBE = `<template>
<pdx-form :form="f">
  <pdx-input class="here" name="here"></pdx-input>
  <pdx-probe-section></pdx-probe-section>
</pdx-form>
</template>
<script setup>
import { createForm } from '@pdxui/core';
const f = createForm({ initialValues: { here: '', deep: '' } });
window.__probeForm = f;
</script>`;

beforeAll(() => {
    load('probe-section.pdx', SECTION);
    load('probe-owner.pdx', PROBE);
});
afterEach(() => { cleanup(); delete (window as unknown as { __probeForm?: unknown }).__probeForm; });

/** Type into a pdx-input as it reports it: its own `pdx-input` event. */
function type(el: Element, value: string): void {
    el.dispatchEvent(new CustomEvent('pdx-input', { detail: { value }, bubbles: true }));
}

describe('a form section in its own component, compiled and mounted', () => {
    it('the recipe\'s probe: typed into both, the form holds both — { here: "A", deep: "A" }', async () => {
        document.body.appendChild(document.createElement('pdx-probe-owner'));
        await tick(50);
        const form = (window as unknown as { __probeForm: { getValues(): Record<string, unknown> } }).__probeForm;

        type(document.querySelector('pdx-input.here')!, 'A');
        type(document.querySelector('pdx-input.deep')!, 'A');
        await tick();

        expect(form.getValues()).toEqual({ here: 'A', deep: 'A' });
    });

    it('control — the section rendered outside any form mounts, and a keystroke throws nothing', async () => {
        const errors: unknown[] = [];
        const off = core.onGlobalError((err) => { errors.push(err); return true; });
        document.body.appendChild(document.createElement('pdx-probe-section'));
        await tick(50);
        expect(() => type(document.querySelector('pdx-input.deep')!, 'A')).not.toThrow();
        await tick();
        off();
        expect(errors, 'the section threw without a form above it').toEqual([]);
    });
});
