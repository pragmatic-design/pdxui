// Manifest-driven component auto-import (Track C): the resolver reads @pdxui/ui's
// custom-elements.json for authoritative tags + prop enums, resolving the public import subpath
// from package.json exports (so nested/renamed exports stay correct).

import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { ComponentResolver } from '../src/component-resolver';
import { checkEnumValues } from '../src/compiler/validate-enums';
import { parseTemplate } from '../src/parser/template';
import type { ValidationWarning } from '../src/compiler/validate';

/** validate()'s enum check on a template alone, with the resolver's lookup. */
function enumFindings(tpl: string, r: ComponentResolver, _file: string): ValidationWarning[] {
    const out: ValidationWarning[] = [];
    checkEnumValues(parseTemplate(tpl), (t, p) => r.enumValues(t, p), out);
    return out;
}

describe('ComponentResolver — manifest-driven resolution', () => {
    const r = new ComponentResolver();
    const ok = r.registerUiManifest(); // monorepo: walks up to packages/ui

    it('registers from the manifest (the whole library)', () => {
        expect(ok).toBe(true);
        expect(r.size).toBeGreaterThan(90);
    });

    it('resolves flat exports: pdx-button → @pdxui/ui/button', () => {
        expect(r.resolve('pdx-button')?.importPath).toBe('@pdxui/ui/button');
        expect(r.resolve('pdx-data-grid')?.importPath).toBe('@pdxui/ui/data-grid');
    });

    it('resolves NESTED exports correctly: pdx-icon → @pdxui/ui/icon/pdx-icon', () => {
        expect(r.resolve('pdx-icon')?.importPath).toBe('@pdxui/ui/icon/pdx-icon');
    });

    it('resolves RENAMED exports via the source file, not the dir name', () => {
        // src/switch-toggle/pdx-switch.ts is exported as "./switch"
        expect(r.resolve('pdx-switch')?.importPath).toBe('@pdxui/ui/switch');
        // src/overlay/pdx-overlay-outlet.ts is exported as "./overlay-outlet"
        expect(r.resolve('pdx-overlay-outlet')?.importPath).toBe('@pdxui/ui/overlay-outlet');
    });

    it('exposes prop enums from the manifest', () => {
        const variant = r.enumValues('pdx-button', 'variant');
        expect(variant).toContain('primary');
        expect(variant).toContain('outline');
        expect(variant?.length).toBe(10);

        expect(r.enumValues('pdx-drawer', 'position')).toEqual(['left', 'right', 'top', 'bottom']);
        expect(r.enumValues('pdx-input', 'type')).toContain('email');
        expect(r.enumValues('pdx-dialog', 'size')).toEqual(['sm', 'md', 'lg', 'xl', 'full']);
    });

    it('does NOT treat non-enum props as enums', () => {
        expect(r.enumValues('pdx-button', 'disabled')).toBeNull(); // boolean
        expect(r.enumValues('pdx-button', 'nope')).toBeNull();     // missing
        expect(r.enumValues('pdx-unknown-tag', 'x')).toBeNull();   // unknown tag
    });
});

describe('the enum check — PDX_INVALID_ENUM_VALUE', () => {
    const r = new ComponentResolver();
    r.registerUiManifest();
    const warn = (tpl: string) => enumFindings(tpl, r, 'x.pdx');

    it('flags a static value outside the declared enum, listing the allowed values', () => {
        const w = warn('<pdx-button variant="solidish">x</pdx-button>');
        expect(w).toHaveLength(1);
        expect(w[0].code).toBe('PDX_INVALID_ENUM_VALUE');
        expect(w[0].message).toContain('variant="solidish"');
        expect(w[0].hint).toContain('"primary"');
    });

    it('passes a valid value', () => {
        expect(warn('<pdx-button variant="outline" size="lg">x</pdx-button>')).toHaveLength(0);
    });

    it('flags single-quoted values too (PDX/HTML allows single quotes)', () => {
        const w = warn("<pdx-button variant='solidish'>x</pdx-button>");
        expect(w).toHaveLength(1);
        expect(w[0].message).toContain("variant=\"solidish\"");
        expect(warn("<pdx-button variant='outline'>x</pdx-button>")).toHaveLength(0);
    });

    it('skips dynamic bindings and interpolated values', () => {
        expect(warn('<pdx-button :variant="v">x</pdx-button>')).toHaveLength(0);
        expect(warn('<pdx-button variant="{ v }">x</pdx-button>')).toHaveLength(0);
    });

    it('ignores non-enum props and unknown tags', () => {
        expect(warn('<pdx-button label="anything" type="submit">x</pdx-button>')).toHaveLength(0);
        expect(warn('<pdx-whatever variant="nonsense">x</pdx-whatever>')).toHaveLength(0);
    });

    it('does not flag open-ended props (drawer size accepts custom widths)', () => {
        expect(warn('<pdx-drawer size="640px" position="left">x</pdx-drawer>')).toHaveLength(0);
    });

    it('flags an invalid drawer position (a closed enum) but not a custom size', () => {
        const w = warn('<pdx-drawer position="diagonal" size="640px">x</pdx-drawer>');
        expect(w).toHaveLength(1);
        expect(w[0].message).toContain('position="diagonal"');
    });

    // The same rule as the auto-import: a commented-out tag is not rendered. A
    // diagnostic about markup the reader cannot see is how a diagnostic stops being read, and the
    // commented-out draft of a component is exactly where a stale value survives.
    it('says nothing about a tag that is commented out', () => {
        expect(warn('<!-- <pdx-button variant="solidish">old</pdx-button> -->')).toHaveLength(0);
    });

    it('control — the same markup uncommented is still flagged', () => {
        expect(warn('<pdx-button variant="solidish">x</pdx-button>')).toHaveLength(1);
    });
});

// A `@pdxui/*` package other than ui can define a custom element. One that ships a manifest and
// declares `customElements` (the router) is a component package and maps its tags
// to its own exports; one that does not stays out of the import map, because emitting an import for
// a tag with no module behind it is what `knownWithoutImport` exists to avoid.
//
// Asking `resolve()` instead is the narrower question, and reports `<pdx-router-outlet>` as "will
// not be registered" on apps that route perfectly well. This is the contract that keeps the two answers apart and both of them complete.
describe('ComponentResolver — the custom elements of the other @pdxui packages', () => {
    const PACKAGES = join(__dirname, '..', '..');

    /** Every `pdx-…` tag defined by a `customElements.define` under packages/<pkg>/src, except ui. */
    function definedOutsideUi(): Map<string, string> {
        const found = new Map<string, string>();
        for (const pkg of readdirSync(PACKAGES, { withFileTypes: true })) {
            if (!pkg.isDirectory() || pkg.name === 'ui') continue;
            const src = join(PACKAGES, pkg.name, 'src');
            if (!existsSync(src)) continue;
            for (const file of walkTs(src)) {
                for (const m of readFileSync(file, 'utf-8').matchAll(/customElements\.define\(\s*['"](pdx-[\w-]+)['"]/g)) {
                    found.set(m[1], pkg.name);
                }
            }
        }
        return found;
    }

    function walkTs(dir: string): string[] {
        const out: string[] = [];
        for (const e of readdirSync(dir, { withFileTypes: true })) {
            const p = join(dir, e.name);
            if (e.isDirectory()) out.push(...walkTs(p));
            else if (e.name.endsWith('.ts')) out.push(p);
        }
        return out;
    }

    const defined = definedOutsideUi();

    it('found some, so the assertions below are not vacuous', () => {
        // Zero would make every claim here pass by checking nothing — the router defines two.
        expect(defined.size, 'no customElements.define found outside packages/ui').toBeGreaterThan(0);
    });

    it('knows every one of them, without an import', () => {
        const r = new ComponentResolver();
        const missing = [...defined]
            .filter(([tag]) => !r.knownWithoutImport(tag))
            .map(([tag, pkg]) => `${tag} (${pkg})`);
        expect(missing, 'these are defined by a @pdxui package and nothing in the resolver knows them').toEqual([]);
    });

    it('imports one only from the package that defines it', () => {
        // An import emitted for one of these must point at the module that defines it: @pdxui/router
        // is a component package and maps its own tags to its own exports.
        const r = new ComponentResolver();
        r.registerUiManifest();
        const wrongly = [...defined]
            .filter(([tag, dir]) => { const e = r.resolve(tag); return e !== null && !e.importPath.startsWith(`@pdxui/${dir}/`); })
            .map(([tag]) => `${tag} → ${r.resolve(tag)!.importPath}`);
        expect(wrongly, 'these would be auto-imported from a module that does not define them').toEqual([]);
    });
});
