// Component events do not bubble by default (#138).
//
// `@event saved: Item;` dispatches a CustomEvent that stays on the host; `@event(bubbles) saved: Item;`
// opts in. The function the declaration creates is the only way to dispatch from a `.pdx`: `$emit` is
// a removed form. `pdx migrate` keeps an alpha project's behaviour by writing `(bubbles)` on every
// existing `@event`, and PDX_EVENT_BUBBLES_UNUSED then says which of those no ancestor listens to.
// The runtime half — who hears the event — is packages/ui/tests/unit/event-emitter-runtime.test.ts.

import { describe, it, expect } from 'vitest';
import { compile } from '../src/plugin';
import { analyzeScript } from '../src/compiler/script-analyzer';
import { generateDts } from '../src/compiler/dts-generator';
import { eventBubbles, emitRemoved } from '../src/language/event-bubbles';
import { ComponentResolver } from '../src/component-resolver';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, utimesSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

function sfc(script: string, template = '<button @click="saved(1)">x</button>'): string {
    return `<template>\n${template}\n</template>\n<script>\n${script}\n</script>`;
}

const codes = (r: { warnings: { code: string }[] }) => r.warnings.map((w) => w.code);

describe('@event(bubbles) — the declaration', () => {
    it('is read, and marks the event as bubbling', () => {
        const { events } = analyzeScript('@event(bubbles) saved: { id: string };\n@event closed;', 'x.pdx');
        expect(events).toEqual([
            { name: 'saved', payloadType: '{ id: string }', bubbles: true },
            { name: 'closed', payloadType: 'void' },
        ]);
    });

    it('a misspelt option is PDX_UNKNOWN_DECLARATION, with the form as its hint', () => {
        const { warnings } = analyzeScript('@event(bubble) saved: number;', 'x.pdx');
        const w = warnings.find((x) => x.code === 'PDX_UNKNOWN_DECLARATION');
        expect(w, 'a malformed @event(…) was accepted').toBeDefined();
        expect(w!.hint).toContain('@event(bubbles) saved');
    });

    it('the emitter of a bubbling event dispatches with bubbles: true; a plain one with none', () => {
        const { code, warnings } = compile(sfc('@event(bubbles) saved: number;\n@event closed;', '<b @click="saved(1); closed()">x</b>'), 'card.pdx', [], undefined, {});
        expect(codes({ warnings }).filter((c) => c !== 'PDX_EVENT_BUBBLES_UNUSED')).not.toContain('PDX_UNKNOWN_DECLARATION');
        expect(code).toMatch(/const saved = \(detail\) => ctx\.emit\('saved', detail, \{ bubbles: true \}\)/);
        expect(code).toMatch(/const closed = \(detail\) => ctx\.emit\('closed', detail\);/);
    });

    it('the descriptor declares it the same way: event({ bubbles: true }) is { bubbles: true }', () => {
        const { code } = compile(sfc('@event(bubbles) saved: number;\n@event closed;', '<b @click="saved(1); closed()">x</b>'), 'card.pdx', [], undefined, {});
        expect(code).toContain(`events: { 'saved': { bubbles: true }, 'closed': {} }`);
    });
});

describe('$emit — removed', () => {
    it('is PDX_REMOVED_FORM, naming the function @event declares', () => {
        const r = compile(sfc("@event saved: number;\nfunction go() { $emit('saved', 1); }", '<b @click="go()">x</b>'), 'card.pdx', [], undefined, {});
        const w = r.warnings.find((x) => x.code === 'PDX_REMOVED_FORM');
        expect(w, '$emit compiled without a word').toBeDefined();
        expect(w!.message).toContain('@event');
    });

    it('control — the function @event declares is not a removed form', () => {
        const r = compile(sfc('@event saved: number;\nfunction go() { saved(1); }', '<b @click="go()">x</b>'), 'card.pdx', [], undefined, {});
        expect(codes(r)).not.toContain('PDX_REMOVED_FORM');
    });

    it('migrate rewrites it to the declared function, adding the declaration when it is missing', () => {
        const before = sfc("@event saved: number;\nfunction go(v) { $emit('saved', v); $emit(\"picked\"); }", '<b @click="$emit(\'closed\', 2)">x</b>');
        const after = (emitRemoved.fix as (t: string) => string)(before);
        expect(after).toContain('function go(v) { saved(v); picked(); }');
        expect(after).toContain('<b @click="closed(2)">x</b>');
        expect(after).toContain('@event picked: unknown;');
        expect(after).toContain('@event closed: unknown;');
        expect(after.match(/@event saved/g), 'an existing declaration was added again').toHaveLength(1);
        expect(emitRemoved.detect(after)).toEqual([]);
    });

    it('migrate rewrites a hyphenated name to its camelCase emitter and declares it quoted (#749)', () => {
        const before = sfc("function go(v) { $emit('open-change', v); }", '<b @click="$emit(\'value-change\', 2)">x</b>');
        const after = (emitRemoved.fix as (t: string) => string)(before);
        expect(after).toContain('function go(v) { openChange(v); }');
        expect(after).toContain('<b @click="valueChange(2)">x</b>');
        expect(after).toContain("@event 'open-change': unknown;");
        expect(after).toContain("@event 'value-change': unknown;");
        expect(emitRemoved.detect(after)).toEqual([]);
        // A second run changes nothing.
        expect((emitRemoved.fix as (t: string) => string)(after)).toBe(after);
    });

    it('migrate still leaves a name no @event can declare for a person', () => {
        // Neither an identifier nor a quoted name: uppercase and a hyphen.
        const before = sfc("function go() { $emit('Open-Change', 1); }", '<b @click="go()">x</b>');
        const after = (emitRemoved.fix as (t: string) => string)(before);
        expect(after).toContain("$emit('Open-Change', 1)");
        expect(emitRemoved.detect(after)).toHaveLength(1);
    });
});

describe('@event with a quoted name (#749)', () => {
    it('is read under its quoted name, with its camelCase emitter; (bubbles) works with it', () => {
        const { events, warnings } = analyzeScript("@event 'open-change': { value: boolean };\n@event(bubbles) 'value-change': number;", 'x.pdx');
        expect(warnings).toEqual([]);
        expect(events).toEqual([
            { name: 'open-change', emitter: 'openChange', payloadType: '{ value: boolean }' },
            { name: 'value-change', emitter: 'valueChange', payloadType: 'number', bubbles: true },
        ]);
    });

    it('a name that is not lowercase letters, digits and hyphens is PDX_UNKNOWN_DECLARATION, with the form as its hint', () => {
        for (const bad of ["@event 'Open-Change': number;", "@event 'open_change': number;", "@event '1-change';", "@event 'open change';"]) {
            const { events, warnings } = analyzeScript(bad, 'x.pdx');
            expect(events, bad).toEqual([]);
            const w = warnings.find((x) => x.code === 'PDX_UNKNOWN_DECLARATION');
            expect(w, `${bad} was accepted`).toBeDefined();
            expect(w!.hint).toContain("@event 'open-change'");
        }
    });

    it('the emitter is the camelCase of the name, and dispatches the quoted name', () => {
        const { code, warnings } = compile(sfc("@event 'open-change': { value: boolean };\n@event(bubbles) 'value-change': number;", '<b @click="openChange({ value: true }); valueChange(1)">x</b>'), 'card.pdx', [], undefined, {});
        expect(codes({ warnings }).filter((c) => c !== 'PDX_EVENT_BUBBLES_UNUSED')).toEqual([]);
        expect(code).toMatch(/const openChange = \(detail\) => ctx\.emit\('open-change', detail\);/);
        expect(code).toMatch(/const valueChange = \(detail\) => ctx\.emit\('value-change', detail, \{ bubbles: true \}\)/);
        expect(code).toContain(`events: { 'open-change': {}, 'value-change': { bubbles: true } }`);
    });

    it('two declarations with one emitter are PDX_DUP_EVENT', () => {
        const r = compile(sfc("@event 'open-change': boolean;\n@event openChange: boolean;", '<b @click="openChange(true)">x</b>'), 'card.pdx', [], undefined, {});
        expect(codes(r)).toContain('PDX_DUP_EVENT');
    });

    it('the .d.ts lists the event under its quoted name', () => {
        const { events } = analyzeScript("@event 'open-change': { value: boolean };", 'x.pdx');
        const dts = generateDts({ tag: 'app-card', props: [], events, slots: [] });
        expect(dts).toContain("'open-change': { value: boolean };");
    });

    it('pdx migrate writes (bubbles) on a quoted @event as on any other', () => {
        const before = sfc("@event 'open-change': unknown;");
        const after = (eventBubbles.fix as (t: string) => string)(before);
        expect(after).toContain("@event(bubbles) 'open-change': unknown;");
    });
});

describe('pdx migrate keeps an alpha project bubbling', () => {
    it('writes (bubbles) on every @event that has no option', () => {
        const before = sfc('@event saved: number;\n  @event closed;\n@event(bubbles) opened;');
        expect(eventBubbles.detect(before).map((f) => f.found)).toEqual(['@event saved: number;', '@event closed;']);
        const after = (eventBubbles.fix as (t: string) => string)(before);
        expect(after).toContain('@event(bubbles) saved: number;');
        expect(after).toContain('  @event(bubbles) closed;');
        expect(after).toContain('@event(bubbles) opened;');
        expect(after).not.toContain('(bubbles)(bubbles)');
        expect(eventBubbles.detect(after)).toEqual([]);
    });

    it('control — an @event in the template or in a string is not touched', () => {
        const text = sfc("const doc = '@event saved: number;';", '<p>@event in prose</p>');
        expect(eventBubbles.detect(text)).toEqual([]);
    });
});

describe('PDX_EVENT_BUBBLES_UNUSED', () => {
    const src = sfc('@event(bubbles) saved: number;\n@event(bubbles) closed;\n@event plain;', '<b @click="saved(1); closed(); plain()">x</b>');

    it('lists a bubbling event no element above the component listens to', () => {
        const r = compile(src, 'card.pdx', [], undefined, { eventHeardAbove: (name) => name === 'closed' });
        const unused = r.warnings.filter((w) => w.code === 'PDX_EVENT_BUBBLES_UNUSED');
        expect(unused.map((w) => w.severity)).toEqual(['info']);
        expect(unused[0].message).toContain("'saved'");
    });

    it('control — without the project to look in, it says nothing', () => {
        expect(codes(compile(src, 'card.pdx', [], undefined, {}))).not.toContain('PDX_EVENT_BUBBLES_UNUSED');
    });
});

describe('the resolver knows who listens above a component', () => {
    it('reads the project\'s templates: a listener on another tag counts, one on the component does not', () => {
        const root = mkdtempSync(join(tmpdir(), 'pdx-bubbles-'));
        try {
            mkdirSync(join(root, 'src'), { recursive: true });
            writeFileSync(join(root, 'src', 'card.pdx'), sfc('@event(bubbles) saved: number;\n@event(bubbles) closed;', '<b @click="saved(1); closed()">x</b>'));
            const page = join(root, 'src', 'page.pdx');
            writeFileSync(page, sfc('let n = $signal(0);', '<section @saved.stop="n++"><app-card @closed="n++"></app-card></section>'));
            const r = new ComponentResolver();
            r.registerProjectComponents(root);
            expect(r.eventHeardAbove('saved', 'app-card'), 'the section\'s listener hears it only by bubbling').toBe(true);
            expect(r.eventHeardAbove('closed', 'app-card'), 'a listener on the component itself needs no bubbling').toBe(false);
            // Read again when the file changes.
            writeFileSync(page, sfc('let n = $signal(0);', '<section><app-card @saved="n++"></app-card></section>'));
            utimesSync(page, new Date(), new Date(Date.now() + 5000));
            expect(r.eventHeardAbove('saved', 'app-card')).toBe(false);
        } finally {
            rmSync(root, { recursive: true, force: true });
        }
    });
});
