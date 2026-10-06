// Regression tests for `pdx check`:
//  - findings with severity:'error' (e.g. duplicate @event) must fail the
//    build (exit 1), not silently pass as warnings.
//  - i18n cross-locale check must look in <root>/translations, not the
//    doubled <root>/src/translations.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { Mock } from 'vitest';
import { mkdirSync, writeFileSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import checkCmd, { checkI18nKeys } from '../src/commands/check';

function tmpRoot(name: string): string {
    return join(tmpdir(), `pdx-check-${name}-${Date.now()}-${Math.floor(Math.random() * 1e6)}`);
}

describe('pdx check — exit code on error-severity findings', () => {
    let root: string;
    let prevCwd: string;
    let exitSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
        root = tmpRoot('exit');
        mkdirSync(root, { recursive: true });
        prevCwd = process.cwd();
        exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => undefined) as never);
    });

    afterEach(() => {
        process.chdir(prevCwd);
        exitSpy.mockRestore();
        rmSync(root, { recursive: true, force: true });
    });

    it('exits 1 when a component has a duplicate @event (severity: error)', async () => {
        // Duplicate @event → validator emits PDX_DUP_EVENT with severity:'error'.
        writeFileSync(join(root, 'widget.pdx'),
            '<template><button>x</button></template>\n' +
            '<script>\n@event changed: number;\n@event changed: number;\nlet n = $signal(0);\n</script>\n');

        process.chdir(root);
        await (checkCmd as any).run({
            args: { json: false, fix: false, severity: 'warn', i18n: false },
        });

        expect(exitSpy).toHaveBeenCalledWith(1);
    });

    it('does NOT exit 1 for a clean component', async () => {
        writeFileSync(join(root, 'ok.pdx'),
            '<template><button>x</button></template>\n' +
            '<script>\nlet n = $signal(0);\n</script>\n');

        process.chdir(root);
        await (checkCmd as any).run({
            args: { json: false, fix: false, severity: 'warn', i18n: false },
        });

        expect(exitSpy).not.toHaveBeenCalled();
    });
});

// The mistakes the compiler finds while GENERATING code — a bound name the component does not
// declare — reach `pdx check` too, not only `vite dev`'s console: validate() alone does not see them.
describe('pdx check — diagnostics found while generating code', () => {
    let root: string;
    let prevCwd: string;
    let exitSpy: ReturnType<typeof vi.spyOn>;
    let logSpy: Mock<typeof console.log>;

    beforeEach(() => {
        root = tmpRoot('codegen');
        mkdirSync(root, { recursive: true });
        prevCwd = process.cwd();
        exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => undefined) as never);
        logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    });

    afterEach(() => {
        process.chdir(prevCwd);
        exitSpy.mockRestore();
        logSpy.mockRestore();
        rmSync(root, { recursive: true, force: true });
    });

    async function checkJson(): Promise<{ files: { file: string; warnings: { code: string; message: string; line?: number; column?: number }[] }[] }> {
        process.chdir(root);
        await (checkCmd as any).run({ args: { json: true, fix: false, severity: 'warn', i18n: false } });
        const printed = logSpy.mock.calls.map((c) => String(c[0])).find((s) => s.trimStart().startsWith('{'));
        expect(printed, 'check printed no JSON report').toBeTruthy();
        return JSON.parse(printed!);
    }

    it('reports PDX_UNKNOWN_PROP for a bound name the component does not declare, with its line', async () => {
        writeFileSync(join(root, 'shell.pdx'),
            '<template>\n  <pdx-app-layout :withBordr="on"></pdx-app-layout>\n</template>\n' +
            '<script setup>\nlet on = $signal(false);\n</script>\n');
        const report = await checkJson();
        const warnings = report.files.flatMap((f) => f.warnings);
        const unknown = warnings.find((w) => w.code === 'PDX_UNKNOWN_PROP');
        expect(unknown, `no PDX_UNKNOWN_PROP in ${JSON.stringify(warnings)}`).toBeTruthy();
        expect(unknown!.message).toContain('withBordr');
        expect(unknown!.line).toBe(2);
        // Where the code is explained.
        expect((unknown as { url?: string }).url).toBe('https://pdxui.com/docs/diagnostics#pdx_unknown_prop');
    });

    it('reports each finding once: a warning validate() already gave is not repeated', async () => {
        writeFileSync(join(root, 'counter.pdx'),
            '<template><span>{{ count }}</span></template>\n' +
            '<script setup>\nlet count = 5;\n</script>\n');
        const warnings = (await checkJson()).files.flatMap((f) => f.warnings);
        const keys = warnings.map((w) => `${w.code}: ${w.message}`);
        expect(keys.length, 'the fixture draws a validate() warning').toBeGreaterThan(0);
        expect(new Set(keys).size, `a warning appears twice: ${JSON.stringify(keys)}`).toBe(keys.length);
    });

    // validate() computes these positions, and the report carries them.
    it('reports where PDX_RAW_INTERPOLATION and PDX_SCRIPT_SYNTAX_ERROR are, as file line and column', async () => {
        writeFileSync(join(root, 'broken.pdx'),
            '<template>\n  <p title="${n}">x</p>\n</template>\n' +
            '<script setup>\nlet n = $signal(1);\nlet b = ;\n</script>\n');
        const warnings = (await checkJson()).files.flatMap((f) => f.warnings);
        const at = (code: string) => {
            const w = warnings.find((x) => x.code === code);
            expect(w, `no ${code} in ${JSON.stringify(warnings)}`).toBeTruthy();
            return { line: w!.line, column: w!.column };
        };
        // `${` on line 2, after `  <p title="` — column 13.
        expect(at('PDX_RAW_INTERPOLATION')).toEqual({ line: 2, column: 13 });
        // `let b = ;` on line 6: the expression is missing at the `;`, column 9.
        expect(at('PDX_SCRIPT_SYNTAX_ERROR')).toEqual({ line: 6, column: 9 });
    });
});

// CD-L1, the one cross-file rule — the same function, in the same shape, written in two
// pages is a composable nobody extracted. Only `pdx check` sees every file at once.
describe('pdx check — logic repeated across pages (CD-L1)', () => {
    let root: string;
    let prevCwd: string;
    let exitSpy: ReturnType<typeof vi.spyOn>;
    let logSpy: Mock<typeof console.log>;

    beforeEach(() => {
        root = tmpRoot('repeated');
        mkdirSync(root, { recursive: true });
        prevCwd = process.cwd();
        exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => undefined) as never);
        logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    });

    afterEach(() => {
        process.chdir(prevCwd);
        exitSpy.mockRestore();
        logSpy.mockRestore();
        rmSync(root, { recursive: true, force: true });
    });

    const page = (functions: string) => '<template><p>{{ refusalId }}</p></template>\n<script setup>\n'
        + "const toast = { add: () => 'id', dismiss: () => {} };\n"
        + "let refusalId = $signal('');\nlet confirmClose = $signal(false);\nlet count = $signal(0);\n"
        + functions + '\n</script>\n';

    // A tickets/customers round-trip written twice: the parameter named differently,
    // a comment in one — the same logic.
    const ROUND_TRIP_A = [
        'function answerRefused(message) {',
        '  clearRefusal();',
        "  refusalId = toast.add({ type: 'error', message, duration: 0 });",
        '}',
        'function clearRefusal() {',
        '  if (refusalId) toast.dismiss(refusalId);',
        "  refusalId = '';",
        '}',
        'function keepEditing() { confirmClose = false; }',
    ].join('\n');
    const ROUND_TRIP_B = [
        '// The server said no: say so, and keep it on screen.',
        'function answerRefused(text) {',
        '  clearRefusal();',
        "  refusalId = toast.add({ type: 'error', message: text, duration: 0 });",
        '}',
        'function clearRefusal() {',
        '  if (refusalId) { toast.dismiss(refusalId); }',
        "  refusalId = '';",
        '}',
        'function keepEditing() { confirmClose = false; }',
    ].join('\n');

    async function repeated(): Promise<{ file: string; code: string; message: string; line?: number }[]> {
        process.chdir(root);
        await (checkCmd as any).run({ args: { json: true, fix: false, severity: 'warn', i18n: false, design: true } });
        const printed = logSpy.mock.calls.map(c => String(c[0])).find(s => s.trimStart().startsWith('{'));
        expect(printed, 'check printed no JSON report').toBeTruthy();
        const report = JSON.parse(printed!) as { files: { file: string; warnings: { code: string; message: string; line?: number }[] }[] };
        return report.files.flatMap(f => f.warnings.filter(w => w.code === 'PDX_REPEATED_LOGIC').map(w => ({ file: f.file, ...w })));
    }

    it('reports answerRefused and clearRefusal in both pages, naming the rule and both places', async () => {
        writeFileSync(join(root, 'tickets.pdx'), page(ROUND_TRIP_A));
        writeFileSync(join(root, 'customers.pdx'), page(ROUND_TRIP_B));
        const ws = await repeated();
        const names = (file: string) => ws.filter(w => w.file.endsWith(file)).map(w => w.message.match(/'(\w+)'/)?.[1]).sort();
        expect(names('tickets.pdx')).toEqual(['answerRefused', 'clearRefusal', 'keepEditing']);
        expect(names('customers.pdx')).toEqual(['answerRefused', 'clearRefusal', 'keepEditing']);
        const clear = ws.find(w => w.file.endsWith('tickets.pdx') && w.message.includes("'clearRefusal'"))!;
        expect(clear.message).toContain('CD-L1');
        expect(clear.message).toContain('extract a composable');
        expect(clear.message).toMatch(/tickets\.pdx:\d+/);
        expect(clear.message).toMatch(/customers\.pdx:\d+/);
        expect(clear.line, 'reported on another line than the function').toBe(11);
        expect(exitSpy, 'a warning, never an error').not.toHaveBeenCalled();
    });

    it('control — the same names over different bodies are not reported', async () => {
        writeFileSync(join(root, 'tickets.pdx'), page(ROUND_TRIP_A));
        writeFileSync(join(root, 'customers.pdx'), page([
            'function answerRefused(message) {',
            '  count++;',
            "  console.warn('refused', message, count);",
            '}',
            'function clearRefusal() {',
            '  count = 0;',
            '  confirmClose = true;',
            '}',
        ].join('\n')));
        expect(await repeated()).toEqual([]);
    });

    it('control — a one-liner shared alone is a coincidence, not a composable', async () => {
        writeFileSync(join(root, 'tickets.pdx'), page('function keepEditing() { confirmClose = false; }'));
        writeFileSync(join(root, 'customers.pdx'), page('function keepEditing() { confirmClose = false; }'));
        expect(await repeated()).toEqual([]);
    });
});

// The heuristic rules. CD-D1 is cross-file — a route and a route inside it loading the
// same endpoint; the per-file ones (compiler's design-heuristics.test.ts) reach the report too.
describe('pdx check — the heuristic component-design rules', () => {
    let root: string;
    let prevCwd: string;
    let exitSpy: ReturnType<typeof vi.spyOn>;
    let logSpy: Mock<typeof console.log>;

    beforeEach(() => {
        root = tmpRoot('heuristics');
        mkdirSync(root, { recursive: true });
        prevCwd = process.cwd();
        exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => undefined) as never);
        logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    });

    afterEach(() => {
        process.chdir(prevCwd);
        exitSpy.mockRestore();
        logSpy.mockRestore();
        rmSync(root, { recursive: true, force: true });
    });

    async function warnings(code: string): Promise<{ file: string; message: string; line?: number }[]> {
        process.chdir(root);
        await (checkCmd as any).run({ args: { json: true, fix: false, severity: 'warn', i18n: false, design: true } });
        const printed = logSpy.mock.calls.map(c => String(c[0])).find(s => s.trimStart().startsWith('{'));
        const report = JSON.parse(printed!) as { files: { file: string; warnings: { code: string; message: string; line?: number }[] }[] };
        return report.files.flatMap(f => f.warnings.filter(w => w.code === code).map(w => ({ file: f.file, ...w })));
    }

    const route = (page: string, load: string) => `<template><p>{{ documents.length }}</p></template>\n<script setup>\n@page '${page}';\n`
        + `let documents = $signal([]);\nlet id = $signal('1');\n${load}\n</script>\n`;
    const FETCH = 'async function reload() {\n  const res = await fetch(`/api/attachments?employee=${encodeURIComponent(id)}`);\n  documents = await res.json();\n}';

    it('CD-D1: the employee and its documents section both fetch the attachments', async () => {
        writeFileSync(join(root, 'employee.pdx'), route('/employees/:id', FETCH));
        writeFileSync(join(root, 'employee-documents.pdx'), route('/employees/:id/documents', FETCH));
        const ws = await warnings('PDX_SHARED_LOADING');
        expect(ws.map(w => w.file.replace(/\\/g, '/').split('/').pop()).sort()).toEqual(['employee-documents.pdx', 'employee.pdx']);
        expect(ws[0].message).toContain('CD-D1');
        expect(ws[0].message).toContain('/api/attachments?employee=${}');
        expect(ws[0].line, 'reported on another line than the fetch').toBe(7);
    });

    it('control — two routes side by side, and a picker that is not a route, may load the same thing', async () => {
        writeFileSync(join(root, 'employees.pdx'), route('/employees', FETCH));
        writeFileSync(join(root, 'sites.pdx'), route('/sites', FETCH));
        writeFileSync(join(root, 'picker.pdx'), route('', FETCH).replace("@page '';\n", ''));
        expect(await warnings('PDX_SHARED_LOADING')).toEqual([]);
    });

    it('the per-file heuristics reach the report: a colour literal (CD-C3)', async () => {
        writeFileSync(join(root, 'badge.pdx'), '<template><p class="b">x</p></template>\n<script setup>\nlet n = $signal(0);\n</script>\n'
            + '<style scoped>\n.b { color: #ff0000; }\n</style>\n');
        const ws = await warnings('PDX_COLOUR_LITERAL');
        expect(ws).toHaveLength(1);
        expect(ws[0].line).toBe(6);
        expect(exitSpy, 'a warning, never an error').not.toHaveBeenCalled();
    });
});

describe('pdx check — i18n translations path', () => {
    let root: string;

    beforeEach(() => { root = tmpRoot('i18n'); });
    afterEach(() => rmSync(root, { recursive: true, force: true }));

    it('finds missing keys in <root>/translations (not <root>/src/translations)', () => {
        // `root` here plays the role of resolved.root, which is already cwd/src.
        mkdirSync(join(root, 'translations'), { recursive: true });
        writeFileSync(join(root, 'translations', 'en.json'), JSON.stringify({ hello: 'Hi', bye: 'Bye' }));
        writeFileSync(join(root, 'translations', 'it.json'), JSON.stringify({ hello: 'Ciao' })); // missing 'bye'

        const reports = checkI18nKeys(root);

        // Looking in <root>/src/translations would find nothing; <root>/translations reports the gap.
        expect(reports.length).toBeGreaterThan(0);
        const it = reports.find(r => r.file.endsWith('it.json'));
        expect(it).toBeTruthy();
        expect(it!.missingKeys.map(k => k.key)).toContain('bye');
    });

    // The report `check --i18n --json` prints names the gap with its code: every code in the
    // diagnostics catalog is produced by a test that names it.
    it('pdx check --i18n --json reports PDX_I18N_MISSING_KEY for it', async () => {
        mkdirSync(join(root, 'src', 'translations'), { recursive: true });
        writeFileSync(join(root, 'src', 'a.pdx'), '<template><p>x</p></template>\n<script setup>\nlet n = $signal(0);\n</script>\n');
        writeFileSync(join(root, 'src', 'translations', 'en.json'), JSON.stringify({ hello: 'Hi', bye: 'Bye' }));
        writeFileSync(join(root, 'src', 'translations', 'it.json'), JSON.stringify({ hello: 'Ciao' }));
        const prevCwd = process.cwd();
        const exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => undefined) as never);
        const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
        try {
            process.chdir(root);
            await (checkCmd as any).run({ args: { json: true, fix: false, severity: 'warn', i18n: true } });
            const printed = logSpy.mock.calls.map((c) => String(c[0])).find((s) => s.trimStart().startsWith('{'));
            const report = JSON.parse(printed!) as { files: { warnings: { code: string; message: string }[] }[] };
            const found = report.files.flatMap((f) => f.warnings).filter((w) => w.code === 'PDX_I18N_MISSING_KEY');
            expect(found.map((w) => w.message)).toEqual(['Translation key "bye" missing in locale "it"']);
        } finally {
            process.chdir(prevCwd);
            exitSpy.mockRestore();
            logSpy.mockRestore();
        }
    });
});

// `check` passes the project root, not `resolved.root` — which `resolveConfig` sets to `<cwd>/src`
// when that directory exists — to `registerProjectComponents`, which appends `src/` and `pages/`
// itself. With `resolved.root` it would scan `<cwd>/src/src`, find nothing, hold only the @pdxui/ui
// exports, and report every `<pdx-*>` written in the project as PDX_UNRESOLVED_COMPONENT: "The
// custom element will not be registered", on an app whose components register and run.
//
// The i18n dictionaries avoid the same doubled path (above). This is the other caller.
describe('pdx check — the project’s own components resolve', () => {
    let root: string;
    let prevCwd: string;
    let exitSpy: ReturnType<typeof vi.spyOn>;
    let logSpy: Mock<typeof console.log>;

    beforeEach(() => {
        root = tmpRoot('project-components');
        mkdirSync(join(root, 'src', 'components'), { recursive: true });
        mkdirSync(join(root, 'src', 'routes'), { recursive: true });
        prevCwd = process.cwd();
        exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => undefined) as never);
        logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    });

    afterEach(() => {
        process.chdir(prevCwd);
        exitSpy.mockRestore();
        logSpy.mockRestore();
        rmSync(root, { recursive: true, force: true });
    });

    it('does not call a component declared under src/ unresolved', async () => {
        writeFileSync(join(root, 'src', 'components', 'room-rows.pdx'),
            '<template><div>rows</div></template>\n<script>\nlet n = $signal(0);\n</script>\n');
        writeFileSync(join(root, 'src', 'routes', 'edit.pdx'),
            '<template><pdx-room-rows></pdx-room-rows></template>\n<script>\nlet m = $signal(0);\n</script>\n');

        process.chdir(root);
        await (checkCmd as any).run({ args: { json: true, fix: false, severity: 'warn', i18n: false } });
        const printed = logSpy.mock.calls.map(c => String(c[0])).find(s => s.trimStart().startsWith('{'));
        const report = JSON.parse(printed!) as { files: { file: string; warnings: { code: string }[] }[] };

        const unresolved = report.files.flatMap(f => f.warnings)
            .filter(w => w.code === 'PDX_UNRESOLVED_COMPONENT');
        expect(unresolved, 'a component the project declares was reported as unresolved').toEqual([]);
    });

    it('still reports a tag nothing declares', async () => {
        // The control: with the project's components found, the check must keep catching a real typo. Without this
        // a resolver that answers "known" to everything would make the assertion above pass.
        writeFileSync(join(root, 'src', 'routes', 'typo.pdx'),
            '<template><pdx-nothing-declares-this></pdx-nothing-declares-this></template>\n'
            + '<script>\nlet m = $signal(0);\n</script>\n');

        process.chdir(root);
        await (checkCmd as any).run({ args: { json: true, fix: false, severity: 'warn', i18n: false } });
        const printed = logSpy.mock.calls.map(c => String(c[0])).find(s => s.trimStart().startsWith('{'));
        const report = JSON.parse(printed!) as { files: { file: string; warnings: { code: string; message: string }[] }[] };

        const codes = report.files.flatMap(f => f.warnings).map(w => w.code);
        expect(codes, 'the check stopped noticing a tag nobody declares').toContain('PDX_UNRESOLVED_COMPONENT');
    });
});
