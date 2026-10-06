// A keep-alive page whose leave guard answers 'destroy' is discarded, not frozen.
//
// `onBeforeLeave(fn)` accepts 'destroy' (core `component/lifecycle.ts`): leave, and do not keep this
// page. Calling `_destroyFrozen(path)` BEFORE `_deactivate` freezes the page finds no frozen entry
// and returns; `_deactivate` then freezes the page as if the guard had said `true`. The page's
// effects are never disposed, and coming back resumes it.

import { describe, it, expect, beforeAll } from 'vitest';

let disposed = 0;
/** What the page's leave guard answers. Set per test. */
let answer: boolean | 'destroy' = true;

class KeepPage extends HTMLElement {
    // The shape core's `onBeforeLeave` produces on a component element.
    _beforeLeaveCallbacks = [() => answer];
    disconnectedCallback() {
        if ((this as unknown as { _keepAlive?: boolean })._keepAlive) return; // frozen: no cleanup, as PdxElement
        disposed++;
    }
}
customElements.define('pdx-destroy-keep', KeepPage);
customElements.define('pdx-destroy-elsewhere', class extends HTMLElement {});

(globalThis as Record<string, unknown>).__pdx_routes = [
    { path: '/keep', tag: 'pdx-destroy-keep', keepAlive: true },
    { path: '/elsewhere', tag: 'pdx-destroy-elsewhere' },
];

import { navigate } from '../src/runtime';
import '../src/outlet';

const tick = () => new Promise(r => setTimeout(r, 0));
async function go(path: string): Promise<void> {
    navigate(path);
    await tick();
    await tick();
}

describe('a leave guard that answers destroy', () => {
    beforeAll(async () => {
        history.replaceState(null, '', '/keep');
        document.body.appendChild(document.createElement('pdx-router-outlet'));
        await tick();
        await go('/keep');
    });

    it('the control: answering true freezes the page, and coming back resumes the same element', async () => {
        answer = true;
        disposed = 0;
        const first = document.querySelector('pdx-destroy-keep');
        expect(first, 'the keep-alive page did not mount: the case measures nothing').toBeTruthy();

        await go('/elsewhere');
        expect(disposed, 'a frozen page is not disposed').toBe(0);

        await go('/keep');
        expect(document.querySelector('pdx-destroy-keep'), 'coming back resumes the frozen element').toBe(first);
    });

    it('answering destroy disposes the page, and coming back mounts a new one', async () => {
        answer = 'destroy';
        disposed = 0;
        const before = document.querySelector('pdx-destroy-keep');
        expect(before).toBeTruthy();

        await go('/elsewhere');
        expect(document.querySelector('pdx-destroy-elsewhere'), 'the navigation went through').toBeTruthy();
        expect(disposed, 'the page was frozen instead of destroyed').toBe(1);

        answer = true;
        await go('/keep');
        const after = document.querySelector('pdx-destroy-keep');
        expect(after).toBeTruthy();
        expect(after, 'a destroyed page must not be resumed').not.toBe(before);
    });
});
