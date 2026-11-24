// `<pdx-error-boundary>`'s Retry brings its children back.
//
// The fallback clears everything between the boundary's markers, the projected children included.
// A Retry that rendered the content again — a new <slot> — would come back empty, because nothing
// fills a slot created after mount.
import { describe, it, expect, afterEach } from 'vitest';
import { component, html, signal, computed, inject, onGlobalError, clearGlobalErrorHandlers } from '@pdxui/core';
import { ErrorContext } from '@pdxui/ui/error-boundary';
import '../../src/error-boundary/pdx-error-boundary.pdx';
import { uniqueTag, tick, cleanup } from './helpers';

afterEach(() => { cleanup(); clearGlobalErrorHandlers(); });

describe('pdx-error-boundary Retry', () => {
    function setup(maxRetries = 3, extra = '') {
        const failed = signal(false);
        const status = computed(() => {
            if (failed()) throw new Error('data source down');
            return 'feed ok';
        });
        const child = uniqueTag('flaky-feed');
        component(child, { render: () => html`<span class="feed">${() => status()}</span>` });
        onGlobalError(() => true);
        const host = document.createElement('div');
        host.innerHTML = `<pdx-error-boundary max-retries="${maxRetries}"${extra}><p class="note">note</p><${child}></${child}></pdx-error-boundary>`;
        document.body.appendChild(host);
        const errors: number[] = [];
        host.querySelector('pdx-error-boundary')!.addEventListener('pdx-error', (e) => errors.push((e as CustomEvent).detail.retryCount));
        return { failed, host, errors };
    }
    const retryBtn = (host: Element) => host.querySelector('.pdx-error-boundary button') as HTMLButtonElement | null;

    it('once the cause is fixed, Retry shows the children again', async () => {
        const { failed, host } = setup();
        await tick();
        failed.set(true);
        await tick();
        expect(host.querySelector('[role="alert"]')).not.toBeNull();

        failed.set(false);
        retryBtn(host)!.click();
        await tick();
        expect(host.querySelector('[role="alert"]')).toBeNull();
        expect(host.querySelector('.feed')?.textContent).toBe('feed ok');
        expect(host.querySelector('.note')?.textContent).toBe('note');
    });

    it('Retry while it is still broken fails again, and max-retries ends the retries', async () => {
        const { failed, host, errors } = setup(2);
        await tick();
        failed.set(true);
        await tick();
        retryBtn(host)!.click();
        await tick();
        expect(host.querySelector('.pdx-error-boundary-detail')?.textContent).toBe('data source down');
        expect(errors).toEqual([1, 2]);
        expect(retryBtn(host)).toBeNull();
        expect(host.querySelector('.pdx-error-boundary')?.textContent).toContain('Max retries reached');
    });

    it('an automatic retry that succeeds clears the error, for the host and for the context', async () => {
        const { failed, host, errors } = setup(3, ' auto-retry retry-delay="0"');
        await tick();
        const boundary = host.querySelector('pdx-error-boundary')!;
        const context = inject(ErrorContext, host.querySelector<HTMLElement>('.note')!, null)!;
        expect(context, 'the boundary provides no context').not.toBeNull();

        failed.set(true);
        // The effect that throws runs in a microtask; the boundary's retry waits for its 0 ms timer.
        await Promise.resolve();
        await Promise.resolve();
        expect(errors).toEqual([1]);
        expect(context.error()?.message).toBe('data source down');
        failed.set(false);
        await new Promise<void>((done) => setTimeout(done, 0)); // SLEEP-OK: the boundary's own retry timer, set to 0 ms
        await tick();
        expect(host.querySelector('.feed')?.textContent, 'the automatic retry did not bring the child back').toBe('feed ok');
        expect(context.error(), 'the context still holds the error the retry recovered from').toBeNull();
        expect((boundary as unknown as { matches(s: string): boolean }).matches(':state(error)')).toBe(false);
    });
});
