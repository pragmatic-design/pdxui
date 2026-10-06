// Tests for the i18n tooling helpers (Track D).

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdirSync, writeFileSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { flatten, nestKeys, scanUsedKeys, loadDictionaries } from '../src/i18n/keys';

describe('flatten()', () => {
    it('flattens nested objects to dot keys', () => {
        const m = flatten({ a: 'x', b: { c: 'y', d: { e: 'z' } } });
        expect(m.get('a')).toBe('x');
        expect(m.get('b.c')).toBe('y');
        expect(m.get('b.d.e')).toBe('z');
    });
});

describe('nestKeys()', () => {
    it('rebuilds a nested template (empty leaves)', () => {
        expect(nestKeys(['a', 'b.c', 'b.d'])).toEqual({ a: '', b: { c: '', d: '' } });
    });
});

describe('scanUsedKeys() + loadDictionaries()', () => {
    const root = join(tmpdir(), 'pdx-i18n-test-' + Math.floor(Date.now() / 1000));
    beforeAll(() => {
        mkdirSync(join(root, 'translations'), { recursive: true });
        writeFileSync(join(root, 'app.ts'), `$t('greeting'); $t("page.title", {});`);
        writeFileSync(join(root, 'view.pdx'), `<template>{{ $t(\`items\`) }}</template>`);
        writeFileSync(join(root, 'translations', 'en.json'), JSON.stringify({ greeting: 'Hi', extra: { gone: 'x' } }));
        writeFileSync(join(root, 'translations', 'template.json'), JSON.stringify({ ignored: '' }));
        writeFileSync(join(root, 'translations', 'broken.json'), '{ not: valid json,');
    });
    afterAll(() => rmSync(root, { recursive: true, force: true }));

    it('finds static $t keys across .ts and .pdx (single/double/backtick quotes)', async () => {
        // scanUsedKeys returns keys AND prefixes: a composed argument
        // (`$t('nav.' + k)`) is not a key, and counting it as one would report it missing.
        const { keys, prefixes } = await scanUsedKeys(root);
        expect([...keys.keys()].sort()).toEqual(['greeting', 'items', 'page.title']);
        expect([...prefixes.keys()], 'nothing here is composed').toEqual([]);
    });

    it('loads + flattens dictionaries, skipping template.json, surfacing malformed files', async () => {
        const { dictionaries, malformed } = await loadDictionaries(root);
        expect(dictionaries.map(d => d.locale)).toEqual(['en']); // template.json skipped, broken.json → malformed
        expect(dictionaries[0].messages.get('greeting')).toBe('Hi');
        expect(dictionaries[0].messages.get('extra.gone')).toBe('x');
        expect(malformed.map(m => m.file.endsWith('broken.json'))).toEqual([true]);
    });
});
