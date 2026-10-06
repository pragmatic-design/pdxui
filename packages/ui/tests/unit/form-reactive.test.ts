// pdx-form must read its `form` prop reactively. Schema-driven parents swap the Form instance
// when the schema changes; capturing it once would leave submit/context bound to the old
// (possibly disposed) form.

import { describe, it, expect, beforeEach } from 'vitest';
import { cleanup, tick } from './helpers';
import { createForm } from '@pdxui/core';
import '../../src/form/pdx-form';

describe('pdx-form tracks the form prop', () => {
    beforeEach(cleanup);

    it('submits the CURRENT form after the form prop is swapped', async () => {
        const formA = createForm<{ name: string }>({ initialValues: { name: 'alice' } });
        const formB = createForm<{ name: string }>({ initialValues: { name: 'bob' } });

        const el = document.createElement('pdx-form');
        document.body.appendChild(el);
        await tick(50); // let the CE upgrade define the `form` prop accessor (shadows base getter)
        (el as any).form = formA;
        await tick(50);

        let submitted: Record<string, unknown> | undefined;
        el.addEventListener('pdx-submit', ((e: CustomEvent) => { submitted = e.detail?.values; }) as EventListener);

        const formEl = el.querySelector('form') as HTMLFormElement;
        formEl.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
        await tick(50);
        expect(submitted).toEqual({ name: 'alice' });

        // Swap the form — the inner submit must now use formB.
        (el as any).form = formB;
        await tick(50);
        submitted = undefined;
        formEl.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
        await tick(50);

        expect(submitted).toEqual({ name: 'bob' });
    });
});
