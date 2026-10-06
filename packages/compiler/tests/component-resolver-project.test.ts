// The project half of ComponentResolver: project components and import generation — scanning a
// project for .pdx files, the precedence rules between library and project tags, and the import
// statements the plugin actually emits.
//
// Each case is a rule the resolver enforces, not a line to execute: the library wins over a project
// file, the first project file wins over the second, a component never imports itself, and an import
// the author already wrote is never duplicated.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ComponentResolver } from '../src/component-resolver';

let root: string;

/** Write a .pdx file, creating its directory. The content is only ever scanned for `@tag`. */
function pdx(rel: string, content = '<template><div/></template>'): string {
    const full = join(root, rel);
    mkdirSync(join(full, '..'), { recursive: true });
    writeFileSync(full, content);
    return full.replace(/\\/g, '/');
}

beforeEach(() => { root = mkdtempSync(join(tmpdir(), 'pdx-resolver-')); });
afterEach(() => { vi.restoreAllMocks(); rmSync(root, { recursive: true, force: true }); });

describe('scanning a project for components', () => {
    it('registers src/ and pages/ by default, and nothing else', () => {
        pdx('src/user-card.pdx');
        pdx('pages/dashboard.pdx');
        pdx('elsewhere/hidden.pdx');

        const r = new ComponentResolver();
        r.registerProjectComponents(root);

        expect(r.tags.sort()).toEqual(['pdx-dashboard', 'pdx-user-card']);
    });

    it('scans the directories it is given as well as src/ and pages/', () => {
        // One rule for the build, `pdx check` and the editor. Given directories that REPLACED
        // src/ and pages/ would make `pdx({ components: ['widgets'] })` lose every component under src/.
        pdx('src/kept.pdx');
        pdx('widgets/gauge.pdx');
        pdx('elsewhere/hidden.pdx');

        const r = new ComponentResolver();
        r.registerProjectComponents(root, ['widgets']);

        expect(r.tags.sort()).toEqual(['pdx-gauge', 'pdx-kept']);
        expect(r.searched).toEqual(['src/', 'pages/', 'widgets/']);
    });

    it('takes an absolute directory as given', () => {
        pdx('lib/meter.pdx');

        const r = new ComponentResolver();
        r.registerProjectComponents(root, [join(root, 'lib')]);

        expect(r.tags).toEqual(['pdx-meter']);
    });

    it('does not fail on a directory that is not there', () => {
        // The default scan asks for src/ AND pages/; a project may have only one of them.
        pdx('src/only.pdx');
        const r = new ComponentResolver();
        expect(() => r.registerProjectComponents(root)).not.toThrow();
        expect(r.size).toBe(1);
    });

    it('skips node_modules, dist and dot-directories', () => {
        pdx('src/node_modules/dep.pdx');
        pdx('src/dist/built.pdx');
        pdx('src/.cache/tmp.pdx');
        pdx('src/real.pdx');

        const r = new ComponentResolver();
        r.registerProjectComponents(root);

        expect(r.tags).toEqual(['pdx-real']);
    });

    it('skips files whose name starts with _ — those are layouts, not components', () => {
        pdx('src/_layout.pdx');
        pdx('src/page.pdx');

        const r = new ComponentResolver();
        r.registerProjectComponents(root);

        expect(r.tags).toEqual(['pdx-page']);
    });

    it('skips .pdx.ts, which is a schema file and not a component', () => {
        pdx('src/user.pdx.ts');
        pdx('src/user.pdx');

        const r = new ComponentResolver();
        r.registerProjectComponents(root);

        expect(r.tags).toEqual(['pdx-user']);
    });

    it('honours an @tag override over the filename', () => {
        pdx('src/thing.pdx', '<script setup>\n  @tag "pdx-custom-name";\n</script>');

        const r = new ComponentResolver();
        r.registerProjectComponents(root);

        expect(r.tags).toEqual(['pdx-custom-name']);
    });

    it('descends into subdirectories', () => {
        pdx('src/a/b/deep.pdx');
        const r = new ComponentResolver();
        r.registerProjectComponents(root);
        expect(r.tags).toEqual(['pdx-deep']);
    });
});

describe('precedence when two things claim the same tag', () => {
    it('the first project file wins, and the collision is reported', () => {
        // Silently taking the second would make which component renders depend on readdir order.
        pdx('src/a/widget.pdx');
        pdx('src/b/widget.pdx');
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

        const r = new ComponentResolver();
        r.registerProjectComponents(root);

        expect(r.size).toBe(1);
        expect(warn).toHaveBeenCalledTimes(1);
        // The console line now leads with the diagnostic code — see
        // resolver-collision-channel.test.ts for the structured half of the same report.
        expect(String(warn.mock.calls[0][0])).toContain('PDX_TAG_COLLISION_RESOLVER');
        expect(r.resolve('pdx-widget')!.importPath).toContain('/a/widget.pdx');
    });

    it('a library component is not replaced by a project file of the same name', () => {
        // And it is NOT reported as a collision: the library winning is the documented rule, so it
        // is not something to warn about every time a project happens to name a file button.pdx.
        pdx('src/button.pdx');
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

        const r = new ComponentResolver();
        expect(r.registerUiManifest()).toBe(true);
        const before = r.resolve('pdx-button')!.importPath;
        r.registerProjectComponents(root);

        expect(r.resolve('pdx-button')!.importPath).toBe(before);
        expect(r.resolve('pdx-button')!.source).toBe('ui');
        expect(warn).not.toHaveBeenCalled();
    });
});

describe('the import statements it emits', () => {
    it('imports a library component by its package subpath', () => {
        const r = new ComponentResolver();
        r.registerUiManifest();
        expect(r.resolveImports(['pdx-button'], '', 'app.pdx')).toEqual(["import '@pdxui/ui/button';"]);
    });

    it('imports a project component by a relative path', () => {
        pdx('src/user-card.pdx');
        const r = new ComponentResolver();
        r.registerProjectComponents(root);

        const [line] = r.resolveImports(['pdx-user-card'], '', join(root, 'src', 'app.pdx'));
        expect(line).toBe("import './user-card.pdx';");
    });

    it('never imports a file into itself', () => {
        const self = pdx('src/user-card.pdx');
        const r = new ComponentResolver();
        r.registerProjectComponents(root);
        expect(r.resolveImports(['pdx-user-card'], '', self)).toEqual([]);
    });

    it('does not repeat an import the author already wrote', () => {
        const r = new ComponentResolver();
        r.registerUiManifest();
        expect(r.resolveImports(['pdx-button'], "import '@pdxui/ui/button';", 'app.pdx')).toEqual([]);
    });

    it('matches an existing import exactly, so a longer path cannot suppress a shorter one', () => {
        // '@pdxui/ui/button-group' CONTAINS '@pdxui/ui/button'. A substring check would drop
        // the button import and that element would never register.
        const r = new ComponentResolver();
        r.registerUiManifest();
        expect(r.resolveImports(['pdx-button'], "import '@pdxui/ui/button-group';", 'app.pdx'))
            .toEqual(["import '@pdxui/ui/button';"]);
    });

    it('says nothing about a tag it does not know', () => {
        const r = new ComponentResolver();
        r.registerUiManifest();
        expect(r.resolveImports(['pdx-not-a-thing'], '', 'app.pdx')).toEqual([]);
    });
});

describe('what the resolver reports about itself', () => {
    it('answers has() regardless of the case the tag was written in', () => {
        const r = new ComponentResolver();
        r.registerUiManifest();
        expect(r.has('PDX-BUTTON')).toBe(true);
        expect(r.has('pdx-button')).toBe(true);
        expect(r.has('pdx-nope')).toBe(false);
    });

    it('returns nothing for the enums of an unknown tag, rather than throwing', () => {
        const r = new ComponentResolver();
        r.registerUiManifest();
        expect(r.enumsFor('pdx-nope')).toBeUndefined();
        expect(r.enumValues('pdx-nope', 'variant')).toBeNull();
    });

    it('reports enum values for a prop that declares a closed string union', () => {
        const r = new ComponentResolver();
        r.registerUiManifest();
        const variants = r.enumValues('pdx-button', 'variant');
        expect(variants, 'pdx-button has no variant enum in the manifest').not.toBeNull();
        expect(variants!.length).toBeGreaterThan(1);
    });

    it('resolves to null for a tag nobody registered', () => {
        expect(new ComponentResolver().resolve('pdx-anything')).toBeNull();
    });
});

describe('the exports-only fallback, for a ui build with no manifest', () => {
    it('derives a tag per subpath and skips nested exports that are not components', () => {
        const r = new ComponentResolver();
        r.registerUiPackage();

        expect(r.has('pdx-button')).toBe(true);
        // './icon/pdx-icon' is nested and DOES name a component: its last segment is a pdx-* tag.
        expect(r.has('pdx-icon')).toBe(true);
        // './shared/column-chooser' is nested and does not — it must not become a custom element.
        expect(r.has('pdx-column-chooser')).toBe(false);
        expect(r.has('pdx-shared')).toBe(false);
    });
});
