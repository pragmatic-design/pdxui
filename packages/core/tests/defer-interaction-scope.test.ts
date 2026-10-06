// `@defer (interaction)` listens on the BLOCK, not on the page.
//
// On `document.body`, the first mouse movement anywhere would fire it. `defer()` builds
// a DocumentFragment with two comment markers and sets its triggers up from `end.parentNode` —
// which, at that moment, is the fragment. A fragment is not an `Element`; an interaction trigger
// that falls back to `document.body` fires on `pointerenter` the moment the pointer enters the
// page.
//
// What it costs: a chart behind `@defer` in a tab nobody has opened, and clicking a NAV LINK
// fetches the chart's chunk. The defect is invisible while the chart travels with the route.
//
// `hover` shares the code path and is the same promise broken less badly: on the body it is at
// least *nearly* what it says. `interaction` on the body is not.
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { html } from '../src/renderer/template';
import { defer } from '../src/renderer/defer';
import { waitUntil } from './wait-until';

/** A page with somewhere else to point at, and the deferred block inside its own container. */
function mount(trigger: string, load: () => Promise<unknown>) {
    const elsewhere = document.createElement('div');
    elsewhere.id = 'elsewhere';
    document.body.appendChild(elsewhere);

    const box = document.createElement('div');
    box.id = 'box';
    document.body.appendChild(box);
    box.appendChild(defer({ trigger, placeholder: () => html`<span class="ph"></span>` },
        load, () => html`<div class="loaded"></div>`));
    return { elsewhere, box };
}

const enter = (el: Element) => el.dispatchEvent(new Event('pointerenter'));

/**
 * One frame, because the trigger arms one frame after the fragment is inserted.
 *
 * It has to: the triggers are set up while `end.parentNode` is still the DocumentFragment, so the
 * real container only exists after the caller has placed it. Immaterial for a pointer or a focus,
 * which arrive when a person does something.
 */
const armed = () => new Promise(r => requestAnimationFrame(() => r(null)));

describe('@defer (interaction)', () => {
    beforeEach(() => { document.body.innerHTML = ''; });

    it('does not fire when the pointer enters the page', async () => {
        const load = vi.fn(() => Promise.resolve({}));
        mount('interaction', load);
        await armed();
        // What a mouse moving onto the document does: a listener on the body would fire here.
        enter(document.body);
        expect(load, 'the whole page is the trigger').not.toHaveBeenCalled();
    });

    it('and not when the pointer enters something else', async () => {
        const load = vi.fn(() => Promise.resolve({}));
        const { elsewhere } = mount('interaction', load);
        await armed();
        enter(elsewhere);
        expect(load).not.toHaveBeenCalled();
    });

    it('but does when the pointer enters the block', async () => {
        // The control, and the point: a trigger that never fires is not a fix.
        const load = vi.fn(() => Promise.resolve({}));
        const { box } = mount('interaction', load);
        await armed();
        enter(box);
        await waitUntil(() => load.mock.calls.length > 0, 'the deferred block to load on its own container');
        expect(load).toHaveBeenCalledOnce();
    });

    it('and focus into the block fires it too', async () => {
        // `focusin` bubbles, so a control inside the block reaches the container's listener —
        // which is the half of "interaction" a keyboard user has.
        const load = vi.fn(() => Promise.resolve({}));
        const { box } = mount('interaction', load);
        await armed();
        const input = document.createElement('input');
        box.appendChild(input);
        input.dispatchEvent(new Event('focusin', { bubbles: true }));
        await waitUntil(() => load.mock.calls.length > 0, 'the deferred block to load on focus');
        expect(load).toHaveBeenCalledOnce();
    });

    it('and `hover` is scoped the same way', async () => {
        // Same code path, same defect, and the issue asked for both to be decided together.
        const load = vi.fn(() => Promise.resolve({}));
        const { box } = mount('hover', load);
        await armed();
        enter(document.body);
        expect(load, 'hover fired on the page').not.toHaveBeenCalled();

        enter(box);
        await waitUntil(() => load.mock.calls.length > 0, 'hover to fire on its own block');
        expect(load).toHaveBeenCalledOnce();
    });
});
