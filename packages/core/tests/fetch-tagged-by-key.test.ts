// Every @fetch is tagged with its own cache key, so `invalidate(['GET:/api/users'])` reaches it (#282).
//
// An array given to `invalidate` matches TAGS — the documented contract — and an @fetch had no tags
// unless its author wrote some, so the form the beta specification uses for `@action … with
// { invalidate: ['GET:/api/users'] }` invalidated nothing: the list kept its old rows. The compiler
// now tags each @fetch with its key (owner decision, 2026-10-11), and an author's tags sit beside it.

import { describe, it, expect, vi, afterEach } from 'vitest';
import * as core from '../src/index';
import { compile } from '../../compiler/src/plugin';

const settle = async () => { for (let i = 0; i < 5; i++) await new Promise((r) => setTimeout(r, 0)); };

/** Compile a `.pdx` source and run its module against core (render-parity's bridge). */
function defineCompiled(name: string, src: string): void {
    const { code } = compile(src, `${name}.pdx`, [], undefined, {});
    const body = code.replace(/^\s*import\s*\{([^}]*)\}\s*from\s*'@pdxui\/core';?\s*$/gm, 'const {$1} = __core;');
    new Function('__core', body)(core);
}

function stubFetch() {
    const fetch = vi.fn(async () => new Response('["ada"]', { status: 200, headers: { 'content-type': 'application/json' } }));
    vi.stubGlobal('fetch', fetch);
    core.setDefaultClient(core.createHttpClient({ retry: false, timeout: 0 }));
    return fetch;
}

const tagsOf = (key: string) => core.getDefaultCache().get(key)?.tags;

afterEach(() => {
    vi.unstubAllGlobals();
    document.body.innerHTML = '';
});

describe('an @fetch is tagged with its own key', () => {
    it('the entry carries the key as a tag, and invalidate([key]) reaches it', async () => {
        const fetch = stubFetch();
        defineCompiled('tagkeyplain', "<template><p>{{ users.data()?.length ?? 0 }}</p></template>\n"
            + "<script setup>\n@fetch users: 'GET /api/tag-plain' as string[];\n</script>\n");
        document.body.appendChild(document.createElement('app-tagkeyplain'));
        await settle();
        expect(tagsOf('GET:/api/tag-plain'), 'the @fetch entry is not tagged with its key').toContain('GET:/api/tag-plain');

        const calls = fetch.mock.calls.length;
        expect(core.getDefaultCache().invalidate(['GET:/api/tag-plain']), 'invalidate by key in the array form reached nothing').toBe(1);
        await settle();
        expect(fetch.mock.calls.length, 'the invalidated @fetch did not refetch').toBe(calls + 1);
    });

    it('an author\'s own tags sit beside the key', async () => {
        stubFetch();
        defineCompiled('tagkeyauthor', "<template><p>{{ users.data()?.length ?? 0 }}</p></template>\n"
            + "<script setup>\n@fetch users: 'GET /api/tag-author' as string[] { tags: ['users'] };\n</script>\n");
        document.body.appendChild(document.createElement('app-tagkeyauthor'));
        await settle();
        expect(tagsOf('GET:/api/tag-author')).toEqual(expect.arrayContaining(['GET:/api/tag-author', 'users']));
    });

    it('a reactive URL is tagged with the key it resolves to, and a new key with the new one', async () => {
        stubFetch();
        defineCompiled('tagkeyreactive', "<template><p>{{ user.data()?.length ?? 0 }}</p><button @click=\"id = 2\">2</button></template>\n"
            + "<script setup>\nlet id = $signal(1);\n@fetch user: 'GET /api/tag-r/${id}' as string[];\n</script>\n");
        const el = document.createElement('app-tagkeyreactive');
        document.body.appendChild(el);
        await settle();
        expect(tagsOf('GET:/api/tag-r/1')).toContain('GET:/api/tag-r/1');

        el.querySelector('button')!.click();
        await settle();
        expect(tagsOf('GET:/api/tag-r/2'), 'the new entry is not tagged with its own key').toContain('GET:/api/tag-r/2');
        expect(tagsOf('GET:/api/tag-r/2')).not.toContain('GET:/api/tag-r/1');
    });

    it('control: a resource created by hand with tags keeps exactly those', async () => {
        const cache = core.createCache({ gcInterval: 0 });
        const r = core.resource(async () => 'v', { key: 'by-hand', tags: ['x'], cache });
        await settle();
        expect(cache.get('by-hand')?.tags).toEqual(['x']);
        r.dispose();
    });

    it('a resource can take its tags as a function of the key it resolved', async () => {
        const cache = core.createCache({ gcInterval: 0 });
        const r = core.resource(async () => 'v', { key: 'fn-key', tags: (k: string) => [k, 'extra'], cache });
        await settle();
        expect(cache.get('fn-key')?.tags).toEqual(['fn-key', 'extra']);
        r.dispose();
    });
});
