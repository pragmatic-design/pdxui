// `@action … with { agent: '…' }` (#502, decision 31): an agent has no capability a person does not. An
// action an agent may call must be run by a control of the template — a `:action="name"` binding, or a
// handler that calls `name.execute(…)` or `name(…)` — or it is PDX_AGENT_ACTION_UNBOUND on its line.

import { describe, it, expect } from 'vitest';
import { compile } from '../src/plugin';

const AGENT = "@action save(dto: string) with { agent: 'Save the draft', consequential: true } {\n  await Promise.resolve(dto);\n}";
const file = (template: string, action = AGENT) =>
    `<template>${template}</template>\n<script>\nlet draft = $signal('');\n${action}\n</script>\n`;
const unbound = (template: string, action?: string) =>
    compile(file(template, action), 'editor.pdx').warnings.filter((w) => w.code === 'PDX_AGENT_ACTION_UNBOUND');

describe('an @action with agent needs a control a person can use', () => {
    it('with no control in the template it is PDX_AGENT_ACTION_UNBOUND, an error on the @action line', () => {
        const [w, ...rest] = unbound('<p>{{ draft }}</p>');
        expect(rest).toEqual([]);
        expect(w).toMatchObject({ severity: 'error', line: 4 });
        expect(w.message).toContain('save');
    });

    it('control — a <pdx-button :action="save"> runs it', () => {
        expect(unbound('<pdx-button :action="save" :action-arg="draft">Save</pdx-button>')).toEqual([]);
    });

    it('control — a handler that calls save.execute(…) runs it', () => {
        expect(unbound('<button @click="save.execute(draft)">Save</button>')).toEqual([]);
    });

    it('control — a handler that calls save(…) runs it', () => {
        expect(unbound('<form @submit.prevent="save(draft)"><button>Save</button></form>')).toEqual([]);
    });

    it("control — a handler holding the other quote, save.execute('x'), runs it", () => {
        expect(unbound('<button @click="save.execute(\'x\')">Save</button>')).toEqual([]);
    });

    it('a control inside a block counts too', () => {
        expect(unbound('@if (draft) { <pdx-button :action="save">Save</pdx-button> }')).toEqual([]);
    });

    it('a name that only contains the action\'s is not a control of it', () => {
        expect(unbound('<button @click="autosave.execute(draft)">x</button>')).toHaveLength(1);
    });

    it('an action without agent is not checked', () => {
        expect(unbound('<p>{{ draft }}</p>', '@action save(dto: string) { await Promise.resolve(dto); }')).toEqual([]);
    });
});
