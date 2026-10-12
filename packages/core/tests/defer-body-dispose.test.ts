// A `@defer` body rendered after its load is disposed with its block (#261; beta spec, template.md,
// «`@defer` — two phases, rules for removal»: everything the body mounted is disposed with the block).
//
// `defer()` renders each state from an effect. Its first run happens while the enclosing branch is
// being rendered, inside that branch's ownership scope; a later run — the body, once the load has
// resolved or the trigger has fired — happens in a flush, where no scope is current. Whatever the body
// created there belonged to nobody: removing the block left its bindings subscribed, re-running on
// detached nodes for the life of the page.
//
// The two shapes below are the ones the compiler emits for
// `@if (shown) { @defer (…) { <p>{{ count }}</p> } }` — the template path (`html` with a function
// hole) and the inline path (`bindInterpolation`). The binding counts its own runs.

import { describe, it, expect, beforeEach } from 'vitest';
import { signal } from '../src/reactivity/signal';
import { html, bindInterpolation } from '../src/renderer/template';
import { when } from '../src/renderer/helpers';
import { defer } from '../src/renderer/defer';
import { waitUntil } from './wait-until';

type Body = (count: () => number, onRun: () => void) => () => Node | DocumentFragment;

const BODIES: Record<string, Body> = {
    template: (count, onRun) => () => html`<p>${() => { onRun(); return count(); }}</p>`,
    inline: (count, onRun) => () => {
        const frag = document.createDocumentFragment();
        const p = document.createElement('p');
        frag.appendChild(p);
        const t = document.createTextNode('');
        p.appendChild(t);
        bindInterpolation(t, () => { onRun(); return count(); });
        return frag;
    },
};

/** `@if (shown) { @defer (trigger) { <p>{{ count }}</p> } }`, mounted, with the body's runs counted. */
function mount(body: Body, trigger: string, load: (() => Promise<unknown>) | null) {
    const shown = signal(true);
    const count = signal(0);
    const runs = { n: 0 };
    const host = document.createElement('div');
    document.body.appendChild(host);
    host.appendChild(when(() => shown(), () => defer({ trigger }, load, body(count, () => { runs.n++; })), null));
    return { shown, count, runs, host };
}

/** Lets a pending flush run. */
const settle = () => new Promise(r => setTimeout(r, 0));

for (const [path, body] of Object.entries(BODIES)) {
    describe(`@defer body — ${path} path`, () => {
        beforeEach(() => { document.body.innerHTML = ''; });

        for (const [late, trigger, load] of [
            ['after an asynchronous load', 'immediate', () => Promise.resolve({})],
            ['after a trigger that fires later', 'timer(1)', null],
        ] as const) {
            it(`a body rendered ${late} stops reacting once its block is removed`, async () => {
                const { shown, count, runs, host } = mount(body, trigger, load);
                await waitUntil(() => host.querySelector('p') !== null, 'the deferred body to render');
                await settle();
                const before = runs.n;
                count.set(1);
                await settle();
                expect(runs.n, 'control: the mounted body does not react to its signal').toBe(before + 1);

                shown.set(false);
                await settle();
                expect(host.querySelector('p'), 'the block was not removed').toBeNull();
                const removed = runs.n;
                count.set(2);
                await settle();
                expect(runs.n, 'the removed body\'s binding still runs').toBe(removed);
            });
        }

        it('control — a body rendered at once, inside the branch\'s render, is disposed with it', async () => {
            const { shown, count, runs, host } = mount(body, 'immediate', null);
            expect(host.querySelector('p')).not.toBeNull();
            shown.set(false);
            await settle();
            const removed = runs.n;
            count.set(1);
            await settle();
            expect(runs.n).toBe(removed);
        });
    });
}
