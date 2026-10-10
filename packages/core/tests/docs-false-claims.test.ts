// Published pages and source comments must not teach what the code does not do (#38).
//
// Each row is one false claim found at the source: the text that said it, where it must not come
// back, and what is true instead. Code copied from these pages compiled and did the wrong thing, or
// did not compile — an import that does not exist, an optimistic key that never matches, a refetch
// that never happens. A compile-detectable mistake in an example is the strict examples check's job
// (#39); this keeps the prose and the comments from saying it again.

import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const REPO = join(__dirname, '..', '..', '..');

/** Tracked files under the given paths, as repository-relative paths. */
function tracked(...paths: string[]): string[] {
    return execFileSync('git', ['ls-files', ...paths], { cwd: REPO, encoding: 'utf-8' })
        .split('\n').map((s) => s.trim()).filter(Boolean);
}

/** The pages a user or an agent learns from: the site's docs, the skill, the architecture notes. */
const PAGES = tracked('packages/site/content/docs/*.md', 'marketplace/plugins/pdxui/**/*.md', 'docs/**/*.md');

interface Claim { what: string; files: string[]; pattern: RegExp; truth: string }

const CLAIMS: Claim[] = [
    {
        what: 'a `mutate(url, …)` function', files: PAGES, pattern: /\bmutate\(\s*['"`]\//,
        truth: 'no package exports it: a write is `mutation({ fn, invalidate })` from @pdxui/core',
    },
    {
        what: 'the option `invalidates`', files: [...PAGES, 'packages/core/src/reactivity/mutation.ts'],
        pattern: /`invalidates`|\binvalidates\s*:/,
        truth: "mutation()'s option is `invalidate`",
    },
    {
        what: '`$params`', files: PAGES, pattern: /\$params\b/,
        truth: 'no `$params` exists: route params are read with `currentParams()` from @pdxui/router',
    },
    {
        what: 'an `@fetch` with no method', files: [...PAGES, 'packages/core/src/reactivity/resource.ts'],
        pattern: /@fetch \w+: '\//,
        truth: "the method is part of the string, `'GET /api/users'`; without it the declaration is PDX_FETCH_INVALID",
    },
    {
        what: '@fetch refetching on focus and reconnect', files: ['packages/site/content/docs/data.md'],
        pattern: /refetchOnFocus and refetchOnReconnect are true/,
        truth: 'those listeners are useQuery\'s; resource(), which @fetch compiles to, has none',
    },
    {
        what: "an optimistic key `'/api/users'`", files: ['packages/site/content/docs/data.md'],
        pattern: /key: '\/api\/users'/,
        truth: "@fetch caches under `'GET:/api/users'`",
    },
    {
        what: 'automatic batching of synchronous writes',
        files: [...PAGES, 'packages/core/src/reactivity/signal.ts'],
        pattern: /auto-batched|batched automatically/i,
        truth: 'each write outside batch() flushes at once',
    },
    {
        what: '`users.value()` on a resource', files: ['packages/compiler/src/diagnostics/catalog-defects.ts'],
        pattern: /users\.value\(\)/,
        truth: 'a resource has `data()`, not `value()`',
    },
    {
        what: 'the virtualizer\'s consumers', files: ['packages/core/src/renderer/virtualizer.ts'],
        pattern: /Used by: DataGrid/,
        truth: 'only pdx-select uses it',
    },
    {
        what: 'a bare signal in the template being a ReferenceError',
        files: ['marketplace/plugins/pdxui/skills/pdxui/references/gotchas.md'],
        pattern: /signalBare[^\n]*ReferenceError/,
        truth: '`{{ count }}` for a $signal compiles and is reactive',
    },
    {
        what: 'a ref property as the preferred way to control a component',
        files: ['packages/site/content/docs/imperative-methods.md'],
        pattern: /This is the preferred way to \*control\* a component/,
        truth: 'the declarative prop is; the ref is for what a prop cannot express',
    },
    {
        what: 'exported functions in a @store module', files: ['packages/site/content/docs/store.md'],
        pattern: /^\s*export function/m,
        truth: 'actions live inside the store; its exports are lifted out of it (PDX_STORE_EXPORT)',
    },
];

describe('no page or comment teaches what the code does not do', () => {
    it('found the pages, so the checks below are not vacuous', () => {
        expect(PAGES).toEqual(expect.arrayContaining(['packages/site/content/docs/data.md']));
        expect(PAGES.length).toBeGreaterThan(30);
    });

    for (const c of CLAIMS) {
        it(c.what, () => {
            const found = c.files.flatMap((f) => readFileSync(join(REPO, f), 'utf-8').split('\n')
                .map((line, i) => (c.pattern.test(line) ? `${f}:${i + 1}: ${line.trim()}` : ''))
                .filter(Boolean));
            expect(found, `false: ${c.truth}`).toEqual([]);
        });
    }
});
