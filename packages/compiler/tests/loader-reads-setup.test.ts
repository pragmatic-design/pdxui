// PDX_LOADER_READS_SETUP (#977): a `@loader` or `@page` label function lifted to module scope that
// reads a name of the component's setup. It compiled clean and threw a ReferenceError on the route's
// first visit.

import { describe, it, expect } from 'vitest';
import { compile } from '../src/plugin';

const page = (script: string, lang = '') => `<template><p>x</p></template>\n<script${lang}>\n${script}\n</script>\n`;
const findings = (src: string) => (compile(src, '/app/src/pages/t.pdx').warnings ?? [])
    .filter((w) => w.code === 'PDX_LOADER_READS_SETUP');

describe('a loader that reads the component\'s setup', () => {
    it.each([
        ['a constant', "const base = '/api/v2';", 'base + "/t"', 'base'],
        ['a function', 'function url() { return "/t"; }', 'url()', 'url'],
        ['a $signal', 'let page = $signal(1);', '"/t?p=" + page', 'page'],
        ['a @prop', "@prop id: string = '';", '"/t/" + id', 'id'],
    ])('is an error when it reads %s, at the loader', (_what, decl, expr, name) => {
        const src = page(["@page '/t/:id';", '@loader loaded: load;', decl, `async function load() { return fetch(${expr}); }`].join('\n'));
        const found = findings(src);
        expect(found, `expected one finding for '${name}'`).toHaveLength(1);
        expect(found[0]).toMatchObject({ severity: 'error' });
        expect(found[0].message).toContain(`'${name}'`);
        expect(src.split('\n')[found[0].line! - 1]).toContain('async function load');
    });

    it('a label function that reads one is an error too', () => {
        const src = page(["@page '/t/:id' { label: crumb };", "const prefix = 'T';", 'function crumb(params) { return prefix + params.id; }'].join('\n'));
        const found = findings(src);
        expect(found).toHaveLength(1);
        expect(found[0].message).toContain('label function `crumb`');
    });
});

describe('what a loader may read', () => {
    it.each([
        ['a name only in a type annotation', ' lang="ts"', [
            "import type { LoaderContext } from '@pdxui/router';",
            "@prop id: string = '';",
            'async function load({ params }: LoaderContext<{ id: number }>) { return fetch(`/t/${params.id}`); }',
        ]],
        ['a local of another function, and its own of the same name', '', [
            'async function load() { const res = await fetch("/t"); return res.json(); }',
            'async function reload() { const res = await fetch("/u"); return res.json(); }',
        ]],
        ['an import', '', [
            "import { base } from '../api';",
            'async function load() { return fetch(base + "/t"); }',
        ]],
        ['a global, its params and a shorthand of them', '', [
            "const signal = 'not this one';",
            'async function load({ params, signal }) { return fetch(encodeURIComponent(params.id), { signal }); }',
        ]],
        ['a global named like a @state, which declares no name (#981)', '', [
            'let isOpen = $signal(false);',
            '@state open = isOpen;',
            'async function load() { open("/help"); return fetch("/t"); }',
        ]],
        ['a global named like a @snippet, which the setup does not declare (#981)', '', [
            '@snippet open(x) { <b>{{ x }}</b> }',
            'async function load() { open("/help"); return fetch("/t"); }',
        ]],
        ['the label function', '', [
            'function crumb(params) { return `T ${params.id}`; }',
            'async function load({ params }) { document.title = crumb(params); return fetch("/t"); }',
        ]],
    ])('%s is not reported', (_what, lang, lines) => {
        const src = page(["@page '/t/:id' { label: crumb };", '@loader loaded: load;', ...lines].join('\n'), lang);
        expect(findings(src)).toEqual([]);
    });
});
