// The generated matcher does not treat '*' as a static segment.
//
// An `isStatic` that tests only for a leading ':' sends '/files/*' down the static branch, where it
// becomes a switch case compared by string equality: the one URL that could reach the route is the
// literal '/files/*'. The behaviour a wildcard has to reproduce is the runtime router's `(.+)`, which spans
// slashes and is exposed as `$rest` — so the generated matcher cannot decide it from `s.length`
// like every other case, and needs a "this many segments or more" test plus a join of the tail.
//
// The parity table proves the behaviour against both routers. This file pins the SHAPE of what is
// emitted, which is where the decisions live: the case must not be static, the tail must be joined
// before it is decoded, and the prefix must still be compared.

import { describe, it, expect } from 'vitest';
import { generateOptimizedRouter, type ScannedRoute } from '../src/plugin-utils';

const route = (path: string): ScannedRoute =>
    ({ path, file: 'x.pdx', tag: 'pdx-x' });

/**
 * Evaluate the generated module's matcher.
 *
 * The core import becomes a destructure of an injected stub — the same transformation the parity
 * suite applies — because the module builds signals at load time and only the matcher is under
 * test here. `resolve` is module-private, so the tail hands it out.
 */
function resolver(paths: string[]): (path: string) => { idx: number; params: Record<string, string> } | null {
    const core = {
        signal: (v: unknown) => Object.assign(() => v, { set: () => {}, peek: () => v }),
        computed: (fn: () => unknown) => fn,
        effect: () => () => {},
    };
    const body = generateOptimizedRouter(paths.map(route))
        .replace(/import\s*\{([^}]*)\}\s*from\s*'@pdxui\/core';?/, 'const {$1} = __core;')
        .replace(/^\s*export\s+/gm, '');
    return new Function('__core', `${body}\nreturn resolve;`)(core) as never;
}

describe('a wildcard route in the generated matcher', () => {
    it('is not emitted as a static switch case', () => {
        const code = generateOptimizedRouter([route('/files/*')]);
        expect(code, 'the wildcard is still compared as a literal string')
            .not.toContain('case "/files/*"');
    });

    it('matches a tail of several segments and names it $rest', () => {
        const resolve = resolver(['/files/*']);
        expect(resolve('/files/a/b.txt')).toEqual({ idx: 0, params: { $rest: 'a/b.txt' } });
    });

    it('matches a tail of one segment', () => {
        const resolve = resolver(['/files/*']);
        expect(resolve('/files/readme.md')).toEqual({ idx: 0, params: { $rest: 'readme.md' } });
    });

    it('does not match the bare prefix — `(.+)` cannot match nothing', () => {
        const resolve = resolver(['/files/*']);
        expect(resolve('/files'), 'the wildcard swallowed its own prefix').toBeNull();
    });

    it('does not match a path that merely starts with the same letters', () => {
        const resolve = resolver(['/files/*']);
        expect(resolve('/filesystem/a')).toBeNull();
    });

    it('compares every segment of a multi-segment prefix', () => {
        const resolve = resolver(['/a/b/*']);
        expect(resolve('/a/b/c/d')).toEqual({ idx: 0, params: { $rest: 'c/d' } });
        expect(resolve('/a/x/c'), 'the middle segment of the prefix was not checked').toBeNull();
    });

    it('decodes the tail AFTER joining it, so an encoded slash stays part of one segment', () => {
        // Decoding each segment first would turn %2F into a separator and change the shape of the
        // path. The runtime decodes its single `(.+)` capture the same way.
        const resolve = resolver(['/files/*']);
        expect(resolve('/files/a%2Fb/c')).toEqual({ idx: 0, params: { $rest: 'a/b/c' } });
    });

    it('a wildcard at the root takes everything', () => {
        const resolve = resolver(['/*']);
        expect(resolve('/anything/at/all')).toEqual({ idx: 0, params: { $rest: 'anything/at/all' } });
        expect(resolve('/'), 'the root wildcard matched an empty tail').toBeNull();
    });

    it('leaves the other kinds of route alone', () => {
        const resolve = resolver(['/about', '/users/:id', '/files/*']);

        expect(resolve('/about')).toEqual({ idx: 0, params: {} });
        expect(resolve('/users/7')).toEqual({ idx: 1, params: { id: '7' } });
        expect(resolve('/files/x')).toEqual({ idx: 2, params: { $rest: 'x' } });
    });

    it('a static route under the same prefix still wins', () => {
        // The generated matcher runs its switch before the dynamic chain, so an exact path is
        // answered by the static case. Asserted rather than assumed: it is the behaviour a reader
        // of the route table would expect, and it is what the emitted shape gives.
        const resolve = resolver(['/files/*', '/files/list']);
        expect(resolve('/files/list')).toEqual({ idx: 1, params: {} });
        expect(resolve('/files/other')).toEqual({ idx: 0, params: { $rest: 'other' } });
    });

    it('the generated module still parses', () => {
        const code = generateOptimizedRouter([route('/files/*'), route('/a/b/*')]);
        const body = code.replace(/^\s*import\s.*$/gm, '').replace(/^\s*export\s+/gm, '');
        expect(() => new Function(body)).not.toThrow();
    });
});

describe('scroll restoration is imported, not re-emitted', () => {
    // This module emits no `_scrollPositions` map and no save/restore pair of its own: beside core's
    // and the runtime router's that would be three implementations of one behaviour, and a fix
    // made to one of them would not reach the others.
    const code = generateOptimizedRouter([route('/a'), route('/b')]);

    it('imports the pair from core', () => {
        expect(code).toMatch(/import\s*\{[^}]*saveScrollPosition[^}]*\}\s*from\s*'@pdxui\/core'/);
        expect(code).toMatch(/import\s*\{[^}]*restoreScrollPosition[^}]*\}\s*from\s*'@pdxui\/core'/);
    });

    it('declares no copy of its own', () => {
        expect(code, 'the generated module still carries its own positions map')
            .not.toContain('_scrollPositions');
        expect(code).not.toContain('function _saveScroll');
        expect(code).not.toContain('function _restoreScroll');
    });

    it('calls them with core argument order — (path, isBack), not (isBack, path)', () => {
        // Swapping the two silently turns "restore
        // where the user was" into "restore where a path named 'true' was", which no assertion on
        // the module text would catch. A third argument, the outlet whose scroll container is
        // restored, follows the two; the order of the first two is what this pins.
        expect(code).toMatch(/restoreScrollPosition\(pathname, isBack[,)]/);
        expect(code).not.toMatch(/restoreScrollPosition\(isBack,/);
    });
});
