// A `@defer` block whose code has already arrived renders in the task it is triggered in (#685).
//
// Every block loaded its code through its own `loadFn`, and rendered its body in a `.then`, a flush
// after the trigger, even when that code had arrived long before: the hundredth filter popover waited
// as the first had, and its body was built into the live page instead of the fragment being appended.
// `deferCode` is one load per `@defer` in a module, shared by its blocks, and knows when it has arrived.
import { describe, it, expect, afterEach } from 'vitest';
import { html } from '../src/renderer/template';
import { defer } from '../src/renderer/defer';
import { deferCode } from '../src/renderer/defer-code';
import { resetLoadQueue } from '../src/renderer/load-queue';

const settle = () => new Promise((r) => setTimeout(r, 20));

/** Append a block with an immediate trigger; the body is a <i class="body">. */
function mount(load: () => Promise<unknown>, error?: (e: Error, retry: () => void) => Node) {
    const box = document.createElement('div');
    document.body.appendChild(box);
    box.appendChild(defer({ trigger: 'immediate', ...(error ? { error } : {}) }, load, () => html`<i class="body">body</i>`));
    return box;
}

afterEach(() => { resetLoadQueue(); document.body.innerHTML = ''; });

describe('deferCode: a @defer\'s code, loaded once for all its blocks', () => {
    it('the first block waits for the code; a block after it has arrived renders in the same task', async () => {
        let calls = 0;
        const code = deferCode(() => { calls++; return Promise.resolve('module'); });
        const first = mount(code);
        expect(first.querySelector('.body'), 'the code has not arrived yet').toBeNull();
        await settle();
        expect(first.querySelector('.body')).not.toBeNull();

        const second = mount(code);
        expect(second.querySelector('.body'), 'the code had arrived: the body is there at once').not.toBeNull();
        expect(calls, 'one load for both blocks').toBe(1);
    });

    it('a block whose code is in flight renders when it arrives, with no second load', async () => {
        let calls = 0;
        let arrive!: (v: unknown) => void;
        const code = deferCode(() => { calls++; return new Promise((r) => { arrive = r; }); });
        const a = mount(code);
        const b = mount(code);
        arrive('module');
        await settle();
        expect(a.querySelector('.body')).not.toBeNull();
        expect(b.querySelector('.body')).not.toBeNull();
        expect(calls).toBe(1);
    });

    it('a failed load is forgotten: the retry loads it again, and a later block finds it arrived', async () => {
        let calls = 0;
        const code = deferCode(() => (++calls === 1 ? Promise.reject(new Error('offline')) : Promise.resolve('module')));
        let again: (() => void) | undefined;
        const box = mount(code, (_e, retry) => { again = retry; return html`<b class="err">err</b>`; });
        await settle();
        expect(box.querySelector('.err')).not.toBeNull();
        again!();
        await settle();
        expect(box.querySelector('.body')).not.toBeNull();
        expect(calls).toBe(2);
        expect(mount(code).querySelector('.body'), 'arrived after the retry').not.toBeNull();
    });
});
