// `@form` can carry the cross-field rule.
//
// `config.validate` gives the form a rule that reads every value and returns messages by field.
// An INLINE form's braces are its fields, so unlike an external one —
// `@form f: Schema { save: 'onSubmit' }` — they leave nowhere to put an option, and a large form
// would have to drop the rune to use the feature.
//
// So an inline form takes a SECOND block, after the fields, holding the same options an external
// form's single block holds.
import { describe, it, expect } from 'vitest';
import { compile } from '../src/plugin';

function setup(script: string) {
    return compile(`<template><div></div></template>\n<script setup>\n${script}\n</script>`, 'form-opts.pdx');
}

const INLINE_WITH_RULE = `
@form intake: {
  starts: string { required },
  ends: string { required },
} {
  validate: windowRule
};

function windowRule(v) {
  return v.starts && v.ends && v.ends < v.starts ? { ends: 'Ends before it starts' } : {};
}
`;

describe('@form with an options block', () => {
    it('passes validate through to createForm', () => {
        const r = setup(INLINE_WITH_RULE);
        expect(r.code).toContain('validate: windowRule');
    });

    it('still declares the fields it was given', () => {
        // The second block must not eat the first: the fields and their rules survive.
        const r = setup(INLINE_WITH_RULE);
        expect(r.code).toContain("starts: ''");
        expect(r.code).toContain("ends: ''");
        expect(r.code).toContain('required()');
    });

    it('compiles to something that parses', () => {
        // A second block left unconsumed would fall through as a stray statement, leaving the
        // module syntactically broken rather than missing a feature.
        const r = setup(INLINE_WITH_RULE);
        expect(() => new Function(r.code.replace(/^\s*import .*$/gm, ''))).not.toThrow();
    });

    it('and an external form takes it in the block it already had', () => {
        const r = setup("@form order: OrderSchema {\n  validate: crossRule;\n  save: 'onSubmit';\n};\nconst OrderSchema = {};\nfunction crossRule() { return {}; }");
        expect(r.code).toContain('validate: crossRule');
        expect(r.code).toContain("saveMode: 'onSubmit'");
    });

    it('and a form with no options block is untouched', () => {
        // The control: every `@form` written before this compiles exactly as it did.
        const r = setup('@form contact: {\n  name: string { required },\n};');
        expect(r.code).toContain("name: ''");
        expect(r.code).not.toContain('validate:');
    });
});
