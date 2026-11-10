// pdx-switch is the first component of the library written in .pdx (#1008). The move changes where
// the component lives and nothing it declares: custom-elements.json is what the compiler's
// auto-import, the LSP, the site, the skill catalogue and the certification registry read, so a field
// lost on the way would be lost in all of them.
//
// The oracle is the declaration the TypeScript component had, recorded from the manifest before the
// move in tests/fixtures/pdx-switch-declaration.json.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const UI = join(__dirname, '..', '..');
const read = (rel: string) => JSON.parse(readFileSync(join(UI, rel), 'utf-8'));

interface Declaration { tagName?: string; [key: string]: unknown }
interface Module { path: string; declarations: Declaration[]; exports: { declaration: { module: string } }[] }

const manifest = read('custom-elements.json') as { modules: Module[] };
const module = manifest.modules.find((m) => m.declarations.some((d) => d.tagName === 'pdx-switch'));

describe('pdx-switch, written in .pdx', () => {
    it('is the .pdx module in the manifest', () => {
        expect(module?.path).toBe('src/switch-toggle/pdx-switch.pdx');
        expect(module?.exports.map((e) => e.declaration.module)).toEqual(['src/switch-toggle/pdx-switch.pdx']);
    });

    it('declares what the TypeScript component declared, field by field', () => {
        const recorded = read('tests/fixtures/pdx-switch-declaration.json') as Declaration;
        const now = module!.declarations.find((d) => d.tagName === 'pdx-switch')!;
        const keys = [...new Set([...Object.keys(recorded), ...Object.keys(now)])].sort();
        const differing = keys
            .filter((key) => JSON.stringify(now[key]) !== JSON.stringify(recorded[key]))
            .map((key) => ({ key, recorded: recorded[key], now: now[key] }));
        expect(differing).toEqual([]);
    });
});
