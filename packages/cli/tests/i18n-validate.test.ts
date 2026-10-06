// `pdx i18n validate` on an app that translates an enum.
//
// Against a COMPLETE dictionary it reports nothing missing and no orphan. `$t('nav.' + key)` composes
// a key at runtime, and its literal part — `nav.`, `property.sections.`, `requests.outcome.` — is a
// prefix, not a key: recorded as a key, it would be reported missing, and every entry reached by that
// concatenation would land among the orphans, because no static key names it. Then
// `--strictOrphans`, which the recipe tells you to run in the same step as the build, could not be
// used by any app that translates an enum.
//
// One finding is real: `router.notFound` belongs to the COMPONENT string registry
// (`setLocaleStrings`), not to the `$t` dictionary. Asking $t for it renders the raw key. That
// diagnostic is kept, with a message that says which registry owns it.
//
// A third form: `$t(`nav.${key}`)` is a prefix too, not a key literally called "nav.${key}".

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdirSync, writeFileSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { scanUsedKeys, loadDictionaries, buildReport, COMPONENT_STRING_NAMESPACES } from '../src/i18n/keys';

const root = join(tmpdir(), 'pdx-i18n-validate-' + process.pid);

beforeAll(() => {
    mkdirSync(join(root, 'translations'), { recursive: true });
    // An app that translates an enum: the section names are composed, the title is static.
    writeFileSync(join(root, 'nav.pdx'), `<template>
        <a>{{ $t('nav.' + item.key) }}</a>
        <h1>{{ $t('page.title') }}</h1>
        <em>{{ $t(\`crumb.\${level}\`) }}</em>
    </template>`);
    writeFileSync(join(root, 'translations', 'it.json'), JSON.stringify({
        nav: { home: 'Casa', rooms: 'Vani', expenses: 'Spese' },
        crumb: { one: 'Uno', two: 'Due' },
        page: { title: 'Scheda' },
    }));
});

afterAll(() => rmSync(root, { recursive: true, force: true }));

async function report() {
    const { keys, prefixes } = await scanUsedKeys(root);
    const { dictionaries } = await loadDictionaries(root);
    return buildReport(keys, prefixes, dictionaries[0].messages);
}

describe('a composed key is a prefix, not a key', () => {
    it('the literal part of `$t("nav." + k)` is not reported as a missing key', async () => {
        expect((await report()).missing).toEqual([]);
    });

    it('a template literal with a hole is a prefix too', async () => {
        const { keys, prefixes } = await scanUsedKeys(root);
        expect([...keys.keys()].sort(), 'a composed key reached the key list').toEqual(['page.title']);
        expect([...prefixes.keys()].sort()).toEqual(['crumb.', 'nav.']);
    });

    it('everything the prefix covers counts as used, so the dictionary has no orphans', async () => {
        expect((await report()).orphan).toEqual([]);
    });

    it('so the gate the recipe recommends passes on a complete dictionary', async () => {
        const r = await report();
        // What `--strictOrphans` adds up: missing + orphans + the component-registry keys.
        expect(r.missing.length + r.orphan.length + r.componentStrings.length).toBe(0);
    });
});

describe('the one real diagnostic is kept', () => {
    it('a component-registry key asked of $t is reported as such, not as missing', async () => {
        writeFileSync(join(root, 'panel.pdx'), `<template>{{ $t('router.notFound') }}</template>`);
        const r = await report();
        rmSync(join(root, 'panel.pdx'));
        expect(r.componentStrings, 'the key the lab actually got wrong went unreported').toEqual(['router.notFound']);
        expect(r.missing, 'it must not be counted twice').toEqual([]);
    });

    it('the namespaces are the ones the library registers', () => {
        // The list is data, and it is kept honest by i18n-component-namespaces.test.ts, which reads
        // the registerComponentStrings() calls in the workspace.
        expect(COMPONENT_STRING_NAMESPACES).toContain('router');
        expect(COMPONENT_STRING_NAMESPACES).toContain('data-grid');
        expect(COMPONENT_STRING_NAMESPACES.length).toBeGreaterThan(10);
    });

    it('an app key that merely starts like one is not touched', async () => {
        writeFileSync(join(root, 'own.pdx'), `<template>{{ $t('routerX.thing') }}</template>`);
        const r = await report();
        rmSync(join(root, 'own.pdx'));
        expect(r.componentStrings).toEqual([]);
        expect(r.missing).toEqual(['routerX.thing']);
    });
});

describe('a prefix that translates nothing is worth saying', () => {
    it('reports a composed key whose dictionary entries do not exist', async () => {
        writeFileSync(join(root, 'ghost.pdx'), `<template>{{ $t('ghost.' + k) }}</template>`);
        const r = await report();
        rmSync(join(root, 'ghost.pdx'));
        // Not an error: the app may compose keys a dictionary provides for another locale. But a
        // prefix that matches no entry at all resolves to the raw key at runtime, every time.
        expect(r.unmatchedPrefixes).toEqual(['ghost.']);
    });
});

describe('the dictionary is looked for where the documentation puts it', () => {
    it('finds locales/ as well as translations/', async () => {
        const alt = join(tmpdir(), 'pdx-i18n-alt-' + process.pid);
        mkdirSync(join(alt, 'locales'), { recursive: true });
        writeFileSync(join(alt, 'locales', 'it.json'), JSON.stringify({ a: 'A' }));
        const { dictionaries, searched } = await loadDictionaries(alt);
        rmSync(alt, { recursive: true, force: true });
        expect(dictionaries.map(d => d.locale), 'the recipe writes ./locales/it.json').toEqual(['it']);
        expect(searched.length, 'the places looked in are reported, so a miss can be explained').toBeGreaterThan(1);
    });

    it('finds public/locales/, which is what basePath: "/locales" serves', async () => {
        const alt = join(tmpdir(), 'pdx-i18n-pub-' + process.pid);
        mkdirSync(join(alt, 'public', 'locales'), { recursive: true });
        writeFileSync(join(alt, 'public', 'locales', 'en.json'), JSON.stringify({ a: 'A' }));
        const { dictionaries } = await loadDictionaries(alt);
        rmSync(alt, { recursive: true, force: true });
        expect(dictionaries.map(d => d.locale)).toEqual(['en']);
    });

    it('an explicit glob wins over every convention', async () => {
        const alt = join(tmpdir(), 'pdx-i18n-glob-' + process.pid);
        mkdirSync(join(alt, 'i18n', 'dicts'), { recursive: true });
        writeFileSync(join(alt, 'i18n', 'dicts', 'fr.json'), JSON.stringify({ a: 'A' }));
        const { dictionaries } = await loadDictionaries(alt, ['i18n/dicts/*.json']);
        rmSync(alt, { recursive: true, force: true });
        expect(dictionaries.map(d => d.locale)).toEqual(['fr']);
    });
});
