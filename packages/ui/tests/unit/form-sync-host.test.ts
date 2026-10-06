// pdx-form's setValues/reset reach a component's HOST, not its inner input.
//
// The first native input/textarea inside a pdx component is the component's private DOM. Writing the
// model value there, `setValues({ agree: true, plan: 'q' })` leaves the pdx-checkbox host
// `checked=false` (only its inner box ticked), the pdx-radio-group on `p`, and the first radio's inner
// input with `value="q"` — a radio is not `type === 'checkbox'`, so it takes the text branch. The host
// is the component's state, and the only thing a native form submits for it.

import { describe, it, expect, beforeEach } from 'vitest';
import { createForm } from '@pdxui/core';
import type { Form } from '@pdxui/core';
import '../../src/form/pdx-form';
import '../../src/checkbox/pdx-checkbox';
import '../../src/radio/pdx-radio';
import '../../src/radio-group/pdx-radio-group';
import '../../src/input/pdx-input';
import { cleanup, tick } from './helpers';

type Values = { agree: boolean; plan: string; city: string };
type Host = HTMLElement & { checked: boolean; value: string };

async function mountForm(): Promise<{ f: Form<Values>; root: HTMLElement }> {
    const f = createForm<Values>({ initialValues: { agree: false, plan: 'p', city: 'Rome' } });
    const root = document.createElement('pdx-form') as HTMLElement & { form: unknown };
    root.form = f;
    root.innerHTML = `
        <pdx-checkbox name="agree" label="Agree"></pdx-checkbox>
        <pdx-radio-group name="plan" value="p">
            <pdx-radio value="p" label="P"></pdx-radio>
            <pdx-radio value="q" label="Q"></pdx-radio>
        </pdx-radio-group>
        <pdx-input name="city"></pdx-input>`;
    document.body.appendChild(root);
    await tick(); await tick();
    return { f, root };
}

const q = <T extends HTMLElement = Host>(root: HTMLElement, sel: string) => root.querySelector(sel) as T;
const innerValues = (root: HTMLElement) => Array.from(root.querySelectorAll('pdx-radio input')).map((i) => (i as HTMLInputElement).value);

describe('pdx-form writes model values to the component, not into it', () => {
    beforeEach(cleanup);

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
        f.setValues({ agree: true, plan: 'q' });
        await tick(); await tick();
        f.reset();
        await tick(); await tick();
        expect(q(root, 'pdx-checkbox').checked).toBe(false);
        expect(q(root, 'pdx-radio-group').value).toBe('p');
        expect(innerValues(root)).toEqual(['p', 'q']);
    });

    it('a text pdx-input follows too — the host value and the text on screen', async () => {
        const { f, root } = await mountForm();
        f.setValues({ city: 'Paris' });
        await tick(); await tick();
        expect(q(root, 'pdx-input').value).toBe('Paris');
        expect(q<HTMLInputElement>(root, 'pdx-input input').value).toBe('Paris');
    });

    it('a pdx-input found through its inner input — in a pdx-form-field, no name of its own — is set on its host', async () => {
        const f = createForm<{ zip: string }>({ initialValues: { zip: '' } });
        const root = document.createElement('pdx-form') as HTMLElement & { form: unknown };
        root.form = f;
        root.innerHTML = `<pdx-form-field name="zip" label="ZIP"><pdx-input></pdx-input></pdx-form-field>`;
        document.body.appendChild(root);
        await tick(); await tick();
        f.setValues({ zip: '10100' });
        await tick(); await tick();
        expect(q(root, 'pdx-input').value, 'the host, which is the component\'s state').toBe('10100');
        expect(q<HTMLInputElement>(root, 'pdx-input input').value).toBe('10100');
    });

    it('a control the user is in is not overwritten', async () => {
        const { f, root } = await mountForm();
        q<HTMLInputElement>(root, 'pdx-input input').focus();
        f.setValues({ city: 'Paris' });
        await tick(); await tick();
        expect(q<HTMLInputElement>(root, 'pdx-input input').value).toBe('Rome');
    });
});
