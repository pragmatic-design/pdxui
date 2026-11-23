// A .pdx component's declaration declares what its types name (#1335): the types its script imports,
// and its `@generic` parameters. Copied without them, `item: NavbarItem` and `items?: T[]` were names
// nothing in the file declared: `Cannot find name` to a consumer that checks the library.

import { describe, it, expect } from 'vitest';
import { generateDts, scriptImportStatements } from '../src/compiler/dts-generator';
import type { DtsInput } from '../src/compiler/dts-generator';

const base: DtsInput = { tag: 'pdx-nav', props: [], events: [], slots: [] };

describe('a declaration that names an imported type', () => {
    it('imports it as a type from the module the script names, and exports it again from a module of its own', () => {
        const dts = generateDts({
            ...base,
            events: [{ name: 'pdx-select', payloadType: '{ key: string; item: NavbarItem }' }],
            imports: ["import type { NavbarItem, Unused } from './navbar-types';", "import { helper } from './helpers';"],
        });
        expect(dts).toContain("import type { NavbarItem } from './navbar-types';");
        expect(dts).toContain('export type { NavbarItem };');
        // The control: what it does not name is not imported.
        expect(dts).not.toContain('Unused');
        expect(dts).not.toContain('helpers');
    });

    it("imports one from a package without exporting it: it is the package's to export", () => {
        const dts = generateDts({
            ...base,
            props: [{ name: 'form', tsType: 'Form<any> | null', runtimeType: 'Object' }],
            imports: ["import { onDestroy, type Form } from '@pdxui/core';"],
        });
        expect(dts).toContain("import type { Form } from '@pdxui/core';");
        expect(dts).not.toContain('export type { Form }');
        expect(dts).not.toContain('onDestroy');
    });

    it('keeps an alias as the script wrote it', () => {
        const dts = generateDts({
            ...base,
            props: [{ name: 'at', tsType: 'Spot', runtimeType: 'Object' }],
            imports: ["import type { Place as Spot } from './place';"],
        });
        expect(dts).toContain("import type { Place as Spot } from './place';");
        expect(dts).toContain('export type { Spot };');
    });

    it('control — a declaration that names nothing imported has no import', () => {
        const dts = generateDts({ ...base, props: [{ name: 'label', tsType: 'string', runtimeType: 'String' }], imports: ["import type { X } from './x';"] });
        expect(dts).not.toContain('import');
    });
});

describe('a declaration that names a @generic', () => {
    it('declares it as its constraint, and the types the constraint names', () => {
        const dts = generateDts({
            ...base,
            props: [{ name: 'items', tsType: 'T[]', runtimeType: 'Array' }],
            generics: ['T extends { id: Key }', 'U'],
            imports: ["import type { Key } from './key';"],
        });
        expect(dts).toContain('type T = { id: Key };');
        expect(dts).toContain("import type { Key } from './key';");
        // U is named by nothing: not declared.
        expect(dts).not.toContain('type U');
    });

    it('declares one with no constraint as unknown', () => {
        const dts = generateDts({ ...base, props: [{ name: 'items', tsType: 'T[]', runtimeType: 'Array' }], generics: ['T'] });
        expect(dts).toContain('type T = unknown;');
    });
});

describe('the script import statements a declaration is given', () => {
    it("are every one-line import, core's included, and nothing else", () => {
        const script = [
            "import { onDestroy, type Form } from '@pdxui/core';",
            "import type { NavbarItem } from './navbar-types';",
            "import '@pdxui/design/components/navbar';",
            '@prop label: string = \'\';',
            "const s = 'import x from y';",
        ].join('\n');
        expect(scriptImportStatements(script)).toEqual([
            "import { onDestroy, type Form } from '@pdxui/core';",
            "import type { NavbarItem } from './navbar-types';",
        ]);
    });
});
