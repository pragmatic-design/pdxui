// Regression tests for:
//   BUG 1 — 403 must be distinguishable from 404 (currentNavError).
//   BUG 4 — @search typed params: currentSearch must be reactive.

import { describe, it, expect, beforeEach } from 'vitest';
import { effect } from '@pdxui/core';
import {
    createRouter, navigate, currentRoute, currentNavError, currentSearch,
    registerGuardChecker, setQueryParam, setQuery, currentQuery, destroyRouter,
} from '../src/runtime';

describe('currentNavError — 403 vs 404', () => {
    beforeEach(() => {
        if (typeof history !== 'undefined') history.replaceState(null, '', '/');
        registerGuardChecker(() => true);
    });

    it('guard denial without redirect → route null AND navError 403', async () => {
        registerGuardChecker((name) => name !== 'admin');
        createRouter([
            { path: '/', component: () => document.createElement('div') },
            { path: '/admin', component: () => document.createElement('div'), guard: 'admin' },
        ]);

        navigate('/');
        await new Promise(r => setTimeout(r, 10));
        navigate('/admin');
        await new Promise(r => setTimeout(r, 20));

        expect(currentRoute()).toBeNull();
        expect(currentNavError()).toBe('403');
    });

    it('unmatched path → navError 404', async () => {
        createRouter([
            { path: '/', component: () => document.createElement('div') },
        ]);

        navigate('/does-not-exist');
        await new Promise(r => setTimeout(r, 20));

        expect(currentRoute()).toBeNull();
        expect(currentNavError()).toBe('404');
    });

    it('successful match clears navError', async () => {
        createRouter([
            { path: '/', component: () => document.createElement('div') },
            { path: '/ok', component: () => document.createElement('div') },
        ]);

        navigate('/nope');
        await new Promise(r => setTimeout(r, 10));
        expect(currentNavError()).toBe('404');

        navigate('/ok');
        await new Promise(r => setTimeout(r, 10));
        expect(currentRoute()?.config.path).toBe('/ok');
        expect(currentNavError()).toBeNull();
    });
});

describe('currentSearch — reactive query string', () => {
    beforeEach(() => { if (typeof history !== 'undefined') history.replaceState(null, '', '/'); });

    it('reflects the query after navigation to a path with a query string', async () => {
        createRouter([
            { path: '/x', component: () => document.createElement('div') },
        ]);

        navigate('/x?page=3');
        await new Promise(r => setTimeout(r, 10));

        // Route matches on the pathname (query stripped) and currentSearch exposes the query.
        expect(currentRoute()?.config.path).toBe('/x');
        expect(currentSearch()).toBe('?page=3');
    });

    it('reacts to setQueryParam', async () => {
        createRouter([
            { path: '/x', component: () => document.createElement('div') },
        ]);

        navigate('/x?page=3');
        await new Promise(r => setTimeout(r, 10));
        expect(currentSearch()).toBe('?page=3');

        setQueryParam('page', '5');
        expect(new URLSearchParams(currentSearch()).get('page')).toBe('5');
    });
});

// `router.md` tells a reader not to write the query string by hand, and the reason it gives is that
// `history.replaceState` moves the address bar and leaves the router's state behind. The test above
// asserts `currentSearch()`; these assert `currentQuery()` — the signal a template and every
// `@search` declaration actually read.
//
// It is a characterisation test, not a fix: it puts the page's warning
// on a measurement instead of on folklore, and both halves are needed for that — the API updating the
// signal is only interesting beside the hand-written write that does not.
describe('the query signal and the two ways to write it', () => {
    beforeEach(() => { destroyRouter(); history.replaceState(null, '', '/'); });

    async function onPage(): Promise<void> {
        createRouter([{ path: '/q', component: () => document.createElement('div') }]);
        navigate('/q?page=1');
        await new Promise(r => setTimeout(r, 10));
    }

    it('setQueryParam updates currentQuery, not only the address bar', async () => {
        await onPage();
        expect(currentQuery().page).toBe('1');

        setQueryParam('page', '2');
        expect(currentQuery().page, 'the signal a template reads did not follow').toBe('2');
        expect(location.search).toBe('?page=2');
    });

    it('null removes the key from both', async () => {
        await onPage();
        setQueryParam('page', null);
        expect(currentQuery().page).toBeUndefined();
        expect(location.search).toBe('');
    });

    it('setQuery replaces the whole query', async () => {
        await onPage();
        setQuery({ sort: 'name' });
        expect(currentQuery()).toEqual({ sort: 'name' });
    });

    it('and a hand-written replaceState does NOT — which is why the page says not to', async () => {
        await onPage();
        history.replaceState(null, '', '/q?page=9');

        expect(location.search, 'the address bar moved').toBe('?page=9');
        expect(currentQuery().page, 'and the router still reports the old value').toBe('1');
    });

    /**
     * Writing the value a parameter already HAS must notify nobody.
     *
     * Both writers rebuild the query as a fresh object, so the identity check inside the signal
     * suppresses nothing: `?status=closed` written over `?status=closed` would re-run every
     * reader of `currentQuery()`. On a page whose filter round-trips through the address — a
     * filter builder writes the source, the page's handler writes the parameter, the parameter
     * feeds the builder's value back — that is a pump with nothing to stop it, and the flush
     * guard breaks the loop at 100 cycles by DROPPING the pending effects. Every computed marked
     * dirty in that flush stays dirty with no reader left to recompute it, and `markDirty`
     * returns early while dirty — so those bindings never run again and the screen freezes in
     * silence.
     */
    it('writing the value a param already has notifies nobody',async () => {
        await onPage();
        let runs = 0;
        const stop = effect(() => { currentQuery(); runs++; });
        expect(runs).toBe(1);

        setQueryParam('page', '1');
        expect(runs, 'setQueryParam re-ran every reader for a value that did not change').toBe(1);

        setQuery({ page: '1' });
        expect(runs, 'setQuery re-ran every reader for a query that did not change').toBe(1);

        setQueryParam('sort', null);
        expect(runs, 'removing a key that was not there is not a change either').toBe(1);

        setQueryParam('page', '2');
        expect(runs, 'and a REAL change still arrives \u2014 the guard must not silence it').toBe(2);
        stop();
    });

    it('neither writer adds a history entry', async () => {
        await onPage();
        const before = history.length;
        setQueryParam('page', '3');
        setQuery({ page: '4' });
        expect(history.length, 'changing a filter should not give the Back button work').toBe(before);
    });
});
