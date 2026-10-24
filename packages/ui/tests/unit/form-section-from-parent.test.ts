// A form section names the form it inherits: `@form f: Schema from parent;` (#613).
//
// A section is a component projected into `<pdx-form>`, and its controls bind to that form's fields
// explicitly, `::value="f.deep"`, as a control beside `<pdx-form>` does (#128). The form is not there
// when the section sets up: happy-dom connects a child before its parent, and in Chromium a projected
// child mounts detached. So `f` resolves lazily — each `f.x` is a field that reads the inherited form
// when it is found, and the binding made at mount follows it from then on. Both .pdx files compiled
// with the real compiler, run against the real @pdxui/core, mounted in happy-dom.
import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import * as core from '@pdxui/core';
import { join } from 'node:path';
import { compile } from '../../../compiler/src/plugin';
import { ComponentResolver } from '../../../compiler/src/component-resolver';
import { tick, cleanup } from './helpers';
import '../../src/form/pdx-form';
import '../../src/input/pdx-input';

const resolver = new ComponentResolver();
resolver.registerUiManifest(join(__dirname, '../../../showcase'));

function compiled(filename: string, source: string): string {
    const { code, warnings } = compile(source, filename, [], undefined, { modelEventOf: (t) => resolver.modelEventOf(t) });
    expect(warnings.filter((w) => w.severity === 'error'), `${filename}: errors`).toEqual([]);
    return code;
}

function load(filename: string, source: string): void {
    const body = compiled(filename, source).replace(/import\s*\{([^}]*)\}\s*from\s*'@pdxui\/core';?/, 'const {$1} = __core;');
    expect(body, `${filename} imports something besides @pdxui/core`).not.toMatch(/^import /m);
    new Function('__core', body)(core);
}

const SECTION = `<template>
<pdx-input class="deep" ::value="f.deep"></pdx-input>
<span class="err">{{ f.deep.error() ?? '' }}</span>
</template>
<script>
@form f: ProbeSchema from parent;
</script>`;

const OWNER = `<template>
<pdx-form :form="f">
  <app-from-parent-section></app-from-parent-section>
</pdx-form>
</template>
<script>
import { createForm, required } from '@pdxui/core';
const f = createForm({ initialValues: { deep: 'start' }, validators: { deep: [required('Say something')] } });
window.__fromParentForm = f;
</script>`;

type ProbeForm = core.Form<{ deep: string }>;
const form = () => (window as unknown as { __fromParentForm: ProbeForm }).__fromParentForm;
const deep = () => document.querySelector('pdx-input.deep') as HTMLElement & { value: string };
const field = () => deep().querySelector('input') as HTMLInputElement;

function type(value: string): void {
    field().value = value;
    field().dispatchEvent(new Event('input', { bubbles: true }));
}

beforeAll(() => {
    load('from-parent-section.pdx', SECTION);
    load('from-parent-owner.pdx', OWNER);
});
afterEach(() => { cleanup(); delete (window as unknown as { __fromParentForm?: unknown }).__fromParentForm; });

async function mount(): Promise<void> {
    document.body.appendChild(document.createElement('app-from-parent-owner'));
    await tick(50);
}

describe('@form f: Schema from parent (#613)', () => {
    it('compiles to the inherited form, not a new one', () => {
        const code = compiled('from-parent-probe.pdx', SECTION);
        expect(code).toMatch(/inheritedForm\(ctx\.el\)/);
        expect(code).not.toMatch(/createForm\(/);
    });

    it('the control shows the inherited form\'s value, though the section set up before its form', async () => {
        await mount();
        expect(deep().value).toBe('start');
    });

    it('typing writes the inherited form\'s field', async () => {
        await mount();
        type('typed');
        await tick();
        expect(form().getValues()).toEqual({ deep: 'typed' });
    });

    it('a value the form sets reaches the control, and the form\'s reset puts it back', async () => {
        await mount();
        form().deep.onChange('from the form');
        await tick();
        expect(deep().value).toBe('from the form');
        form().reset();
        await tick();
        expect(deep().value).toBe('start');
    });

    it('leaving the control touches the field: its error shows in the section', async () => {
        await mount();
        type('');
        deep().dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
        await tick();
        expect(form().deep.touched()).toBe(true);
        expect(document.querySelector('.err')!.textContent).toBe('Say something');
    });

    it('control — the section rendered outside any form mounts, and a keystroke throws nothing', async () => {
        const errors: unknown[] = [];
        const off = core.onGlobalError((err) => { errors.push(err); return true; });
        document.body.appendChild(document.createElement('app-from-parent-section'));
        await tick(50);
        expect(() => type('A')).not.toThrow();
        await tick();
        off();
        expect(errors, 'the section threw without a form above it').toEqual([]);
    });
});
