// A blank .pdx is never a component, and the compiler must not pretend otherwise.
//
// The symptom: a file is saved, and the component is not there — `customElements.get(...)` false,
// `Content-Length: 3`, an empty browser console, no line in the dev-server log; rewriting the same
// bytes fixes it. Without the guard, a blank source is served two different kinds of wrong:
//
//   dev server (dev-server-late-component.test.ts)  three newlines, HTTP 200, no component, silence
//   the transform on its own                        component('pdx-x', { render: `<div></div>` })
//
// The first is those three bytes, reproduced against a real Vite server. The
// second is worse in its own way: a blank source compiles to a component that REGISTERS — so
// `customElements.get()` answers true — and renders an empty <div>, which nothing downstream can
// tell from a component that legitimately draws nothing. Either way the page comes up missing a
// piece and every signal says it is fine.
//
// Two things are asserted:
//   1. a blank source raises, with a message naming the file — the void becomes a message;
//   2. before raising, the file is re-read ONCE, because the usual cause is a write still in
//      flight: the editor truncated the file and had not written it back when Vite read it.
// Together they are one rule, not two: blank input is never valid, so look at the disk once, and
// fail loudly if the disk agrees.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { pdx } from '../src/plugin';

const REAL = `<template>
  <em data-test="ok">ok</em>
</template>
`;

let root: string;

beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'pdx-empty-'));
    mkdirSync(join(root, 'src'), { recursive: true });
});

afterEach(() => rmSync(root, { recursive: true, force: true }));

/** The plugin's transform, called the way Vite calls it. */
function transform(code: string, id: string): unknown {
    const plugin = pdx() as unknown as { transform(code: string, id: string): unknown };
    return plugin.transform.call(plugin, code, id);
}

/** Write a file and hand its content to the transform, as the dev server does. */
function serve(name: string, onDisk: string, asRead = onDisk): unknown {
    const file = join(root, 'src', name);
    writeFileSync(file, onDisk);
    return transform(asRead, file);
}

describe('a blank .pdx is refused, loudly', () => {
    it('an empty file raises instead of compiling to an empty component', () => {
        expect(() => serve('probe.pdx', '')).toThrow(/PDX_EMPTY_SOURCE/);
    });

    it('a whitespace-only file raises too — three bytes is what the lab measured', () => {
        expect(() => serve('probe.pdx', ' \n ')).toThrow(/PDX_EMPTY_SOURCE/);
    });

    it('the message names the file, so the log says which one', () => {
        let message = '';
        try { serve('rooms-panel.pdx', ''); } catch (e) { message = String(e); }
        expect(message).toContain('rooms-panel.pdx');
    });

    it('the message says what to do, because the usual cause is a half-written save', () => {
        let message = '';
        try { serve('probe.pdx', ''); } catch (e) { message = String(e); }
        expect(message.toLowerCase()).toMatch(/sav|writ|empty/);
    });
});

describe('a write still in flight is not an error', () => {
    it('re-reads the file once: what is on disk wins over a blank read', () => {
        // Vite reads the file mid-write and gets nothing; by the time the transform runs the editor
        // has finished. Reading once here turns that whole case into a non-event.
        const out = serve('probe.pdx', REAL, '') as { code: string };
        expect(out, 'a blank read with content on disk still produced nothing').toBeTruthy();
        expect(out.code).toContain("component('pdx-probe'");
        expect(out.code).toContain('data-test="ok"');
    });

    it('and still raises when the disk agrees the file is blank', () => {
        expect(() => serve('probe.pdx', '', '')).toThrow(/PDX_EMPTY_SOURCE/);
    });

    it('a file that is not on disk at all raises the same way, not a read error', () => {
        expect(() => transform('', join(root, 'src', 'never-written.pdx'))).toThrow(/PDX_EMPTY_SOURCE/);
    });
});

describe('the guard does not touch anything else', () => {
    it('a real component still compiles', () => {
        const out = serve('widget.pdx', REAL) as { code: string };
        expect(out.code).toContain("component('pdx-widget'");
    });

    it('a file that is not a .pdx is not this plugin business', () => {
        expect(transform('', join(root, 'src', 'notes.txt'))).toBeNull();
    });
});
