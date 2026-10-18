// Typed routes in the editor and `pdx check --types` (#150): with the app's `.pdx/routes.d.ts` — the
// compiler's own output for a fixture app's patterns — `navigate()` takes only a declared pattern
// and its typed params, a concrete URL goes through `navigate.url()`, and `<pdx-link>` is checked
// as the call it makes. Without the file, nothing is typed, as before. The fixture lives inside the
// site package for one reason: `@pdxui/router` resolves from there.

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtempSync, rmSync } from 'fs';
import { join } from 'path';
import { typecheckPdx } from '../src/typecheck';
import { writeRouteTypes } from '../../compiler/src/route-types';

const SITE = join(__dirname, '..', '..', 'site');
let APP = '';

beforeAll(() => {
    APP = mkdtempSync(join(SITE, '.tmp-typed-routes-'));
    writeRouteTypes(APP, ['/', '/users/:id(number)', '/tickets', '/docs/:section/:page']);
});
afterAll(() => { rmSync(APP, { recursive: true, force: true }); });

function errors(script: string, template = '<p></p>', options?: { routeTypes?: boolean }): string[] {
    const path = join(APP, 'probe.pdx');
    const content = `<template>${template}</template>\n<script setup lang="ts">\nimport { navigate } from '@pdxui/router';\n${script}\n</script>\n`;
    return (typecheckPdx(APP, [{ path, content }], options).get(path) ?? []).map((e) => `TS${e.tsCode} ${e.message.split('\n')[0]}`);
}

describe('navigate() against the generated routes', () => {
    it('a declared pattern with its typed params, and one with none, check', () => {
        expect(errors("navigate('/users/:id', { id: 42 });\nnavigate('/tickets');\nnavigate('/docs/:section/:page', { section: 'a', page: 'b' }, { from: 'x' });")).toEqual([]);
    });

    it('a concrete URL through navigate.url() checks', () => {
        expect(errors("navigate.url('/users/42?tab=a');")).toEqual([]);
    });

    it('an unknown path is a type error', () => {
        expect(errors("navigate('/user/:id', { id: 1 });").join('\n')).toMatch(/TS2345|TS2769/);
    });

    it('a concrete URL passed to navigate() is a type error', () => {
        expect(errors("navigate('/users/42');")).not.toEqual([]);
    });

    it('a wrong param name, a wrong param type, and a missing params object are type errors', () => {
        expect(errors("navigate('/users/:id', { userId: 1 });"), 'wrong name').not.toEqual([]);
        expect(errors("navigate('/users/:id', { id: 'x' });"), 'wrong type').not.toEqual([]);
        expect(errors("navigate('/users/:id');"), 'missing params').not.toEqual([]);
    });

    it('control — without the routes file, navigate() takes any string, as before', () => {
        expect(errors("navigate('/users/42');\nnavigate('/anything', { a: '1' });", '<p></p>', { routeTypes: false })).toEqual([]);
    });
});

describe('<pdx-link> against the generated routes', () => {
    const page = (template: string) => errors('const u = { id: 3 };', template);

    it('a declared pattern with its params checks', () => {
        expect(page('<pdx-link to="/users/:id" :params="{ id: u.id }">u</pdx-link><pdx-link to="/tickets">t</pdx-link>')).toEqual([]);
    });

    it('an unknown path or a wrong param is an error', () => {
        expect(page('<pdx-link to="/user/:id" :params="{ id: u.id }">u</pdx-link>'), 'unknown path').not.toEqual([]);
        expect(page('<pdx-link to="/users/:id" :params="{ id: \'x\' }">u</pdx-link>'), 'wrong param').not.toEqual([]);
    });

    it('control — a computed :to is a URL, which nothing types', () => {
        expect(page('<pdx-link :to="\'/users/\' + u.id">u</pdx-link>')).toEqual([]);
    });
});
