// `::name` on a component's `@model` is a contract with a type (#124): the editor checks that the
// bound value is what the model holds. `::value="count"` on a `@model value: string` with a number
// signal is an error; the same binding of a string signal is fine. What is not a model — a plain prop,
// a native element, a library component that lists no model — is projected as before.

import { describe, it, expect, beforeAll } from 'vitest';
import { join } from 'path';
import { pathToFileURL } from 'url';
import { mkdtempSync, writeFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { parseTemplate } from '@pdxui/compiler';
import { PdxTsService } from '../src/utils/ts-service';
import { buildVirtualFile } from '../src/utils/virtual-file';
import { getTsDiagnostics } from '../src/capabilities/ts-diagnostics';
import { resolveModelType } from '../src/workspace';
import { describeProjectComponent } from '../src/utils/project-components';

const ROOT = join(__dirname, '..', '..', '..');
const URI = pathToFileURL(join(ROOT, 'two-way.pdx')).href;
const svc = new PdxTsService(ROOT);

// app-field declares `@model value: string`; the editor asks a model's type with `::name`.
const resolveType = (tag: string, attr: string) => (tag === 'app-field' && attr === '::value' ? 'string' : null);

function diagnose(script: string, template: string): string[] {
    const source = `<template>${template}</template>\n<script>\n${script}\n</script>\n`;
    const scriptStart = source.indexOf('<script>\n') + '<script>\n'.length;
    const vf = buildVirtualFile(script, scriptStart, parseTemplate(template, 1), template, '<template>'.length, resolveType);
    return getTsDiagnostics(svc, URI, vf, source).map(d => `${d.code} ${d.message.split('\n')[0]}`);
}

// The language service's cold start — the lenient program and the strict one that checks the template
// (#468) — paid here with a timeout of its own, not by the first `it` against vitest's 5s.
beforeAll(() => { diagnose('let x = $signal(1);', '<p>{{ x }}</p>'); }, 60_000);

describe('::name on a model is type-checked', () => {
    it('a value of another type is an error, at the binding', () => {
        const found = diagnose('let count = $signal(0);', '<app-field ::value="count"></app-field>');
        expect(found).toHaveLength(1);
        expect(found[0]).toMatch(/number.*not assignable.*string/);
    });

    it('a value of the model\'s type is fine', () => {
        expect(diagnose("let name = $signal('Ada');", '<app-field ::value="name"></app-field>')).toEqual([]);
    });

    it('the control: a name the editor knows no model type for is projected as before', () => {
        expect(diagnose('let count = $signal(0);', '<app-field ::label="count"></app-field><input ::value="count" />')).toEqual([]);
    });
});

describe('the workspace answers a model\'s type', () => {
    const registry = {
        describe: (tag: string) => tag === 'app-field' ? {
            tag, description: '', filePath: 'app-field.pdx',
            attributes: [{ name: 'selectedId', type: 'string', description: '' }, { name: 'label', type: 'string', description: '' }],
            events: [], slots: [],
        } : undefined,
        resolver: { modelsOf: (tag: string) => (tag === 'app-field' ? new Set(['selectedId']) : null) },
    } as unknown as Parameters<typeof resolveModelType>[0];

    it('for a model, by any spelling of its name', () => {
        expect(resolveModelType(registry, 'app-field', 'selectedId')).toBe('string');
        expect(resolveModelType(registry, 'app-field', 'selected-id')).toBe('string');
    });

    it('not for a plain prop, nor for a component whose models are not known', () => {
        expect(resolveModelType(registry, 'app-field', 'label')).toBeNull();
        expect(resolveModelType(registry, 'pdx-input', 'value')).toBeNull();
    });

    it('a project component\'s description lists each model\'s <name>-change, typed { value: T }', () => {
        const dir = mkdtempSync(join(tmpdir(), 'pdx-model-describe-'));
        try {
            const file = join(dir, 'app-field.pdx');
            writeFileSync(file, "<template><p/></template>\n<script>\n@model selectedId: string = '';\n</script>\n");
            expect(describeProjectComponent('app-field', file)?.events).toEqual([
                { name: 'selected-id-change', type: '{ value: string }', description: 'Fired when the component writes `selectedId`. Does not bubble.' },
            ]);
        } finally {
            rmSync(dir, { recursive: true, force: true });
        }
    });
});
