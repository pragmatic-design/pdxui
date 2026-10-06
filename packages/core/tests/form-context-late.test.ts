// tryUseForm(from): a lookup that finds no form runs again when one is provided.
import { describe, it, expect, afterEach } from 'vitest';
import { effect } from '../src/reactivity/signal';
import { createForm } from '../src/form/form';
import { provideForm, tryUseForm, provideFieldGroupPath, useFieldGroupPath, provideFormCoordinator, useFormCoordinator } from '../src/form/form-context';
import { createFormCoordinator } from '../src/form/form-coordinator';

const tick = (): Promise<void> => new Promise((r) => queueMicrotask(r));

afterEach(() => { document.body.innerHTML = ''; });

function tree(): { parent: HTMLElement; child: HTMLElement } {
    const parent = document.createElement('div');
    const child = document.createElement('span');
    parent.appendChild(child);
    document.body.appendChild(parent);
    return { parent, child };
}

describe('tryUseForm(from)', () => {
    it('re-runs an effect whose lookup missed once a form is provided above it', async () => {
        const { parent, child } = tree();
        const seen: unknown[] = [];
        const dispose = effect(() => { seen.push(tryUseForm(child)); });
        expect(seen).toEqual([undefined]);

        const f = createForm({ initialValues: { a: '' } });
        provideForm(f, parent);
        await tick();
        expect(seen.at(-1), 'the lookup was not run again when the form appeared').toBe(f);
        dispose();
    });

    it('stops listening once found: a later provideForm does not re-run it', async () => {
        const { parent, child } = tree();
        const f = createForm({ initialValues: { a: '' } });
        provideForm(f, parent);
        let runs = 0;
        const dispose = effect(() => { runs++; tryUseForm(child); });
        provideForm(createForm({ initialValues: { b: '' } }), document.createElement('div'));
        await tick();
        expect(runs).toBe(1);
        dispose();
    });

    it('without `from` (the setup form) a miss subscribes to nothing', async () => {
        // A setup that misses must not make the effect it runs inside — a parent's render — re-run on
        // every form provided anywhere.
        const { parent } = tree();
        let runs = 0;
        const dispose = effect(() => { runs++; tryUseForm(); });
        provideForm(createForm({ initialValues: { a: '' } }), parent);
        await tick();
        expect(runs).toBe(1);
        dispose();
    });
});

describe('useFieldGroupPath(from)', () => {
    it('follows a path that changes after it was found: inner first, then outer.inner', async () => {
        // A path is not kept once found, unlike the form: an inner group set up before the outer one
        // provides its own name first, and the full path once the outer path appears.
        const { parent, child } = tree();
        const seen: (string | undefined)[] = [];
        const dispose = effect(() => { seen.push(useFieldGroupPath(child)); });
        provideFieldGroupPath('address', parent);
        await tick();
        provideFieldGroupPath('order.address', parent);
        await tick();
        expect(seen).toEqual([undefined, 'address', 'order.address']);
        dispose();
    });

    it('without `from` (the setup form) subscribes to nothing', async () => {
        const { parent } = tree();
        let runs = 0;
        const dispose = effect(() => { runs++; useFieldGroupPath(); });
        provideFieldGroupPath('address', parent);
        await tick();
        expect(runs).toBe(1);
        dispose();
    });
});

describe('useFormCoordinator(from)', () => {
    it('re-runs an effect whose lookup missed once a coordinator is provided above it', async () => {
        const { parent, child } = tree();
        const seen: unknown[] = [];
        const dispose = effect(() => { seen.push(useFormCoordinator(child)); });
        const coordinator = createFormCoordinator();
        provideFormCoordinator(coordinator, parent);
        await tick();
        expect(seen).toEqual([undefined, coordinator]);
        dispose();
    });
});
