// The registry entries of #141: the alpha async names leave the language.
//
// `x.isPending()` is rewritten to `x.pending()`; `loading()`, `status()`, `isLoading()`, `hasData()`,
// `isStale()` and comparisons of `state()` with a removed value are flagged; a route loader's
// `'loading'`/`'done'` become `'pending'`/`'success'`. Only names the file declares as an async source
// are read, so a DataSource's own `isLoading()` is left alone. The runtime half is
// packages/core/tests/async-contract.test.ts.

import { describe, it, expect } from 'vitest';
import { compile } from '../src/plugin';
import {
    asyncIsPending, asyncIsPendingScript, asyncAlphaNames, asyncAlphaNamesScript, loaderStateWords, loaderStateWordsScript,
} from '../src/language/async-vocabulary';

const fix = (c: { fix: unknown }, text: string) => (c.fix as (t: string) => string)(text);

describe('x.isPending() → x.pending()', () => {
    const pdx = "<template>@if (users.isPending()) { <i>…</i> }</template>\n<script>\n@fetch users: 'GET /api/u' as string[];\nconst busy = $derived(users.isPending());\n</script>\n";

    it('the template is the pdx entry\'s, the script the script entry\'s: each place once', () => {
        expect(asyncIsPending.detect(pdx).map((f) => f.found)).toEqual(['users.isPending()']);
        const script = pdx.slice(pdx.indexOf('<script>') + '<script>'.length, pdx.indexOf('</script>'));
        expect(asyncIsPendingScript.detect(script).map((f) => f.found)).toEqual(['users.isPending()']);
    });

    it('is rewritten in a .ts module', () => {
        const ts = "import { resource } from '@pdxui/core';\nconst users = resource(load);\nif (users.isPending()) spin();\n";
        expect(fix(asyncIsPendingScript, ts)).toContain('if (users.pending()) spin();');
        expect(asyncIsPendingScript.detect(fix(asyncIsPendingScript, ts))).toEqual([]);
    });

    it('a .pdx that still writes it is PDX_REMOVED_FORM', () => {
        const r = compile(pdx, 'list.pdx', [], undefined, {});
        expect(r.warnings.filter((w) => w.code === 'PDX_REMOVED_FORM').length, 'template and script, once each').toBe(2);
    });

    it('control — a DataSource\'s isLoading(), and a method of anything else, is not touched', () => {
        const ts = "const ds = createDataSource({ load });\nif (ds.isLoading()) spin();\nconst job = { isPending: () => true };\njob.isPending();\n";
        expect(asyncIsPendingScript.detect(ts)).toEqual([]);
        expect(asyncAlphaNamesScript.detect(ts)).toEqual([]);
    });
});

describe('the alpha names with no one-word replacement are flagged', () => {
    it('loading(), status(), isLoading(), hasData(), isStale(), and state() compared with a removed value', () => {
        const ts = "const q = useQuery(load, { key: 'k' });\nq.loading(); q.status(); q.isLoading(); q.hasData(); q.isStale();\nif (q.state() === 'reloading') {}\nif (q.state() === 'success') {}\n";
        expect(asyncAlphaNamesScript.detect(ts).map((f) => f.found)).toEqual([
            'q.loading()', 'q.status()', 'q.isLoading()', 'q.hasData()', 'q.isStale()', "q.state() === 'reloading'",
        ]);
        expect(asyncAlphaNamesScript.fix).toBe('flag');
    });

    it('in a template, against an @fetch', () => {
        const pdx = "<template>@if (users.loading()) { <i>…</i> }</template>\n<script>\n@fetch users: 'GET /api/u' as string[];\n</script>\n";
        expect(asyncAlphaNames.detect(pdx).map((f) => f.found)).toEqual(['users.loading()']);
    });
});

describe('a route loader\'s state words', () => {
    it("'loading' and 'done' become 'pending' and 'success'; the others are left", () => {
        const ts = "if (currentLoaderState() === 'loading') {}\nif (loaderState('/x') !== \"done\") {}\nif (currentLoaderState() === 'error') {}\n";
        expect(loaderStateWordsScript.detect(ts).length).toBe(2);
        const out = fix(loaderStateWordsScript, ts);
        expect(out).toContain("currentLoaderState() === 'pending'");
        expect(out).toContain('loaderState(\'/x\') !== "success"');
        expect(out).toContain("currentLoaderState() === 'error'");
        expect(loaderStateWordsScript.detect(out)).toEqual([]);
    });

    it('in a template', () => {
        const pdx = "<template>@if (currentLoaderState() === 'done') { <p>ok</p> }</template>\n<script>\nlet a = $signal(1);\n</script>\n";
        expect(fix(loaderStateWords, pdx)).toContain("currentLoaderState() === 'success'");
    });
});
