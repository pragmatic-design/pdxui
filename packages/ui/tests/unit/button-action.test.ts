// `<pdx-button :action="save" :action-arg="dto">` runs a write and guards it (#49).
//
// Binding a button to a write took the same lines in every form — call `execute`, mirror `pending`
// into `loading` and `disabled` — and the double-submit protection lived in `mutation()` refusing a
// second call, which is to become a queue (#50). The guard moves to the button: while the action is
// pending it is busy and a click does nothing.
import { describe, it, expect, afterEach } from 'vitest';
import { mutation } from '@pdxui/core';
import { tick } from './helpers';
import '../../src/button/pdx-button';

type ButtonHost = HTMLElement & { action: unknown; actionArg: unknown; disabled: boolean };

async function mount(attrs = ''): Promise<ButtonHost> {
    const host = document.createElement('div');
    host.innerHTML = `<pdx-button ${attrs}>Save</pdx-button>`;
    document.body.appendChild(host);
    await tick(20);
    return host.querySelector('pdx-button') as ButtonHost;
}

const inner = (el: HTMLElement): HTMLButtonElement => el.querySelector('button')!;

/** A write that resolves when `release()` is called, counting its calls and the inputs they got. */
function slowWrite(fail = false, concurrency?: 'queue' | 'drop' | 'coalesce' | 'parallel') {
    const calls: unknown[] = [];
    let release!: () => void;
    const save = mutation<string, unknown>({
        concurrency,
        fn: (input) => {
            calls.push(input);
            return new Promise<string>((resolve, reject) => {
                release = () => (fail ? reject(new Error('refused')) : resolve('saved'));
            });
        },
    });
    return { save, calls, release: () => release() };
}

afterEach(() => { document.body.innerHTML = ''; });

describe('pdx-button action', () => {
    it('a click runs the action with its argument', async () => {
        const { save, calls, release } = slowWrite();
        const el = await mount();
        el.action = save;
        el.actionArg = { name: 'Ada' };
        await tick(20);
        inner(el).click();
        await tick(20);
        expect(calls).toEqual([{ name: 'Ada' }]);
        release();
        await tick(20);
    });

    it('two clicks while the write is pending run it once, and the button is busy until it settles', async () => {
        const { save, calls, release } = slowWrite();
        const el = await mount();
        el.action = save;
        await tick(20);
        inner(el).click();
        await tick(20);
        expect(inner(el).getAttribute('aria-busy'), 'not busy while the write is pending').toBe('true');
        expect(inner(el).disabled).toBe(true);
        inner(el).click();
        el.click();
        await tick(20);
        expect(calls, 'the second click ran the write again').toHaveLength(1);

        release();
        await tick(20);
        expect(inner(el).getAttribute('aria-busy'), 'still busy after the write settled').toBeNull();
        expect(inner(el).disabled).toBe(false);
    });

    it("under 'drop' a second click is refused, as under 'queue' (#500)", async () => {
        const { save, calls, release } = slowWrite(false, 'drop');
        const el = await mount();
        el.action = save;
        await tick(20);
        inner(el).click();
        await tick(20);
        expect(inner(el).disabled).toBe(true);
        inner(el).click();
        await tick(20);
        release();
        await tick(20);
        expect(calls).toHaveLength(1);
    });

    it("under 'coalesce' the button stays clickable and shows loading: a second click is accepted (#500)", async () => {
        const { save, calls, release } = slowWrite(false, 'coalesce');
        const el = await mount();
        el.action = save;
        await tick(20);
        inner(el).click();
        await tick(20);
        expect(inner(el).getAttribute('aria-busy'), 'loading while the call runs').toBe('true');
        expect(inner(el).disabled, 'refuses clicks under coalesce').toBe(false);
        inner(el).click();
        await tick(20);
        release();
        await tick(20);
        expect(calls, 'the second click waited behind the first, and ran').toHaveLength(2);
        release();
        await tick(20);
    });

    it('explicit disabled wins: no call', async () => {
        const { save, calls } = slowWrite();
        const el = await mount('disabled');
        el.action = save;
        await tick(20);
        inner(el).click();
        el.click();
        await tick(20);
        expect(calls).toHaveLength(0);
    });

    it('a refused write stays on the action\'s error(), is announced as pdx-action-error, and the button returns to idle', async () => {
        const { save, release } = slowWrite(true);
        const el = await mount();
        el.action = save;
        await tick(20);
        const errors: unknown[] = [];
        el.addEventListener('pdx-action-error', (e) => errors.push((e as CustomEvent).detail.error));
        inner(el).click();
        await tick(20);
        release();
        await tick(20);
        expect((save.error() as Error).message).toBe('refused');
        expect(errors.map(e => (e as Error).message)).toEqual(['refused']);
        expect(inner(el).getAttribute('aria-busy')).toBeNull();
        expect(inner(el).disabled).toBe(false);
    });

    it('control — without an action, a click is a plain click', async () => {
        const el = await mount();
        let clicked = 0;
        el.addEventListener('click', () => clicked++);
        inner(el).click();
        await tick(20);
        expect(clicked).toBe(1);
        expect(inner(el).getAttribute('aria-busy')).toBeNull();
    });
});
