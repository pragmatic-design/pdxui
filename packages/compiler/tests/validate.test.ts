// Tests for the validation pass — semantic checks on .pdx components.

import { describe, it, expect } from 'vitest';
import { compile } from '../src/plugin';
import { analyzeScript } from '../src/compiler/script-analyzer';
import { validate, type ValidationWarning } from '../src/compiler/validate';
import { parseTemplate } from '../src/parser/template';

/** Filter to only warn/error level diagnostics (ignore info). */
function warnAndErrors(warnings: ValidationWarning[]): ValidationWarning[] {
    return warnings.filter(w => w.severity === 'warn' || w.severity === 'error');
}

// ─── @prop without type ───────────────────────────────────────────

describe('validation: @prop without type', () => {
    it('warns on @prop without type annotation', () => {
        const analysis = analyzeScript(`
            @prop label = 'Hello';
            let count = $signal(0);
        `, 'test.pdx');

        expect(analysis.warnings).toHaveLength(1);
        expect(analysis.warnings[0].code).toBe('PDX_PROP_NO_TYPE');
        expect(analysis.warnings[0].message).toContain('label');
        expect(analysis.warnings[0].hint).toContain('@prop label: string');
    });

    it('warns on @prop with only name (no type, no default)', () => {
        const analysis = analyzeScript(`
            @prop name;
            let x = $signal(0);
        `, 'test.pdx');

        expect(analysis.warnings).toHaveLength(1);
        expect(analysis.warnings[0].code).toBe('PDX_PROP_NO_TYPE');
    });

    it('does not warn on valid @prop with type', () => {
        const analysis = analyzeScript(`
            @prop label: string = 'Hello';
            @prop count: number;
        `, 'test.pdx');

        expect(analysis.warnings).toHaveLength(0);
    });

    it('does not warn on @prop with array type', () => {
        const analysis = analyzeScript(`
            @prop items: string[];
        `, 'test.pdx');

        expect(analysis.warnings).toHaveLength(0);
        expect(analysis.props).toHaveLength(1);
        expect(analysis.props[0].tsType).toBe('string[]');
    });
});

// ─── Non-reactive variables in template ──────────────────────────

describe('validation: non-reactive template variables', () => {
    it('warns when plain let is used in template interpolation', () => {
        const analysis = analyzeScript(`
            @prop label: string = 'Hello';
            let count = $signal(0);
            let maxCount = 100;
        `, 'test.pdx');

        const ast = parseTemplate('{{ maxCount }}');
        const warnings = warnAndErrors(validate(analysis, ast, 'test.pdx'));

        expect(warnings).toHaveLength(1);
        expect(warnings[0].code).toBe('PDX_NON_REACTIVE');
        expect(warnings[0].message).toContain('maxCount');
        expect(warnings[0].hint).toContain('$signal');
    });

    it('does not warn for signal variables', () => {
        const analysis = analyzeScript(`
            let count = $signal(0);
        `, 'test.pdx');

        const ast = parseTemplate('{{ count }}');
        const warnings = warnAndErrors(validate(analysis, ast, 'test.pdx'));

        expect(warnings).toHaveLength(0);
    });

    it('does not warn for derived variables', () => {
        const analysis = analyzeScript(`
            let count = $signal(0);
            const doubled = $derived(count * 2);
        `, 'test.pdx');

        const ast = parseTemplate('{{ doubled }}');
        const warnings = warnAndErrors(validate(analysis, ast, 'test.pdx'));

        expect(warnings).toHaveLength(0);
    });

    it('does not warn for prop variables', () => {
        const analysis = analyzeScript(`
            @prop label: string = 'Hello';
        `, 'test.pdx');

        const ast = parseTemplate('{{ label }}');
        const warnings = warnAndErrors(validate(analysis, ast, 'test.pdx'));

        expect(warnings).toHaveLength(0);
    });

    it('does not warn for function names in template', () => {
        const analysis = analyzeScript(`
            let count = $signal(0);
            function increment() { count++; }
        `, 'test.pdx');

        const ast = parseTemplate('<button @click="increment">+</button>');
        const warnings = warnAndErrors(validate(analysis, ast, 'test.pdx'));

        expect(warnings).toHaveLength(0);
    });

    it('warns for a reassignable non-reactive let in @if condition', () => {
        const analysis = analyzeScript(`
            let count = $signal(0);
            let threshold = 10;
        `, 'test.pdx');

        const ast = parseTemplate('@if (count > threshold) { <span>Over!</span> }');
        const warnings = warnAndErrors(validate(analysis, ast, 'test.pdx'));

        expect(warnings).toHaveLength(1);
        expect(warnings[0].code).toBe('PDX_NON_REACTIVE');
        expect(warnings[0].message).toContain('threshold');
    });

    it('does NOT warn for an immutable const in the template (static value, never changes)', () => {
        const analysis = analyzeScript(`
            let count = $signal(0);
            const threshold = 10;
        `, 'test.pdx');

        const ast = parseTemplate('@if (count > threshold) { <span>Over!</span> }');
        const warnings = warnAndErrors(validate(analysis, ast, 'test.pdx'));

        expect(warnings.filter(w => w.code === 'PDX_NON_REACTIVE')).toHaveLength(0);
    });

    it('does not warn for @for loop variables', () => {
        const analysis = analyzeScript(`
            let items = $signal([]);
        `, 'test.pdx');

        const ast = parseTemplate('@for (items as item; track item.id) { <span>{{ item.name }}</span> }');
        const warnings = warnAndErrors(validate(analysis, ast, 'test.pdx'));

        expect(warnings).toHaveLength(0);
    });

    it('does not warn for JS globals (Math, Date, etc.)', () => {
        const analysis = analyzeScript(`
            let count = $signal(0);
        `, 'test.pdx');

        const ast = parseTemplate('{{ Math.floor(count / 2) }}');
        const warnings = warnAndErrors(validate(analysis, ast, 'test.pdx'));

        expect(warnings).toHaveLength(0);
    });

    it('does not warn in legacy mode', () => {
        const analysis = analyzeScript(`
            const props = defineProps({ label: { type: String } });
            let x = 42;
            return { x };
        `, 'test.pdx');

        const ast = parseTemplate('{{ x }}');
        const warnings = warnAndErrors(validate(analysis, ast, 'test.pdx'));

        expect(warnings).toHaveLength(0);
    });

    it('warns for plain let in @show condition', () => {
        const analysis = analyzeScript(`
            let visible = $signal(true);
            let adminMode = false;
        `, 'test.pdx');

        // Note: we need the export for adminMode to be detected
        const ast = parseTemplate('@show (adminMode) { <div>Admin panel</div> }');
        const warnings = warnAndErrors(validate(analysis, ast, 'test.pdx'));

        expect(warnings).toHaveLength(1);
        expect(warnings[0].message).toContain('adminMode');
    });
});

// ─── Integration: compile() returns warnings ─────────────────────

describe('validation: compile() integration', () => {
    it('compile returns warnings for @prop without type', () => {
        const source = `
<template>
  <div>{{ label }}</div>
</template>
<script setup>
@prop label = 'Hello';
let count = $signal(0);
</script>`;

        const result = compile(source, 'test.pdx');
        expect(result.warnings.length).toBeGreaterThan(0);
        expect(result.warnings.some(w => w.code === 'PDX_PROP_NO_TYPE')).toBe(true);
    });

    it('compile returns warnings for non-reactive template variable', () => {
        const source = `
<template>
  <div>{{ maxItems }}</div>
</template>
<script setup>
@prop label: string = 'Hello';
let count = $signal(0);
let maxItems = 100;
</script>`;

        const result = compile(source, 'test.pdx');
        expect(result.warnings.some(w => w.code === 'PDX_NON_REACTIVE')).toBe(true);
    });

    it('compile returns no warnings for correct code', () => {
        const source = `
<template>
  <div>{{ count }}</div>
</template>
<script setup>
@prop label: string = 'Hello';
let count = $signal(0);
const doubled = $derived(count * 2);
</script>`;

        const result = compile(source, 'test.pdx');
        const warns = result.warnings.filter(w => w.severity !== 'info');
        expect(warns).toHaveLength(0);
    });

    it('compile returns no warnings for legacy mode', () => {
        // The block is a plain `<script>`, and that is the point of the fixture rather than an
        // incidental detail: this file IS legacy, and says so. `<script setup>` around the same body
        // would be a disagreement — the author claims the new mode and the compiler builds the legacy
        // one. That warns (PDX_LEGACY_IN_SETUP), and asserting silence on it here would be asserting
        // the defect.
        const source = `
<template>
  <div>{{ count }}</div>
</template>
<script>
let count = 0;
return { count };
</script>`;

        const result = compile(source, 'test.pdx');
        expect(result.warnings).toHaveLength(0);
    });
});

// ─── HTML binding attribute extraction ────────────────────────────

describe('validation: HTML binding identifiers', () => {
    it('detects non-reactive variable in :prop binding', () => {
        const analysis = analyzeScript(`
            let count = $signal(0);
            let label = 'static';
        `, 'test.pdx');

        const ast = parseTemplate('<div :title="label">Hello</div>');
        const warnings = warnAndErrors(validate(analysis, ast, 'test.pdx'));

        expect(warnings).toHaveLength(1);
        expect(warnings[0].message).toContain('label');
    });

    it('does not warn for signal in ::two-way binding', () => {
        const analysis = analyzeScript(`
            let value = $signal('');
        `, 'test.pdx');

        const ast = parseTemplate('<input ::value="value" />');
        const warnings = validate(analysis, ast, 'test.pdx');

        expect(warnings).toHaveLength(0);
    });
});

// ─── New Validation Checks (P2) ──────────────────────────────────

describe('Circular $derived detection', () => {
    it('detects circular dependency: a → b → a', () => {
        const analysis = analyzeScript(`
const a = $derived(b * 2);
const b = $derived(a + 1);
`, 'test.pdx');
        const ast = parseTemplate('<div>{{ a }}</div>');
        const warnings = validate(analysis, ast, 'test.pdx');
        const circular = warnings.filter(w => w.code === 'PDX_CIRCULAR_DERIVED');
        expect(circular.length).toBeGreaterThan(0);
    });

    // References collected with a regex over the expression would count a property name as a
    // reference — `currentParams().tag` "reads" the derived `tag` — and every derived that could
    // reach the supposed cycle would be reported as being on it.
    function circularOf(script: string) {
        const analysis = analyzeScript(script, 'test.pdx');
        return validate(analysis, parseTemplate('<div></div>'), 'test.pdx').filter(w => w.code === 'PDX_CIRCULAR_DERIVED');
    }

    it('a property name is not a reference: currentParams().tag does not read the derived tag', () => {
        expect(circularOf(`
const _decl = $derived(getComponent(currentParams().tag || '') || null);
const tag = $derived(_decl ? _decl.tagName : (currentParams().tag || 'unknown'));
const title = $derived(tag + '!');
`)).toHaveLength(0);
    });

    it('nor is optional chaining, a string, or an object key', () => {
        expect(circularOf(`
const a = $derived(obj?.b ?? 'b');
const b = $derived({ a: 1, label: a });
`)).toHaveLength(0);
    });

    it('a real cycle is reported once per member, and names the cycle', () => {
        const circular = circularOf(`
let x = $signal(0);
const a = $derived(b + x);
const b = $derived(a + 1);
const reader = $derived(a * 2);
`);
        expect(circular.map(w => w.message).join('\n')).toContain('a → b → a');
        expect(circular.some(w => w.message.includes("'reader'")), 'a derived that only reads a cycle member is not on it').toBe(false);
    });

    it('no false positive for non-circular deriveds', () => {
        const analysis = analyzeScript(`
let x = $signal(0);
const a = $derived(x * 2);
const b = $derived(a + 1);
`, 'test.pdx');
        const ast = parseTemplate('<div>{{ b }}</div>');
        const warnings = validate(analysis, ast, 'test.pdx');
        const circular = warnings.filter(w => w.code === 'PDX_CIRCULAR_DERIVED');
        expect(circular).toHaveLength(0);
    });
});

describe('@expose undeclared names', () => {
    it('warns on @expose of undeclared name', () => {
        const analysis = analyzeScript(`
let count = $signal(0);
@expose count, nonExistent;
`, 'test.pdx');
        const ast = parseTemplate('<div>{{ count }}</div>');
        const warnings = validate(analysis, ast, 'test.pdx');
        const expose = warnings.filter(w => w.code === 'PDX_EXPOSE_UNDECLARED');
        expect(expose).toHaveLength(1);
        expect(expose[0].message).toContain('nonExistent');
    });
});

describe('@prop default type mismatch', () => {
    it('warns when string prop has number default', () => {
        const analysis = analyzeScript(`@prop label: string = 42;`, 'test.pdx');
        const ast = parseTemplate('<div>{{ label }}</div>');
        const warnings = validate(analysis, ast, 'test.pdx');
        const mismatch = warnings.filter(w => w.code === 'PDX_PROP_TYPE_MISMATCH');
        expect(mismatch).toHaveLength(1);
    });

    it('warns when number prop has string default', () => {
        const analysis = analyzeScript(`@prop count: number = 'zero';`, 'test.pdx');
        const ast = parseTemplate('<div>{{ count }}</div>');
        const warnings = validate(analysis, ast, 'test.pdx');
        const mismatch = warnings.filter(w => w.code === 'PDX_PROP_TYPE_MISMATCH');
        expect(mismatch).toHaveLength(1);
    });

    it('no false positive for correct types', () => {
        const analysis = analyzeScript(`@prop label: string = 'hello';`, 'test.pdx');
        const ast = parseTemplate('<div>{{ label }}</div>');
        const warnings = validate(analysis, ast, 'test.pdx');
        const mismatch = warnings.filter(w => w.code === 'PDX_PROP_TYPE_MISMATCH');
        expect(mismatch).toHaveLength(0);
    });
});

describe('@page path validation', () => {
    it('errors on path without leading /', () => {
        const analysis = analyzeScript(`@page 'users';`, 'test.pdx');
        const ast = parseTemplate('<div>Page</div>');
        const warnings = validate(analysis, ast, 'test.pdx');
        const invalid = warnings.filter(w => w.code === 'PDX_PAGE_INVALID_PATH');
        expect(invalid).toHaveLength(1);
    });

    it('warns on invalid param constraint type', () => {
        const analysis = analyzeScript(`@page '/users/:id(invalid)';`, 'test.pdx');
        const ast = parseTemplate('<div>Page</div>');
        const warnings = validate(analysis, ast, 'test.pdx');
        const constraint = warnings.filter(w => w.code === 'PDX_PAGE_INVALID_CONSTRAINT');
        expect(constraint).toHaveLength(1);
    });

    it('errors on empty param constraint', () => {
        const analysis = analyzeScript(`@page '/users/:id()';`, 'test.pdx');
        const ast = parseTemplate('<div>Page</div>');
        const warnings = validate(analysis, ast, 'test.pdx');
        const empty = warnings.filter(w => w.code === 'PDX_PAGE_EMPTY_CONSTRAINT');
        expect(empty).toHaveLength(1);
    });

    it('valid path passes', () => {
        const analysis = analyzeScript(`@page '/users/:id(number)';`, 'test.pdx');
        const ast = parseTemplate('<div>Page</div>');
        const warnings = validate(analysis, ast, 'test.pdx');
        const pathIssues = warnings.filter(w => w.code.startsWith('PDX_PAGE_'));
        expect(pathIssues).toHaveLength(0);
    });
});

// ─── PDX_UNUSED_REACTIVE — AST-based reference check ──────────────────────────────
describe('validation: unused reactive (AST reference check)', () => {
    const unusedFor = (analysis: ReturnType<typeof analyzeScript>, ast: ReturnType<typeof parseTemplate>) =>
        validate(analysis, ast, 'test.pdx').filter(w => w.code === 'PDX_UNUSED_REACTIVE');

    it('(a) a signal used once via a wrapper function is NOT flagged unused', () => {
        const analysis = analyzeScript(`
            let count = $signal(0);
            function isOver() { return count > 0; }
        `, 'test.pdx');
        const ast = parseTemplate('<button @click="isOver">x</button>');
        expect(unusedFor(analysis, ast).some(w => w.message.includes("'count'"))).toBe(false);
    });

    it('(b) a signal appearing only in a comment/string IS still flagged unused', () => {
        const analysis = analyzeScript(`
            let count = $signal(0);
            const note = "count goes here"; // count
        `, 'test.pdx');
        const ast = parseTemplate('<div>static</div>');
        expect(unusedFor(analysis, ast).some(w => w.message.includes("'count'"))).toBe(true);
    });

    it('(d) a derived read only by ANOTHER derived is not unused', () => {
        // The builder does exactly this: `current` feeds `frameSrc`, and only `frameSrc` reaches
        // the template. The check looked in the template and in function bodies, and a top-level
        // $derived initialiser is neither — so it told the author to rename a live variable to
        // `_current`, which would have broken the page. A warning that is wrong is worse than no
        // warning: it teaches people to stop reading them.
        const analysis = analyzeScript(`
            let name = $signal('a');
            const current = $derived(name.toUpperCase());
            const label = $derived(current + '!');
        `, 'test.pdx');
        const ast = parseTemplate('<div>{{ label }}</div>');
        const flagged = unusedFor(analysis, ast).map(w => w.message);
        expect(flagged.some(m => m.includes("'current'")), 'a derived feeding another derived was called unused').toBe(false);
        expect(flagged.some(m => m.includes("'name'")), 'the signal behind it was called unused too').toBe(false);
    });

    it('(e) a derived nothing reads at all is still flagged', () => {
        // The guard above must not become "never warn": the check has to keep finding the real thing.
        const analysis = analyzeScript(`
            let name = $signal('a');
            const orphan = $derived(name + '?');
        `, 'test.pdx');
        const ast = parseTemplate('<div>{{ name }}</div>');
        expect(unusedFor(analysis, ast).some(w => w.message.includes("'orphan'")),
            'a genuinely unread derived stopped being reported').toBe(true);
    });

    it('(c) an unparseable body does not crash and is treated conservatively (no warning)', () => {
        const analysis = analyzeScript('let count = $signal(0);', 'test.pdx');
        analysis.body = '} else { count'; // malformed fragment that mentions the name
        const ast = parseTemplate('<div>static</div>');
        expect(() => validate(analysis, ast, 'test.pdx')).not.toThrow();
        expect(unusedFor(analysis, ast)).toHaveLength(0);
    });
});

// ─── A legacy marker inside <script setup> ────────────────────────
//
// `<script setup>` states an intent, and this checks it against what the compiler produces:
// `<script setup>` carrying `defineProps` and no rune compiles as a LEGACY component — no new-mode
// setup, so every rune-shaped thing in it would be inert — and carrying both compiles as NEW, where
// the `defineProps` the author wrote does nothing.
//
// The diagnostic does not make either an error: a legacy component is still valid, and making
// `setup` FORCE the new mode would break any file that carries both. It must simply not be silent.
describe('a legacy marker inside <script setup>', () => {
    const analyse = (body: string): ValidationWarning[] =>
        analyzeScript(body, 'test.pdx', { setup: true }).warnings.filter(w => w.code === 'PDX_LEGACY_IN_SETUP');

    it('warns when defineProps takes the file to the legacy mode', () => {
        const analysis = analyzeScript(
            "const props = defineProps({ label: { type: String } });\nconst n = signal(0);\nreturn { n };",
            'test.pdx', { setup: true });

        expect(analysis.mode, 'the premise: this is the legacy mode').toBe('legacy');
        const found = analysis.warnings.filter(w => w.code === 'PDX_LEGACY_IN_SETUP');
        expect(found).toHaveLength(1);
        expect(found[0].severity).toBe('warn');
        expect(found[0].message, 'the message must name the marker').toContain('defineProps');
        expect(found[0].message, 'and say which mode won, which is the actionable part')
            .toContain('legacy');
    });

    it('warns when the runes win and the defineProps is the dead half', () => {
        const analysis = analyzeScript(
            "const props = defineProps({ label: { type: String } });\nlet count = $signal(0);",
            'test.pdx', { setup: true });

        expect(analysis.mode, 'the premise: a rune takes it to the new mode').toBe('new');
        const found = analysis.warnings.filter(w => w.code === 'PDX_LEGACY_IN_SETUP');
        expect(found).toHaveLength(1);
        expect(found[0].message).toContain('defineProps');
        expect(found[0].hint, 'the fix is to drop the marker, not the setup').toContain('@prop');
    });

    it('names defineEmits when that is the marker', () => {
        const found = analyse("const emit = defineEmits(['changed']);\nlet count = $signal(0);");
        expect(found).toHaveLength(1);
        expect(found[0].message).toContain('defineEmits');
    });

    it('names a top-level return, which is the marker nobody recognises as one', () => {
        const found = analyse("const n = 1;\nreturn { n };");
        expect(found).toHaveLength(1);
        expect(found[0].message).toContain('return');
    });

    it('says nothing for a plain <script>, which claimed nothing', () => {
        const analysis = analyzeScript(
            "const props = defineProps({ label: { type: String } });\nconst n = signal(0);\nreturn { n };",
            'test.pdx', { setup: false });

        expect(analysis.mode).toBe('legacy');
        expect(analysis.warnings.filter(w => w.code === 'PDX_LEGACY_IN_SETUP')).toEqual([]);
    });

    it('says nothing for a <script setup> with no legacy marker', () => {
        expect(analyse("let count = $signal(0);\nfunction inc() { count++; }")).toEqual([]);
    });

    it('does not read a marker out of a comment or a string', () => {
        expect(analyse("// defineProps is the old way\nconst s = 'defineEmits(...)';\nlet n = $signal(0);"))
            .toEqual([]);
    });

    it('reaches compile(), which is where a developer would see it', () => {
        const out = compile(
            '<template><div>x</div></template>\n<script setup>\nconst props = defineProps({ label: { type: String } });\nconst n = signal(0);\nreturn { n };\n</script>',
            'legacy-in-setup.pdx');
        expect(out.warnings.map(w => w.code)).toContain('PDX_LEGACY_IN_SETUP');
    });
});

// ─── A declaration no rule understood ─────────────────────────────
//
// A line like `@form f { … }` (the colon is missing), pushed into the setup body as if it were
// code, fails to parse — `@` opens nothing valid in JavaScript — and validate's own syntax check
// reports `Syntax error in <script setup>: Declaration expected.`: a TypeScript parser's opinion of a
// line the author wrote as a framework declaration. It names neither the keyword nor the shape
// expected, and the generated module still carries the line.
//
// `@fetch` has its own diagnostic, PDX_FETCH_INVALID, and keeps it.
describe('a declaration no rule understood', () => {
    const file = (body: string): string =>
        `<template><div>x</div></template>\n<script setup>\n${body}\nlet n = $signal(0);\n</script>`;

    const codesOf = (body: string): string[] => compile(file(body), 'unknown-decl.pdx').warnings.map(w => w.code);

    it('names the keyword and the shape, instead of a TypeScript parse error', () => {
        const result = compile(file('@form f { name: string }'), 'unknown-decl.pdx');
        const found = result.warnings.filter(w => w.code === 'PDX_UNKNOWN_DECLARATION');

        expect(found).toHaveLength(1);
        expect(found[0].severity, 'a dropped declaration is never what the author meant').toBe('error');
        expect(found[0].message).toContain('@form');
        expect(found[0].message, 'it must say what happened to it').toContain('dropped');
        expect(found[0].hint, 'and what the accepted shape is').toContain('@form name: {');
    });

    it('stops the cascade: the module parses, and the line is not in it', () => {
        const result = compile(file('@form f { name: string }'), 'unknown-decl.pdx');

        expect(result.warnings.map(w => w.code), 'the TypeScript error was a consequence, not the cause')
            .not.toContain('PDX_SCRIPT_SYNTAX_ERROR');
        expect(result.code.split('\n').filter(l => /^\s*@[a-zA-Z]/.test(l)),
            'the declaration reached the generated module as text').toEqual([]);
        const body = result.code.split('\n').filter(l => !/^\s*(import|export)\s/.test(l)).join('\n');
        expect(() => new Function(body), 'the emitted module does not parse').not.toThrow();
    });

    it('covers the declarations, not just the two that were measured', () => {
        expect(codesOf("@meta name 'description' 'x';")).toContain('PDX_UNKNOWN_DECLARATION');
        expect(codesOf('@page;')).toContain('PDX_UNKNOWN_DECLARATION');
        expect(codesOf('@guard;')).toContain('PDX_UNKNOWN_DECLARATION');
        expect(codesOf('@provide cart;')).toContain('PDX_UNKNOWN_DECLARATION');
        expect(codesOf('@title;')).toContain('PDX_UNKNOWN_DECLARATION');
        expect(codesOf('@scroll;')).toContain('PDX_UNKNOWN_DECLARATION');
    });

    it('carries the shape of the keyword it found, not a generic one', () => {
        const meta = compile(file("@meta name 'description' 'x';"), 'unknown-decl.pdx')
            .warnings.find(w => w.code === 'PDX_UNKNOWN_DECLARATION');
        expect(meta?.hint).toContain("@meta description:");
    });

    it('leaves the well-formed ones alone', () => {
        for (const decl of [
            "@form user: { name: string { required } }",
            "@fetch users: 'GET /api/users';",
            "@meta description: 'text';",
            "@title 'Dashboard';",
            "@page '/users/:id';",
            "@prop label: string = 'Hello';",
            "@provide cart = 1;",
        ]) {
            expect(codesOf(decl), `${decl} was reported as unrecognised`)
                .not.toContain('PDX_UNKNOWN_DECLARATION');
        }
    });

    it('does not read a declaration out of a comment or a string', () => {
        expect(codesOf("// @form f { name: string }")).not.toContain('PDX_UNKNOWN_DECLARATION');
        expect(codesOf("const s = '@page /x';")).not.toContain('PDX_UNKNOWN_DECLARATION');
    });

    it('is not fired by an @word that is not a declaration keyword', () => {
        expect(codesOf('@notARune something;')).not.toContain('PDX_UNKNOWN_DECLARATION');
    });

    it('leaves @fetch to the diagnostic it already had', () => {
        const codes = codesOf("@fetch users '/api/users';");
        expect(codes, 'PDX_FETCH_INVALID is more specific and comes first').toContain('PDX_FETCH_INVALID');
        expect(codes).not.toContain('PDX_UNKNOWN_DECLARATION');
    });
});
