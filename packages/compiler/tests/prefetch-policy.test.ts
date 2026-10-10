// A route's `@prefetch` names a policy the router has, or the compiler says so (#42).
//
// The router normalised anything it did not know to `hover`, so `@prefetch 'viewport'` — documented
// here, implemented nowhere — compiled and behaved as `hover` with no word. The router now has
// `viewport`; any other name is an error at compile time.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { analyzeScript } from '../src/compiler/script-analyzer';
import { PREFETCH_POLICIES } from '../src/compiler/script-analyzer-helpers';

const codes = (script: string): string[] => analyzeScript(script, 'page.pdx').warnings.map((w) => w.code);

describe('@prefetch', () => {
    it('an unknown policy is an error that lists the four', () => {
        const w = analyzeScript(`@page '/x';\n@prefetch 'visible';`, 'page.pdx').warnings
            .find((x) => x.code === 'PDX_PREFETCH_POLICY');
        expect(w, `'visible' compiled and would have behaved as hover`).toBeDefined();
        expect(w!.severity).toBe('error');
        expect(w!.hint).toContain('viewport');
    });

    it('the same in the @page options block', () => {
        expect(codes(`@page '/x' { prefetch: 'sometimes' };`)).toContain('PDX_PREFETCH_POLICY');
    });

    it('control — every policy the router has is accepted, viewport included', () => {
        for (const p of PREFETCH_POLICIES) {
            expect(codes(`@page '/x';\n@prefetch '${p}';`), p).not.toContain('PDX_PREFETCH_POLICY');
        }
    });

    it('the list is the router\'s, read from its source — the two cannot drift apart', () => {
        const source = readFileSync(join(__dirname, '..', '..', 'router', 'src', 'prefetch.ts'), 'utf8');
        // Match: PREFETCH_POLICIES … = ['hover', …];   Groups: [1]=the list's contents
        const list = /PREFETCH_POLICIES[^=]*=\s*\[([^\]]*)\]/.exec(source)?.[1] ?? '';
        const router = [...list.matchAll(/'([^']+)'/g)].map((m) => m[1]).sort();
        expect(router.length, 'PREFETCH_POLICIES was not found in the router').toBeGreaterThan(2);
        expect([...PREFETCH_POLICIES].sort()).toEqual(router);
    });
});
