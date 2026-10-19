// A suspended scope parks its effects, and resuming runs each one once (#269; beta spec,
// lifecycle.md → «The matrix», column frozen). The browser half — a frozen route page, a kept
// `<component :is>` instance — is `packages/showcase/tests/lifecycle.spec.ts`.
import { describe, it, expect, vi, afterEach } from 'vitest';
import {
    signal, computed, effect, batch, collectScope, collectDisposers, suspendScope, resumeScope,
    isScopeSuspended, onScopeSuspension, currentScope,
} from '../src/reactivity/signal';
import { pausableTimeout } from '../src/reactivity/scope-timer';
import { defer } from '../src/renderer/defer';

describe('a suspended scope', () => {
    it('parks an effect while suspended and runs it once on resume', () => {
        const count = signal(0);
        const seen: number[] = [];
        const [, , scope] = collectScope(() => effect(() => { seen.push(count()); }));
        expect(seen).toEqual([0]);

        suspendScope(scope);
        count.set(1);
        count.set(2);
        count.set(3);
        expect(seen).toEqual([0]);

        resumeScope(scope);
        expect(seen).toEqual([0, 3]);
    });

    it('does not run an effect on resume when nothing it reads changed', () => {
        const count = signal(0);
        let runs = 0;
        const [, , scope] = collectScope(() => effect(() => { count(); runs++; }));
        suspendScope(scope);
        resumeScope(scope);
        expect(runs).toBe(1);
    });

    it('checks a «maybe» on resume: a computed that kept its value does not run the effect', () => {
        const n = signal(2);
        const even = computed(() => n() % 2 === 0);
        let runs = 0;
        const [, , scope] = collectScope(() => effect(() => { even(); runs++; }));
        suspendScope(scope);
        n.set(4);
        resumeScope(scope);
        expect(runs).toBe(1);
        suspendScope(scope);
        n.set(5);
        resumeScope(scope);
        expect(runs).toBe(2);
    });

    it('holds the scopes created under it, and the effects created in a flush by one of its effects', () => {
        const show = signal(false);
        const inner = signal(0);
        const seen: number[] = [];
        const [, , scope] = collectScope(() => {
            collectDisposers(() => effect(() => { seen.push(inner()); }));
            // An `@if` branch rendered later, in a flush: no scope is being collected then.
            effect(() => { if (show()) effect(() => { seen.push(100 + inner()); }); });
        });
        show.set(true);
        expect(seen).toEqual([0, 100]);

        suspendScope(scope);
        inner.set(1);
        expect(seen).toEqual([0, 100]);
        resumeScope(scope);
        expect(seen.slice(2).sort()).toEqual([1, 101]);
    });

    it('runs effects outside the suspended scope as usual', () => {
        const count = signal(0);
        let held = 0;
        let free = 0;
        const [, , scope] = collectScope(() => effect(() => { count(); held++; }));
        effect(() => { count(); free++; });
        suspendScope(scope);
        count.set(1);
        expect([held, free]).toEqual([1, 2]);
        resumeScope(scope);
        expect([held, free]).toEqual([2, 2]);
    });

    it('stays held while an outer scope is suspended, when an inner one resumes', () => {
        const count = signal(0);
        let runs = 0;
        let inner!: ReturnType<typeof currentScope>;
        const [, , outer] = collectScope(() => {
            [, , inner] = collectScope(() => effect(() => { count(); runs++; }));
        });
        suspendScope(outer);
        suspendScope(inner!);
        count.set(1);
        resumeScope(inner!);
        expect(runs).toBe(1);
        resumeScope(outer);
        expect(runs).toBe(2);
    });

    it('resumes inside a batch at the batch end', () => {
        const count = signal(0);
        let runs = 0;
        const [, , scope] = collectScope(() => effect(() => { count(); runs++; }));
        suspendScope(scope);
        count.set(1);
        batch(() => {
            resumeScope(scope);
            expect(runs).toBe(1);
        });
        expect(runs).toBe(2);
    });

    it('is released when disposed while suspended', () => {
        const count = signal(0);
        let runs = 0;
        const [, dispose, scope] = collectScope(() => effect(() => { count(); runs++; }));
        suspendScope(scope);
        count.set(1);
        dispose();
        expect(isScopeSuspended(scope)).toBe(false);
        count.set(2);
        expect(runs).toBe(1);
    });
});

describe('a pausable framework timer', () => {
    afterEach(() => { vi.useRealTimers(); });

    it('pauses with its scope and fires with the time it had left after the resume', () => {
        vi.useFakeTimers();
        let fired = 0;
        const [, , scope] = collectScope(() => {});
        pausableTimeout(scope, () => { fired++; }, 1000);
        vi.advanceTimersByTime(300);
        suspendScope(scope);
        vi.advanceTimersByTime(5000);
        expect(fired, 'it fired while its scope was suspended').toBe(0);
        resumeScope(scope);
        vi.advanceTimersByTime(699);
        expect(fired, 'it fired before its remaining 700 ms').toBe(0);
        vi.advanceTimersByTime(1);
        expect(fired).toBe(1);
    });

    it('holds @defer\'s timer(n) trigger: a block frozen 30 ms into timer(100) loads 70 ms after the resume', () => {
        vi.useFakeTimers();
        const host = document.createElement('div');
        const [frag, dispose, scope] = collectScope(() => defer(
            { trigger: 'timer(100)', placeholder: () => document.createTextNode('placeholder') },
            null,
            () => document.createTextNode('loaded'),
        ));
        host.appendChild(frag);
        vi.advanceTimersByTime(30);
        suspendScope(scope);
        vi.advanceTimersByTime(1000);
        expect(host.textContent, 'the trigger fired while the block was frozen').toBe('placeholder');
        resumeScope(scope);
        vi.advanceTimersByTime(69);
        expect(host.textContent).toBe('placeholder');
        vi.advanceTimersByTime(1);
        expect(host.textContent).toBe('loaded');
        dispose();
    });

    it('is a plain timeout without a scope, and cleared by what it returns', () => {
        vi.useFakeTimers();
        let fired = 0;
        pausableTimeout(null, () => { fired++; }, 100);
        const clear = pausableTimeout(null, () => { fired += 10; }, 100);
        clear();
        vi.advanceTimersByTime(100);
        expect(fired).toBe(1);
    });
});

describe('suspension hooks', () => {
    it('pause and resume with the scope, and with a scope above it', () => {
        const calls: string[] = [];
        let inner!: NonNullable<ReturnType<typeof currentScope>>;
        const [, , outer] = collectScope(() => {
            [, , inner] = collectScope(() => {
                onScopeSuspension(currentScope()!, () => calls.push('suspend'), () => calls.push('resume'));
            });
        });
        suspendScope(outer);
        suspendScope(inner);
        resumeScope(inner);
        expect(calls).toEqual(['suspend']);
        resumeScope(outer);
        expect(calls).toEqual(['suspend', 'resume']);
    });

    it('suspend at once when registered under a suspended scope, and are removed with the scope', () => {
        const calls: string[] = [];
        const [, dispose, scope] = collectScope(() => {});
        suspendScope(scope);
        onScopeSuspension(scope, () => calls.push('suspend'), () => calls.push('resume'));
        expect(calls).toEqual(['suspend']);
        dispose();
        suspendScope(scope);
        resumeScope(scope);
        expect(calls).toEqual(['suspend']);
    });
});
