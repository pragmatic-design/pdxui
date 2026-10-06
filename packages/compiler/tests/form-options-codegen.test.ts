// Codegen tests for @form extended options — warnUnsaved, source/parent/name.
// Verifies the compiler generates the runtime wiring instead of emitting inert config keys.

import { describe, it, expect } from 'vitest';
import { compile } from '../src/plugin';

function compileForm(script: string) {
    return compile(
        `<template><div>form</div></template>\n<script setup>\n${script}\n</script>`,
        'edit-user.pdx',
    );
}

// ─── warnUnsaved → createForm's own leave guard ──────
// Not `onBeforeLeave(() => !f.dirty() || confirm('You have unsaved changes…'))`: the browser's
// modal, a fixed English sentence, and a dialog no automated browser gets past. The guard lives in
// createForm, which asks through the in-app dialog with translatable strings, so @form and a
// createForm written in script take the same path.

describe('@form { warnUnsaved } — the option reaches createForm', () => {
    it('passes warnUnsaved to createForm (external schema)', () => {
        const { code } = compileForm('@form f: UserSchema { warnUnsaved: true }');
        const decl = code.split('\n').find(l => l.includes('const f = createForm(')) ?? '';
        expect(decl).toContain('warnUnsaved: true');
    });

    it('passes warnUnsaved to createForm (inline schema)', () => {
        const { code } = compileForm('@form order: OrderSchema { warnUnsaved }');
        const decl = code.split('\n').find(l => l.includes('const order = createForm(')) ?? '';
        expect(decl).toContain('warnUnsaved: true');
    });

    it('emits no window confirm() and no hand-made onBeforeLeave', () => {
        const { code } = compileForm('@form f: UserSchema { warnUnsaved: true }');
        expect(code).not.toMatch(/\bconfirm\(/);
        expect(code).not.toContain('onBeforeLeave');
    });

    it('control — without warnUnsaved the option is not emitted', () => {
        const { code } = compileForm('@form f: UserSchema { saveMode: "onBlur" }');
        expect(code).not.toContain('warnUnsaved');
    });
});

// ─── source / parent / name wiring ────────────────────────

describe('@form { source, parent } — coordinator + datasource wiring', () => {
    it('emits source, parent and name in the createForm config', () => {
        const { code } = compileForm('@form f: UserSchema { source: ds; parent: p }');

        expect(code).toContain('source: ds');
        expect(code).toContain('parent: p');
        expect(code).toContain("name: 'f'");
    });

    it('does not emit name when neither source nor parent is present', () => {
        const { code } = compileForm('@form f: UserSchema { saveMode: "onBlur" }');
        expect(code).not.toContain("name: 'f'");
    });

    it('emits source/parent/name for inline schema forms too', () => {
        const { code } = compileForm('@form order: OrderSchema { source: orderDs; parent: rootForm }');
        expect(code).toContain('source: orderDs');
        expect(code).toContain('parent: rootForm');
        expect(code).toContain("name: 'order'");
    });
});
