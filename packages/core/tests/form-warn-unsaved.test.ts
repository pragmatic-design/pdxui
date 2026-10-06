// createForm({ warnUnsaved: true }) — leaving with unsaved work asks, in the app, in the app's words.
//
// Not a `confirm('You have unsaved changes. Leave anyway?')`: that is the browser's modal, an
// English sentence nobody can translate, and a dialog that blocks every automated browser. The
// option lives in the form, so a form built with createForm in script has it too and no screen
// writes the guard by hand; the question goes through the dialog queue that <pdx-overlay-outlet> draws.
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { component } from '../src/component/component';
import { html } from '../src/renderer/template';
import { createForm } from '../src/form/form';
import type { Form } from '../src/form/form';
import { getDialogQueue } from '../src/component/dialog-queue';
import { setComponentStrings, clearComponentStrings } from '../src/i18n/component-strings';

type Guarded = HTMLElement & { _beforeLeaveCallbacks?: (() => boolean | 'destroy' | Promise<boolean>)[] };

let form: Form<{ name: string }>;
let seq = 0;

/** A component whose setup builds the form, the way a page with a create/edit form does. */
function mountFormPage(warnUnsaved: boolean): Guarded {
    const tag = `x-unsaved-${++seq}`;
    component(tag, {
        setup() {
            form = createForm({ initialValues: { name: '' }, warnUnsaved });
            return {};
        },
        render: () => html`<div>form</div>`,
    });
    const el = document.createElement(tag) as Guarded;
    document.body.appendChild(el);
    return el;
}

/** What the router does before leaving the page: ask every guard it registered. */
function askToLeave(el: Guarded): boolean | 'destroy' | Promise<boolean> {
    const guards = el._beforeLeaveCallbacks ?? [];
    expect(guards.length, 'the form registered no leave guard').toBe(1);
    return guards[0]();
}

/** A stand-in for <pdx-overlay-outlet>: the helper mounts one when the page has none. */
beforeEach(() => {
    if (!customElements.get('pdx-overlay-outlet')) {
        customElements.define('pdx-overlay-outlet', class extends HTMLElement {});
    }
});

afterEach(() => {
    getDialogQueue().closeAll();
    clearComponentStrings();
    document.body.innerHTML = '';
});

describe('createForm({ warnUnsaved: true })', () => {
    it('dirty: leaving opens the in-app confirm with the registered strings', async () => {
        const el = mountFormPage(true);
        form.fields.name.onChange('Rex');

        const answer = askToLeave(el);
        expect(answer).toBeInstanceOf(Promise);
        const items = getDialogQueue().items();
        expect(items.length, 'no dialog was queued').toBe(1);
        expect(items[0]).toMatchObject({
            type: 'confirm',
            title: 'Unsaved changes',
            message: 'You have unsaved changes. Leave anyway?',
            confirmLabel: 'Leave',
            cancelLabel: 'Stay',
        });
        getDialogQueue().close(items[0].id, false);
        expect(await answer, '"Stay" must keep the page').toBe(false);
    });

    it('"Leave" lets the navigation through', async () => {
        const el = mountFormPage(true);
        form.fields.name.onChange('Rex');
        const answer = askToLeave(el);
        getDialogQueue().close(getDialogQueue().items()[0].id, true);
        expect(await answer).toBe(true);
    });

    it('Escape (the dialog dismissed with no answer) keeps the page', async () => {
        const el = mountFormPage(true);
        form.fields.name.onChange('Rex');
        const answer = askToLeave(el);
        getDialogQueue().closeAll();
        expect(await answer).toBe(false);
    });

    it('the page has no outlet: the helper mounts one', async () => {
        const el = mountFormPage(true);
        form.fields.name.onChange('Rex');
        expect(document.querySelector('pdx-overlay-outlet')).toBeNull();
        const answer = askToLeave(el);
        expect(document.querySelectorAll('pdx-overlay-outlet').length).toBe(1);
        getDialogQueue().closeAll();
        await answer;
    });

    it('an app override of form.unsavedTitle is what the dialog shows', async () => {
        setComponentStrings('form', { unsavedTitle: 'Modifiche non salvate', unsavedStay: 'Resta' });
        const el = mountFormPage(true);
        form.fields.name.onChange('Rex');
        const answer = askToLeave(el);
        expect(getDialogQueue().items()[0]).toMatchObject({ title: 'Modifiche non salvate', cancelLabel: 'Resta' });
        getDialogQueue().closeAll();
        await answer;
    });

    it('control — clean: leaving does not ask', () => {
        const el = mountFormPage(true);
        expect(askToLeave(el)).toBe(true);
        expect(getDialogQueue().items().length).toBe(0);
    });

    it('control — reset to the typed values makes it clean again', () => {
        const el = mountFormPage(true);
        form.fields.name.onChange('Rex');
        form.reset({ name: 'Rex' });
        expect(askToLeave(el)).toBe(true);
    });

    it('after a successful submit, leaving does not ask', async () => {
        const el = mountFormPage(true);
        form.fields.name.onChange('Rex');
        await form.handleSubmit(async () => { /* saved */ })(new Event('submit'));
        expect(form.state()).toBe('success');
        expect(askToLeave(el), 'the form asked about work it had just saved').toBe(true);
    });

    it('control — a submit whose save fails still asks', async () => {
        const el = mountFormPage(true);
        form.fields.name.onChange('Rex');
        await form.handleSubmit(async () => { throw new Error('server down'); })(new Event('submit'));
        expect(form.state()).toBe('error');
        const answer = askToLeave(el);
        expect(answer, 'a failed save lost the question').toBeInstanceOf(Promise);
        getDialogQueue().closeAll();
        await answer;
    });

    it('a field edited while the save was in flight stays unsaved', async () => {
        const el = mountFormPage(true);
        form.fields.name.onChange('Rex');
        let finishSave: () => void = () => {};
        const submitting = form.handleSubmit(() => new Promise<void>(r => { finishSave = r; }))(new Event('submit'));
        await new Promise(r => setTimeout(r, 0));
        form.fields.name.onChange('Rexy');
        finishSave();
        await submitting;
        expect(form.dirty(), 'the edit made during the save was treated as saved').toBe(true);
        const answer = askToLeave(el);
        expect(answer).toBeInstanceOf(Promise);
        getDialogQueue().closeAll();
        await answer;
    });

    it('a field array saved by a submit is clean too', async () => {
        const tag = `x-unsaved-arr-${++seq}`;
        let arrForm!: Form<{ tags: string[] }>;
        component(tag, {
            setup() {
                arrForm = createForm({ initialValues: { tags: [] as string[] }, warnUnsaved: true });
                return {};
            },
            render: () => html`<div></div>`,
        });
        document.body.appendChild(document.createElement(tag));
        arrForm.array('tags').append('urgent');
        expect(arrForm.dirty()).toBe(true);
        await arrForm.handleSubmit(async () => {})(new Event('submit'));
        expect(arrForm.dirty(), 'the saved array still counts as unsaved').toBe(false);
        arrForm.array('tags').append('follow-up');
        expect(arrForm.dirty(), 'an append after the save must be unsaved again').toBe(true);
    });

    it('control — without the option no guard is registered', () => {
        const el = mountFormPage(false);
        form.fields.name.onChange('Rex');
        expect(el._beforeLeaveCallbacks ?? []).toHaveLength(0);
    });
});

describe('closing or reloading the tab', () => {
    const unload = (): Event => {
        const e = new Event('beforeunload', { cancelable: true });
        window.dispatchEvent(e);
        return e;
    };

    it('dirty: beforeunload is cancelled (the browser asks, in its own words)', () => {
        mountFormPage(true);
        form.fields.name.onChange('Rex');
        expect(unload().defaultPrevented).toBe(true);
    });

    it('clean again: the listener is gone', () => {
        mountFormPage(true);
        form.fields.name.onChange('Rex');
        form.reset({ name: 'Rex' });
        expect(unload().defaultPrevented).toBe(false);
    });

    it('the component is destroyed: the listener is gone', () => {
        const el = mountFormPage(true);
        form.fields.name.onChange('Rex');
        el.remove();
        expect(unload().defaultPrevented).toBe(false);
    });

    it('control — clean from the start: nothing is cancelled', () => {
        mountFormPage(true);
        expect(unload().defaultPrevented).toBe(false);
    });
});

describe('outside a component', () => {
    it('warns that there is nothing to attach the guard to', () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        createForm({ initialValues: { name: '' }, warnUnsaved: true });
        expect(warn.mock.calls.some(c => String(c[0]).includes('warnUnsaved'))).toBe(true);
        warn.mockRestore();
    });
});
