// plugin-utils is what the Vite plugin does BETWEEN compiling a file and handing it to the bundler:
// scanning the project for stores and routes, injecting the imports the author did not write, and
// judging static enum attributes. It sat at 41% branch coverage — the lowest in the package — so the
// rules below existed only as code.
//
// The scans use a real temporary tree rather than a mocked fs: what they are actually asserting is
// which files get skipped, and a mock would only re-state the filter it is supposed to check.

import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
    scanForStores, scanForRoutes, injectStoreImports, injectComponentImports,
    generateOptimizedRouter, type ScannedRoute,
} from '../src/plugin-utils';
import { ComponentResolver } from '../src/component-resolver';
import { scanNoImportTags } from '../src/no-import-tags';
import { checkEnumValues } from '../src/compiler/validate-enums';
import { parseTemplate } from '../src/parser/template';
import type { ValidationWarning } from '../src/compiler/validate';

/** validate()'s enum check on a template alone. */
function enumFindings(tpl: string, r: ComponentResolver, _file: string): ValidationWarning[] {
    const out: ValidationWarning[] = [];
    checkEnumValues(parseTemplate(tpl), (t, p) => r.enumValues(t, p), out);
    return out;
}

// The real scan, counted: it reads every package's sources, and where it runs decides whose time
// budget pays for the disk.
vi.mock('../src/no-import-tags', async (importOriginal) => {
    const real = await importOriginal<typeof import('../src/no-import-tags')>();
    return { ...real, scanNoImportTags: vi.fn(real.scanNoImportTags) };
});

let root: string;

function write(rel: string, content: string): string {
    const full = join(root, rel);
    mkdirSync(join(full, '..'), { recursive: true });
    writeFileSync(full, content);
    return full.replace(/\\/g, '/');
}

beforeEach(() => { root = mkdtempSync(join(tmpdir(), 'pdx-plugin-utils-')); });
afterEach(() => { vi.restoreAllMocks(); rmSync(root, { recursive: true, force: true }); });

describe('finding the stores in a project', () => {
    it('registers a @store by its declared name, from .pdx and .pdx.ts alike', () => {
        write('src/cart.pdx', '<script setup>\n  @store cart;\n</script>');
        write('src/user.pdx.ts', '// @store user\n');

        const registry = new Map<string, string>();
        scanForStores(root, registry);

        expect([...registry.keys()].sort()).toEqual(['cart', 'user']);
    });

    it('skips node_modules, dist and dot-directories', () => {
        write('node_modules/dep/x.pdx', '@store dep;');
        write('dist/built.pdx', '@store built;');
        write('.cache/tmp.pdx', '@store tmp;');
        write('src/real.pdx', '@store real;');

        const registry = new Map<string, string>();
        scanForStores(root, registry);

        expect([...registry.keys()]).toEqual(['real']);
    });

    it('ignores a .pdx file with no @store at all', () => {
        write('src/plain.pdx', '<template><div/></template>');
        const registry = new Map<string, string>();
        scanForStores(root, registry);
        expect(registry.size).toBe(0);
    });

    it('does not throw on a directory that does not exist', () => {
        const registry = new Map<string, string>();
        expect(() => scanForStores(join(root, 'nope'), registry)).not.toThrow();
        expect(registry.size).toBe(0);
    });
});

describe('finding the routes in a project', () => {
    it('records the path, the file and a tag derived from the filename', () => {
        write('src/dashboard.pdx', "<script setup>\n  @page '/dashboard';\n</script>");

        const routes: ScannedRoute[] = [];
        scanForRoutes(root, routes);

        expect(routes).toHaveLength(1);
        expect(routes[0].path).toBe('/dashboard');
        expect(routes[0].tag).toBe('pdx-dashboard');
        expect(routes[0].file).toContain('/src/dashboard.pdx');
        expect(routes[0].guard).toBeUndefined();
    });

    it('prefers an explicit @tag over the filename', () => {
        write('src/dashboard.pdx', "@page '/d';\n@tag 'pdx-my-dash';");
        const routes: ScannedRoute[] = [];
        scanForRoutes(root, routes);
        expect(routes[0].tag).toBe('pdx-my-dash');
    });

    it('carries the @guard through, because the generated router needs it', () => {
        write('src/admin.pdx', "@page '/admin';\n@guard 'admin.access';");
        const routes: ScannedRoute[] = [];
        scanForRoutes(root, routes);
        expect(routes[0].guard).toBe('admin.access');
    });

    it('carries both forms of @redirect, which are different directives sharing a name', () => {
        // `@redirect '/x' -> '/y'` is a TABLE entry: navigating to /x lands on /y, and /x need not
        // be a route at all. `@redirect '/y'` redirects THIS route. Reading them as one thing is
        // how a redirect table silently becomes a self-redirect.
        write('src/legacy.pdx', "@page '/legacy';\n@redirect '/about';\n@redirect '/old' -> '/new';");
        const routes: ScannedRoute[] = [];
        scanForRoutes(root, routes);
        expect(routes[0].redirect).toBe('/about');
        expect(routes[0].redirects).toEqual([{ from: '/old', to: '/new' }]);
    });

    it('reads @meta { … } as route metadata and leaves @meta name: … alone', () => {
        // The same directive spells two unrelated things: a block is route meta, a `name:` pair is
        // an HTML head tag. The scanner has to tell them apart on the `{`, as script-analyzer does.
        write('src/about.pdx', "@page '/about';\n@meta { breadcrumb: 'About', nested: { depth: 2 } };\n@meta description: 'A page';");
        const routes: ScannedRoute[] = [];
        scanForRoutes(root, routes);
        expect(routes[0].meta).toEqual({ breadcrumb: 'About', nested: { depth: 2 } });
    });

    it('leaves meta undefined when the only @meta is a head tag', () => {
        write('src/seo.pdx', "@page '/seo';\n@meta description: 'Only a head tag';");
        const routes: ScannedRoute[] = [];
        scanForRoutes(root, routes);
        expect(routes[0].meta).toBeUndefined();
    });

    it('ignores .pdx.ts — a route is a component, not a schema', () => {
        // scanForStores accepts .pdx.ts and this does not. The asymmetry is deliberate and worth
        // pinning: a store can be declared in a schema file, a page cannot.
        write('src/thing.pdx.ts', "@page '/thing';");
        const routes: ScannedRoute[] = [];
        scanForRoutes(root, routes);
        expect(routes).toEqual([]);
    });
});

describe('injecting the store hook imports the author did not write', () => {
    const registry = () => new Map([['cart', '/proj/src/cart.pdx']]);

    it('does nothing when no store is registered', () => {
        const code = 'const c = useCart();';
        expect(injectStoreImports(code, '/proj/src/app.pdx', new Map())).toBe(code);
    });

    it('adds the import for a hook used but not imported', () => {
        const out = injectStoreImports('const c = useCart();', '/proj/src/app.pdx', registry());
        expect(out).toContain("import { useCart } from './cart.pdx';");
    });

    it('places it after the last existing import', () => {
        const out = injectStoreImports(
            "import { signal } from '@pdxui/core';\nconst c = useCart();",
            '/proj/src/app.pdx',
            registry(),
        );
        const lines = out.split('\n');
        expect(lines[0]).toContain('@pdxui/core');
        expect(lines[1]).toContain('useCart');
    });

    it('puts it first when the file has no imports at all', () => {
        const out = injectStoreImports('const c = useCart();', '/proj/src/app.pdx', registry());
        expect(out.split('\n')[0]).toContain('useCart');
    });

    it('does not add one the author already wrote', () => {
        const code = "import { useCart } from '../stores/cart';\nconst c = useCart();";
        expect(injectStoreImports(code, '/proj/src/app.pdx', registry())).toBe(code);
    });

    it('does not make the store file import itself', () => {
        const code = 'export function useCart() {}';
        expect(injectStoreImports(code, '/proj/src/cart.pdx', registry())).toBe(code);
    });

    it('leaves a useXxx call alone when no store of that name exists', () => {
        const code = 'const s = useSomethingElse();';
        expect(injectStoreImports(code, '/proj/src/app.pdx', registry())).toBe(code);
    });
});

describe('injecting the component imports for tags used in the template', () => {
    const uiResolver = () => {
        const r = new ComponentResolver();
        r.registerUiManifest();
        return r;
    };

    // The first unknown tag makes a resolver scan every package's sources, once, and cache it on the
    // instance. Done here, under the hook's own timeout: in a test it takes 185ms alone and 5249ms
    // under a loaded machine, past the test's 5s. Not a longer test timeout — that
    // would also let a genuinely slow warning path through.
    let scanned: ComponentResolver;
    beforeAll(() => {
        scanned = uiResolver();
        scanned.knownWithoutImport('pdx-warm-the-scan');
    });

    it('does nothing when the resolver knows no components', () => {
        const code = 'export default {};';
        expect(injectComponentImports(code, 'a.pdx', '<template><pdx-button/></template>', new ComponentResolver()))
            .toBe(code);
    });

    it('does nothing when the source has no template', () => {
        const code = 'export default {};';
        expect(injectComponentImports(code, 'a.pdx', '<script setup></script>', uiResolver())).toBe(code);
    });

    it('does nothing when the template uses no pdx-* tag', () => {
        const code = 'export default {};';
        expect(injectComponentImports(code, 'a.pdx', '<template><div/></template>', uiResolver())).toBe(code);
    });

    it('reads an external template when one is given, in preference to the source', () => {
        // <template src="..."> — the tags live in the resolved file, not in the .pdx.
        const out = injectComponentImports(
            'export default {};',
            'a.pdx',
            '<template src="./t.html"></template>',
            uiResolver(),
            '<pdx-button/>',
        );
        expect(out).toContain("import '@pdxui/ui/button';");
    });

    it('matches the tag whatever case it was written in', () => {
        const out = injectComponentImports('x', 'a.pdx', '<template><PDX-Button/></template>', uiResolver());
        expect(out).toContain("import '@pdxui/ui/button';");
    });

    it('warns about a pdx-* tag nothing can resolve', () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        const scansBefore = vi.mocked(scanNoImportTags).mock.calls.length;
        injectComponentImports('x', 'a.pdx', '<template><pdx-nope-here/></template>', scanned);
        expect(vi.mocked(scanNoImportTags).mock.calls.length - scansBefore,
            'the monorepo scan ran inside this test: its 5s budget paid for the disk, not for the warning').toBe(0);
        expect(warn).toHaveBeenCalledTimes(1);
        expect(String(warn.mock.calls[0][0])).toContain('PDX_UNRESOLVED_COMPONENT');
        expect(String(warn.mock.calls[0][0])).toContain('pdx-nope-here');
    });

    it('does not warn about the file’s own tag, which is a recursive component and not a mistake', () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        injectComponentImports('x', 'src/tree-node.pdx', '<template><pdx-tree-node/></template>', uiResolver());
        expect(warn).not.toHaveBeenCalled();
    });
});

describe('judging static enum attributes', () => {
    const r = new ComponentResolver();
    r.registerUiManifest();
    const allowed = r.enumValues('pdx-button', 'variant') ?? [];

    it('accepts a value the manifest declares', () => {
        expect(allowed.length, 'no variant enum to test against').toBeGreaterThan(0);
        const w = enumFindings(`<pdx-button variant="${allowed[0]}"/>`, r, 'a.pdx');
        expect(w).toEqual([]);
    });

    it('reports a value it does not, and lists what is allowed', () => {
        const w = enumFindings('<pdx-button variant="solidish"/>', r, 'a.pdx');
        expect(w).toHaveLength(1);
        expect(w[0].code).toBe('PDX_INVALID_ENUM_VALUE');
        expect(w[0].severity).toBe('warn');
        expect(w[0].message).toContain('solidish');
        expect(w[0].hint).toContain(allowed[0]);
    });

    it('says nothing about a bound attribute, whose value it cannot know', () => {
        expect(enumFindings('<pdx-button :variant="v"/>', r, 'a.pdx')).toEqual([]);
    });

    it('says nothing about an interpolated attribute either', () => {
        expect(enumFindings('<pdx-button variant="{v}"/>', r, 'a.pdx')).toEqual([]);
    });

    it('says nothing about a tag with no enums in the manifest', () => {
        expect(enumFindings('<pdx-nope variant="anything"/>', r, 'a.pdx')).toEqual([]);
    });

    it('says nothing about an attribute that is not an enum prop', () => {
        expect(enumFindings('<pdx-button id="save"/>', r, 'a.pdx')).toEqual([]);
    });

    it('handles a self-closing tag and a normal one the same way', () => {
        const a = enumFindings('<pdx-button variant="solidish"/>', r, 'a.pdx');
        const b = enumFindings('<pdx-button variant="solidish">x</pdx-button>', r, 'a.pdx');
        expect(b).toHaveLength(a.length);
    });
});

describe('the generated router module', () => {
    it('is a whole router that matches nothing when the project has no @page', () => {
        // Not a two-line stub — `export const routes = []` and nothing else: this module IS
        // packages/router/src/active.ts in a production build, so a stub is a build that fails on
        // every other import, in production only. An app can legitimately have no @page yet.
        const out = generateOptimizedRouter([]);

        expect(out).toMatch(/export const routes = \[\s*\]/);
        expect(out, 'nothing to match, so nothing to switch on').not.toContain('switch (path)');
        expect(out, 'the module has to answer every import @pdxui/router makes').toContain('export function navigate');
        expect(out).toContain('export function createRouter');
    });

    it('emits a switch case for a static route', () => {
        const out = generateOptimizedRouter([{ path: '/about', file: 'a.pdx', tag: 'pdx-about' }]);
        expect(out).toContain('switch (path)');
        expect(out).toContain('case "/about"');
    });

    it('emits a length check and a decoded param for a dynamic route', () => {
        const out = generateOptimizedRouter([{ path: '/users/:id', file: 'u.pdx', tag: 'pdx-users' }]);
        expect(out).toContain('s.length === 2');
        expect(out).toContain('s[0] === "users"');
        expect(out).toContain('"id": decodeURIComponent(s[1])');
    });

    it('carries a guard into the route table, and omits the key when there is none', () => {
        const guarded = generateOptimizedRouter([{ path: '/a', file: 'a.pdx', tag: 'pdx-a', guard: 'admin' }]);
        expect(guarded).toContain('guard: "admin"');
        const plain = generateOptimizedRouter([{ path: '/a', file: 'a.pdx', tag: 'pdx-a' }]);
        expect(plain).not.toContain('guard:');
    });

    it('escapes a path rather than pasting it into the generated source', () => {
        // JSON.stringify is what stands between a route path and broken (or injectable) output.
        const out = generateOptimizedRouter([{ path: '/a\'b"c', file: 'a.pdx', tag: 'pdx-a' }]);
        expect(out).toContain(JSON.stringify('/a\'b"c'));
    });
});
