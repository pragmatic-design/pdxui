// The registry entries of #506: the anonymous `@loader` and its untyped readers leave the language.
//
// `@loader loadUser;` is PDX_REMOVED_FORM, rewritten to `@loader loadUser: loadUser;`;
// `currentLoaderData()` / `currentLoaderState()` are rewritten to the page's loader where it has one,
// and flagged where it has none; a loader reading `location` or `currentParams()` is flagged. The
// runtime half is packages/router/tests/outlet-named-loader.test.ts, the migration
// packages/cli/tests/migrate-loader.test.ts.

import { describe, it, expect } from 'vitest';
import { compile } from '../src/plugin';
import { loaderAnonymous, loaderReaders, loaderReadsAddress } from '../src/language/loader-forms';

const fix = (c: { fix: unknown }, text: string) => (c.fix as (t: string) => string)(text);

const ANONYMOUS = [
    '<template><p>{{ currentLoaderState() }}: {{ currentLoaderData()?.name }}</p></template>',
    '<script>',
    "@page '/users/:id';",
    '@loader loadUser;',
    '// @loader commented;',
    'async function loadUser() {',
    "  const id = location.pathname.split('/').pop();",
    '  return { name: id };',
    '}',
    'const user = $derived(currentLoaderData());',
    '</script>',
    '',
].join('\n');

describe('the anonymous @loader', () => {
    it('is found at its line, not in a comment', () => {
        expect(loaderAnonymous.detect(ANONYMOUS)).toEqual([{ line: 4, found: '@loader loadUser;' }]);
    });

    it('is rewritten to the named form, named after its function, and a second pass finds nothing', () => {
        const out = fix(loaderAnonymous, ANONYMOUS);
        expect(out).toContain('\n@loader loadUser: loadUser;\n');
        expect(out).toContain('// @loader commented;');
        expect(loaderAnonymous.detect(out)).toEqual([]);
    });

    it('is PDX_REMOVED_FORM in a compiled .pdx; the named form is not', () => {
        const removed = (src: string) => compile(src, 'pages/user.pdx', [], undefined, {}).warnings
            .filter((w) => w.code === 'PDX_REMOVED_FORM' && w.message.includes('@loader'));
        expect(removed(ANONYMOUS).map((w) => w.line)).toEqual([4]);
        expect(removed(fix(loaderAnonymous, ANONYMOUS))).toEqual([]);
    });
});

describe('currentLoaderData() / currentLoaderState()', () => {
    it('are found in the template and the script', () => {
        expect(loaderReaders.detect(ANONYMOUS).map((f) => [f.line, f.found])).toEqual([
            [1, 'currentLoaderState()'], [1, 'currentLoaderData()'], [10, 'currentLoaderData()'],
        ]);
    });

    it("are rewritten to the page's loader, after the anonymous one is named", () => {
        const out = fix(loaderReaders, fix(loaderAnonymous, ANONYMOUS));
        expect(out).toContain('{{ loadUser.state() }}: {{ loadUser.data()?.name }}');
        expect(out).toContain('const user = $derived(loadUser.data());');
        expect(loaderReaders.detect(out)).toEqual([]);
    });

    it('take the name a named loader declares', () => {
        const named = ANONYMOUS.replace('@loader loadUser;', '@loader person: loadUser;');
        expect(fix(loaderReaders, named)).toContain('{{ person.state() }}');
    });

    it('control — a .pdx with no loader is left as written, for a person', () => {
        const child = '<template><p>{{ currentLoaderData()?.name }}</p></template>\n<script>\n</script>\n';
        expect(fix(loaderReaders, child)).toBe(child);
        expect(loaderReaders.detect(child)).toHaveLength(1);
    });

    it("control — an apostrophe in the template's text does not hide a reader after it", () => {
        const text = "<template><p>It's {{ currentLoaderData() }}</p></template>\n<script>\n@loader load: loadIt;\n</script>\n";
        expect(fix(loaderReaders, text)).toContain("It's {{ load.data() }}");
    });
});

describe('a loader that reads the address itself', () => {
    it('is flagged where its body reads location or currentParams()', () => {
        expect(loaderReadsAddress.detect(ANONYMOUS)).toEqual([{ line: 7, found: 'location.' }]);
        const arrow = "<script>\n@loader user: load;\nconst load = async () => {\n  return fetch('/u/' + currentParams().id);\n};\n</script>\n";
        expect(loaderReadsAddress.detect(arrow)).toEqual([{ line: 4, found: 'currentParams(' }]);
        expect(loaderReadsAddress.fix).toBe('flag');
    });

    it('control — the form the router hands it, and a read outside the loader, are not', () => {
        const text = "<script>\n@loader user: load;\nasync function load({ params, signal }) {\n  return fetch('/u/' + params.id, { signal });\n}\nconst here = location.pathname;\n</script>\n";
        expect(loaderReadsAddress.detect(text)).toEqual([]);
    });
});
