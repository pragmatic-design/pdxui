// pdx-form's setValues/reset reach a component's HOST, not its inner input.
//
// A control shows its field through its model binding, `::checked="f.agree"` (#128), written on the
// host's setter like any parent binding: the host is the component's state, and the only thing a
// native form submits for it. `pdx-form` used to push the values into the controls itself, found by
// `name` (`syncDomValues`), which #613 removed with the name wiring: these hold that the binding
// alone carries what the push carried. The page is compiled with the real compiler, run against the
// real @pdxui/core, mounted in happy-dom.
import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import * as core from '@pdxui/core';
import type { Form } from '@pdxui/core';
import { compile } from '../../../compiler/src/plugin';
import '../../src/form/pdx-form';
import '../../src/checkbox/pdx-checkbox';
import '../../src/radio/pdx-radio';
import '../../src/radio-group/pdx-radio-group';
import '../../src/input/pdx-input';
import { cleanup, tick } from './helpers';

const PAGE = `<template>
<pdx-form :form="f">
  <pdx-checkbox name="agree" ::checked="f.agree" label="Agree"></pdx-checkbox>
  <pdx-radio-group name="plan" ::value="f.plan">
    <pdx-radio value="p" label="P"></pdx-radio>
    <pdx-radio value="q" label="Q"></pdx-radio>
  </pdx-radio-group>
  <pdx-input name="city" ::value="f.city"></pdx-input>
</pdx-form>
</template>
<script>
import { createForm } from '@pdxui/core';
const f = createForm({ initialValues: { agree: false, plan: 'p', city: 'Rome' } });
window.__syncHostForm = f;
</script>`;

type Values = { agree: boolean; plan: string; city: string };
type Host = HTMLElement & { checked: boolean; value: string };

beforeAll(() => {
    const { code, warnings } = compile(PAGE, 'sync-host-page.pdx');
    expect(warnings.filter((w) => w.severity === 'error')).toEqual([]);
    const body = code.replace(/import\s*\{([^}]*)\}\s*from\s*'@pdxui\/core';?/, 'const {$1} = __core;');
    expect(body, 'the page imports something besides @pdxui/core').not.toMatch(/^import /m);
    new Function('__core', body)(core);
});
afterEach(() => { cleanup(); delete (window as unknown as { __syncHostForm?: unknown }).__syncHostForm; });

async function mountForm(): Promise<{ f: Form<Values>; root: HTMLElement }> {
    const root = document.createElement('app-sync-host-page');
    document.body.appendChild(root);
    await tick(50);
    return { f: (window as unknown as { __syncHostForm: Form<Values> }).__syncHostForm, root };
}

const q = <T extends HTMLElement = Host>(root: HTMLElement, sel: string) => root.querySelector(sel) as T;
const innerValues = (root: HTMLElement) => Array.from(root.querySelectorAll('pdx-radio input')).map((i) => (i as HTMLInputElement).value);

describe('pdx-form\'s values reach the component through its binding, not into it', () => {
    it('setValues checks the pdx-checkbox HOST', async () => {
        const { f, root } = await mountForm();
        f.setValues({ agree: true });
        await tick(); await tick();
        expect(q(root, 'pdx-checkbox').checked).toBe(true);
    });

    it('setValues moves the pdx-radio-group, and no radio has its value rewritten', async () => {
        const { f, root } = await mountForm();
        f.setValues({ plan: 'q' });
        await tick(); await tick();
        expect(q(root, 'pdx-radio-group').value).toBe('q');
        expect(q(root, 'pdx-radio[value="q"]').checked).toBe(true);
        expect(q(root, 'pdx-radio[value="p"]').checked).toBe(false);
        expect(innerValues(root), 'each radio keeps its own value').toEqual(['p', 'q']);
    });

    it('reset brings the hosts back to the initial values', async () => {
        const { f, root } = await mountForm();
        f.setValues({ agree: true, plan: 'q', city: 'Paris' });
        await tick(); await tick();
        f.reset();
        await tick(); await tick();
        expect(q(root, 'pdx-checkbox').checked).toBe(false);
        expect(q(root, 'pdx-radio-group').value).toBe('p');
        expect(q(root, 'pdx-input').value).toBe('Rome');
        expect(innerValues(root)).toEqual(['p', 'q']);
    });

    it('a text pdx-input follows too — the host value and the text on screen', async () => {
        const { f, root } = await mountForm();
        f.setValues({ city: 'Paris' });
        await tick(); await tick();
        expect(q(root, 'pdx-input').value).toBe('Paris');
        expect(q<HTMLInputElement>(root, 'pdx-input input').value).toBe('Paris');
    });
});
