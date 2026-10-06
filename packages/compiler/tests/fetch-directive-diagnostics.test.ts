// C5 + C6 — diagnostics for silent-failure paths in the compiler.
// C5: a malformed @fetch must not be dropped silently (it would break the
//     component with no error). C6: two plugins claiming the same template
//     directive must surface a collision warning instead of silent last-wins.

import { describe, it, expect, vi } from 'vitest';
import { analyzeScript } from '../src/compiler/script-analyzer';
import { PluginRunner, type CompilerPlugin } from '../src/plugin-system';

describe('C5 — @fetch invalid declaration', () => {
    it('emits PDX_FETCH_INVALID for a @fetch missing the METHOD /url spec', () => {
        const analysis = analyzeScript(`
            @fetch users: 'just-a-url-no-method';
            let count = $signal(0);
        `, 'test.pdx');

        const fetchErr = analysis.warnings.find(w => w.code === 'PDX_FETCH_INVALID');
        expect(fetchErr).toBeDefined();
        expect(fetchErr!.severity).toBe('error');
        expect(fetchErr!.hint).toContain('@fetch users:');
    });

    it('does not warn on a well-formed @fetch', () => {
        const analysis = analyzeScript(`
            @fetch users: 'GET /api/users' as string[];
            let count = $signal(0);
        `, 'test.pdx');

        expect(analysis.warnings.find(w => w.code === 'PDX_FETCH_INVALID')).toBeUndefined();
    });
});

describe('C6 — template directive collision', () => {
    it('warns when two plugins register the same @directive', () => {
        const handler = { generate: () => '' };
        const a: CompilerPlugin = { name: 'a', templateDirectives: { highlight: handler } };
        const b: CompilerPlugin = { name: 'b', templateDirectives: { highlight: handler } };

        const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});
        try {
            const runner = new PluginRunner([a, b], 'test.pdx', 'pdx-test');
            runner.getTemplateDirectives();
            expect(spy).toHaveBeenCalledWith(expect.stringContaining('@highlight'));
        } finally {
            spy.mockRestore();
        }
    });

    it('does not warn for distinct directive names', () => {
        const handler = { generate: () => '' };
        const a: CompilerPlugin = { name: 'a', templateDirectives: { foo: handler } };
        const b: CompilerPlugin = { name: 'b', templateDirectives: { bar: handler } };

        const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});
        try {
            const runner = new PluginRunner([a, b], 'test.pdx', 'pdx-test');
            runner.getTemplateDirectives();
            expect(spy).not.toHaveBeenCalled();
        } finally {
            spy.mockRestore();
        }
    });
});
