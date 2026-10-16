// A `@defer` body is built once, not again whenever a signal it read while being built changes.
//
// `defer()` renders each state from an effect, and the body ran inside it, tracked: every signal the
// body read while it was being built — and every signal a component it mounted read in its setup —
// became a dependency of that effect. When one changed, the effect removed the body and built a new
// one. In the showcase's tickets page, a deferred create modal lost what had been typed into it as
// soon as the customer field changed the asset picker it holds (#449): the form was replaced by an
// empty one. A body's own bindings react to their signals; the body as a whole does not.

import { describe, it, expect, beforeEach } from 'vitest';
import { signal } from '../src/reactivity/signal';
import { bindInterpolation } from '../src/renderer/template';
import { defer } from '../src/renderer/defer';
import { waitUntil } from './wait-until';

const settle = () => new Promise(r => setTimeout(r, 0));

describe('@defer body — built once', () => {
    beforeEach(() => { document.body.innerHTML = ''; });

    for (const [late, trigger, load] of [
        ['at once', 'immediate', null],
        ['after an asynchronous load', 'immediate', () => Promise.resolve({})],
        ['after a trigger that fires later', 'timer(1)', null],
    ] as const) {
        it(`a body rendered ${late} is not rebuilt when a signal it read while built changes`, async () => {
            const read = signal(0);
            const bound = signal('a');
            let builds = 0;
            const host = document.createElement('div');
            document.body.appendChild(host);
            host.appendChild(defer({ trigger }, load, () => {
                builds++;
                void read();                                   // read while building, as a setup does
                const p = document.createElement('p');
                const t = document.createTextNode('');
                p.appendChild(t);
                bindInterpolation(t, () => bound());           // a binding, which must keep reacting
                return p;
            }));
            await waitUntil(() => host.querySelector('p') !== null, 'the deferred body to render');
            await settle();
            const p = host.querySelector('p');

            read.set(1);
            await settle();
            expect(builds, 'the body was built again for a signal it read while being built').toBe(1);
            expect(host.querySelector('p'), 'the body was replaced').toBe(p);

            bound.set('b');
            await settle();
            expect(p!.textContent, 'control: the body\'s own binding stopped reacting').toBe('b');
        });
    }
});
