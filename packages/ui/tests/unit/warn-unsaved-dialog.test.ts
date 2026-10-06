// warnUnsaved asks in the app, on a page that has no <pdx-overlay-outlet> of its own.
//
// The question goes through the dialog queue, which only the outlet draws. A page that never wrote
// the outlet would queue a question nobody sees and hold the navigation forever, so the guard
// mounts one. Measured here with the real outlet: what the user reads, and what each button answers.
import { describe, it, expect, beforeEach } from 'vitest';
import { component, html, createForm, setComponentStrings, clearComponentStrings } from '@pdxui/core';
import type { Form } from '@pdxui/core';
import { cleanup, tick } from './helpers';
import '../../src/overlay/pdx-overlay-outlet';

type Guarded = HTMLElement & { _beforeLeaveCallbacks?: (() => boolean | 'destroy' | Promise<boolean>)[] };

let form: Form<{ name: string }>;
let seq = 0;

function mountDirtyPage(): Guarded {
    const tag = `x-ui-unsaved-${++seq}`;
    component(tag, {
        setup() {
            form = createForm({ initialValues: { name: '' }, warnUnsaved: true });
            return {};
        },
        render: () => html`<div>form</div>`,
    });
    const el = document.createElement(tag) as Guarded;
    document.body.appendChild(el);
    form.fields.name.onChange('Rex');
    return el;
}

const leave = (el: Guarded) => el._beforeLeaveCallbacks![0]() as Promise<boolean>;

describe('warnUnsaved — the dialog the user sees', () => {
    beforeEach(() => { cleanup(); clearComponentStrings(); });

    it('no outlet on the page: one is mounted, and the confirm shows the form strings', async () => {
        const el = mountDirtyPage();
        expect(document.querySelector('pdx-overlay-outlet')).toBeNull();

        const answer = leave(el);
        await tick(50);

        const panel = document.querySelector('[data-dialog-id] .pdx-dialog-panel');
        expect(panel, 'no dialog was drawn').toBeTruthy();
        expect(panel!.querySelector('.pdx-dialog-header')!.textContent).toContain('Unsaved changes');
        expect(panel!.querySelector('.pdx-dialog-body')!.textContent).toContain('You have unsaved changes. Leave anyway?');
        expect(panel!.querySelector('.pdx-alert-cancel')!.textContent).toBe('Stay');
        expect(panel!.querySelector('.pdx-alert-confirm')!.textContent).toBe('Leave');

        (panel!.querySelector('.pdx-alert-cancel') as HTMLElement).click();
        expect(await answer, '"Stay" must keep the page').toBe(false);
    });

    it('"Leave" answers true', async () => {
        const el = mountDirtyPage();
        const answer = leave(el);
        await tick(50);
        (document.querySelector('.pdx-alert-confirm') as HTMLElement).click();
        expect(await answer).toBe(true);
    });

    it('an Italian app reads its own words', async () => {
        setComponentStrings('form', {
            unsavedTitle: 'Modifiche non salvate',
            unsavedMessage: 'Leave without saving?',
            unsavedLeave: 'Esci',
            unsavedStay: 'Resta',
        });
        const el = mountDirtyPage();
        const answer = leave(el);
        await tick(50);
        const panel = document.querySelector('[data-dialog-id] .pdx-dialog-panel')!;
        expect(panel.querySelector('.pdx-dialog-header')!.textContent).toContain('Modifiche non salvate');
        expect(panel.querySelector('.pdx-alert-cancel')!.textContent).toBe('Resta');
        (panel.querySelector('.pdx-alert-cancel') as HTMLElement).click();
        await answer;
    });

    it('an outlet the page already has is used, not doubled', async () => {
        document.body.appendChild(document.createElement('pdx-overlay-outlet'));
        await tick(20);
        const el = mountDirtyPage();
        const answer = leave(el);
        await tick(50);
        expect(document.querySelectorAll('pdx-overlay-outlet').length).toBe(1);
        expect(document.querySelectorAll('[data-dialog-id]').length).toBe(1);
        (document.querySelector('.pdx-alert-cancel') as HTMLElement).click();
        await answer;
    });
});
