// The icons a template names are imported, one module each; a name that arrives through data loads on
// demand (#47).
//
// `pdx-icon` used to register the whole «pragmatic» set at load, so every page with one icon shipped
// 359. Now each icon is its own module (`@pdxui/ui/icons/<name>`), and the compiler imports the ones it
// can see: a literal `<pdx-icon name="check">`, and the literal value of a component prop the manifest
// marks as an icon name (`<pdx-fab icon="edit">`). A bound name is the on-demand case: no import and
// no warning. Asked of the real resolver over the real ui package, as the auto-import tests do.

import { describe, it, expect } from 'vitest';
import { ComponentResolver } from '../src/component-resolver';
import { injectComponentImports, discoverPragmaticAliases } from '../src/plugin-utils';
import { compile } from '../src/plugin';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

/**
 * The icons the compiled module puts on the page: each icon module imported, and handed by name to
 * pdx-icon's `defineIcons`. Both halves, or the icon is imported and never drawn from the map.
 */
function iconImports(code: string): string[] {
    const imported = new Map([...code.matchAll(/import (__pdxIcon\d+) from ['"]@pdxui\/ui\/icons\/([\w-]+)['"]/g)].map(m => [m[1], m[2]]));
    if (imported.size === 0) return [];
    expect(code, 'icons imported, and no defineIcons imported from pdx-icon').toMatch(/import \{ defineIcons as __pdxDefineIcons \} from ['"]@pdxui\/ui\/icon\/pdx-icon['"]/);
    const call = code.match(/__pdxDefineIcons\(\{([^}]*)\}\);/);
    expect(call, 'icons imported, and never handed to defineIcons').not.toBeNull();
    const defined = [...call![1].matchAll(/"([\w-]+)": (__pdxIcon\d+)/g)];
    for (const [, name, id] of defined) expect(imported.get(id), `${name} defined from the wrong import`).toBe(name);
    expect(defined.length, 'an imported icon is not defined').toBe(imported.size);
    return [...imported.values()];
}

function compiled(template: string, script = 'let x = $signal("check");'): { code: string; warnings: string[] } {
    const source = [`<template>${template}</template>`, '<script>', script, '</script>'].join('\n');
    const result = compile(source, 'icons.pdx');
    const resolver = new ComponentResolver();
    resolver.registerUiManifest();
    return { code: injectComponentImports(result.code, 'icons.pdx', source, resolver), warnings: result.warnings.map(w => w.code) };
}

describe('the icons a template names are imported', () => {
    it('<pdx-icon name="check"> imports the check icon, and no other', () => {
        expect(iconImports(compiled('<pdx-icon name="check"></pdx-icon>').code)).toEqual(['check']);
    });

    it('a literal value of a prop the manifest marks as an icon name is imported: <pdx-fab icon="edit">', () => {
        expect(iconImports(compiled('<pdx-fab icon="edit"></pdx-fab>').code)).toEqual(['edit']);
    });

    it('a kebab-case attribute of a camelCase icon prop is imported: <pdx-image fallback-icon="user">', () => {
        expect(iconImports(compiled('<pdx-image src="a.png" fallback-icon="user"></pdx-image>').code)).toEqual(['user']);
    });

    it('a bound name imports nothing and raises nothing: it loads on demand', () => {
        const { code, warnings } = compiled('<pdx-icon :name="x"></pdx-icon><pdx-fab :icon="x"></pdx-fab>');
        expect(iconImports(code)).toEqual([]);
        expect(warnings.filter(w => w.includes('ICON'))).toEqual([]);
    });

    it('a prop that is not an icon name imports nothing: <pdx-fab label="edit">', () => {
        expect(iconImports(compiled('<pdx-fab label="edit"></pdx-fab>').code)).toEqual([]);
    });

    it('a name outside the set imports nothing, so the build does not break on it', () => {
        expect(iconImports(compiled('<pdx-icon name="no-such-icon"></pdx-icon>').code)).toEqual([]);
    });

    it('an icon of another set is not imported from the pragmatic set', () => {
        expect(iconImports(compiled('<pdx-icon set="lucide" name="check"></pdx-icon>').code)).toEqual([]);
    });

    it('an icon named in a comment is not imported', () => {
        expect(iconImports(compiled('<!-- <pdx-icon name="trash"></pdx-icon> --><pdx-icon name="check"></pdx-icon>').code)).toEqual(['check']);
    });

    it('the same icon twice is imported once', () => {
        expect(iconImports(compiled('<pdx-icon name="check"></pdx-icon><pdx-icon name="check" size="sm"></pdx-icon>').code)).toEqual(['check']);
    });
});

// An icon named in data the same file writes — `actions([{ icon: 'eye', … }])`, a menu's items — is on
// the first screen as much as one in the markup. Loaded on demand it arrived a round trip late: a cold
// /tickets in the showcase took three waves of JavaScript instead of two. A literal value of an `icon`
// property in the script is imported like a literal in the template (owner decision, #47).
describe('the icons the script names in data are imported', () => {
    const withScript = (script: string): string[] => iconImports(compiled('<pdx-data-grid></pdx-data-grid>', script).code);

    it('a literal value of an `icon` property: `[{ icon: "trash" }, { icon: \'eye\' }]`', () => {
        expect(withScript('const rows = [{ key: "a", icon: "trash" }, { key: "b", icon: \'eye\' }];')).toEqual(['trash', 'eye']);
    });

    it('not a value that is not literal, nor another property, nor a comment', () => {
        expect(withScript([
            'const name = "bell";',
            'const items = [{ icon: name }, { label: "edit" }, { icon: `${name}` }];',
            "// { icon: 'trash' }",
            "/* icon: 'copy' */",
        ].join('\n'))).toEqual([]);
    });

    it('nor a name outside the set', () => {
        expect(withScript('const items = [{ icon: "no-such-icon" }];')).toEqual([]);
    });

    it('and one named in both the template and the script is imported once', () => {
        expect(iconImports(compiled('<pdx-icon name="trash"></pdx-icon>', 'const items = [{ icon: "trash" }];').code)).toEqual(['trash']);
    });
});

// In the workspace the plugin aliases every @pdxui export to its source. `./icons/*` is a pattern:
// aliased exactly, it would not exist, and the base `@pdxui/ui` alias would take
// `@pdxui/ui/icons/check` to `.../src/index.ts/icons/check`.
describe('the workspace alias of the icon modules', () => {
    it('points @pdxui/ui/icons at the folder of the icon modules, where check.ts is', () => {
        const aliases = discoverPragmaticAliases();
        const folder = aliases['@pdxui/ui/icons'];
        expect(folder, 'no alias for @pdxui/ui/icons').toBeDefined();
        expect(existsSync(join(folder, 'check.ts')), `${folder} has no check.ts`).toBe(true);
        expect(Object.keys(aliases).filter(k => k.includes('*'))).toEqual([]);
        // Longer first, so the prefix match reaches the icons before the package's barrel.
        const keys = Object.keys(aliases);
        expect(keys.indexOf('@pdxui/ui/icons')).toBeLessThan(keys.indexOf('@pdxui/ui'));
    });
});
