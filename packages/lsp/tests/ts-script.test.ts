// The script projection (runes→TS) + type diagnostics in the script.

import { describe, it, expect } from 'vitest';
import { join } from 'path';
import ts from 'typescript';
import { projectScript, PdxTsService } from '../src/utils/ts-service';
import { getTsDiagnostics } from '../src/capabilities/ts-diagnostics';
import { buildVirtualFile } from '../src/utils/virtual-file';

const ROOT = join(__dirname, '..', '..', '..');
const URI = 'file:///' + join(ROOT, 'x.pdx').split('\\').join('/');

describe('projectScript', () => {
    it('turns @prop into a typed var, with the offsets unchanged', () => {
        // `var`, not `let`: the compiler declares props before anything reads them.
        const src = "@prop title: string = 'x';\nlet n = $signal(0);";
        const out = projectScript(src);
        // the same prefix length up to the first newline (the lines after it are appended at the end)
        expect(out.slice(0, src.length).length).toBe(src.length);
        expect(out).not.toContain('@prop');
        expect(out).toMatch(/var\s+title: string/);
        expect(out).toContain('$signal(0)');
    });

    it('blanks out the non-prop runes and declares the names of @form/@fetch, typed', () => {
        const src = '@event changed: number;\n@form myForm: { a: string { required } }\nfunction f() { return myForm.valid(); }';
        const out = projectScript(src);
        expect(out).not.toContain('@event');
        expect(out).not.toContain('@form');
        expect(out).not.toContain('required'); // the schema block emptied
        // Declared at the end, with `var`, as core's Form of the declared fields (#58).
        expect(out).toContain('var myForm: import("@pdxui/core").Form<{ "a": string }>;');
    });

    it('blanks a whole @fetch whose quoted URL holds `${…}`, braces in strings not counted (#487)', () => {
        const src = "let id = $signal(1);\n@fetch orders: 'GET /api/c/${id}/orders?page=${id}' as number[] { staleTime: 60000, tags: ['orders'] };\nlet n = 1;";
        const out = projectScript(src);
        expect(out.slice(0, src.length)).not.toMatch(/orders\?|staleTime/);
        expect((ts.transpileModule(out, { reportDiagnostics: true }).diagnostics ?? []).map(d => ts.flattenDiagnosticMessageText(d.messageText, '\n'))).toEqual([]);
    });

    it('does not treat a rune inside a comment as one', () => {
        const src = '// uso @form rune qui\nlet x = $signal(0);';
        expect(projectScript(src)).toContain('// uso @form rune qui');
    });
});

describe('getScriptDiagnostics', () => {
    const svc = new PdxTsService(ROOT);

    it('reports a real type error in the script', () => {
        const sc = '\nlet n: number = 0;\nn = "a string";\n';
        const src = '<template></template>\n<script setup>' + sc + '</script>';
        const start = src.indexOf('<script setup>') + '<script setup>'.length;
        const vf = buildVirtualFile(sc, start, [], '', -1);
        const d = getTsDiagnostics(svc, URI, vf, src);
        expect(d.length).toBeGreaterThan(0);
        expect(d.some((x: { message: string }) => /string/i.test(x.message))).toBe(true);
    });

    // `@event changed: number` gives the script `changed(detail)`: the projection must
    // declare it, typed by its payload, or every call is "Cannot find name".
    const withEvent = (body: string) => {
        const sc = `\n@event changed: number;\n${body}\n`;
        const src = '<template></template>\n<script setup>' + sc + '</script>';
        const start = src.indexOf('<script setup>') + '<script setup>'.length;
        return getTsDiagnostics(svc, URI, buildVirtualFile(sc, start, [], '', -1), src);
    };

    it('an optional @prop (#130), `@prop hint?: string;`, is valid TypeScript in the projection', () => {
        const sc = "\n@prop hint?: string;\n@prop id: string;\nfunction f() { return (hint ?? '') + id; }\n";
        const src = '<template></template>\n<script setup>' + sc + '</script>';
        const start = src.indexOf('<script setup>') + '<script setup>'.length;
        expect(projectScript(sc)).toHaveLength(sc.length);
        const syntax = ts.transpileModule(projectScript(sc), { reportDiagnostics: true }).diagnostics ?? [];
        expect(syntax.map(d => ts.flattenDiagnosticMessageText(d.messageText, '\n'))).toEqual([]);
        expect(getTsDiagnostics(svc, URI, buildVirtualFile(sc, start, [], '', -1), src).map((d: { message: string }) => d.message)).toEqual([]);
    });

    it('a syntax error in the projected script is reported, not only the type errors (#487)', () => {
        const sc = '\nlet n = ;\n';
        const src = '<template></template>\n<script setup>' + sc + '</script>';
        const start = src.indexOf('<script setup>') + '<script setup>'.length;
        const d = getTsDiagnostics(svc, URI, buildVirtualFile(sc, start, [], '', -1), src);
        expect(d.map((x: { message: string }) => x.message)).toContain('Expression expected.');
        const at = d.find((x: { message: string }) => x.message === 'Expression expected.')!;
        expect(at.range.start.line).toBe(2);
    });

    it('no diagnostics at all on a script that calls its own @event', () => {
        expect(withEvent('function f() { changed(1); }').map((d: { message: string }) => d.message)).toEqual([]);
    });

    it('@event(bubbles) (#138) declares its function as @event does: blanked, typed by its payload', () => {
        const sc = "\n@event(bubbles) saved: number;\nfunction f() { saved('one'); saved(2); }\n";
        const src = '<template></template>\n<script setup>' + sc + '</script>';
        const start = src.indexOf('<script setup>') + '<script setup>'.length;
        expect(projectScript(sc).slice(0, sc.length)).not.toContain('bubbles');
        const d = getTsDiagnostics(svc, URI, buildVirtualFile(sc, start, [], '', -1), src) as { message: string }[];
        expect(d.map((x) => x.message).filter((m) => /Cannot find name/.test(m)), 'saved() was not declared').toEqual([]);
        expect(d.some((x) => /string/i.test(x.message) && /number/i.test(x.message)), 'the payload was not typed').toBe(true);
    });

    it('the @event payload is typed: a string where a number belongs is an error', () => {
        const d = withEvent("function f() { changed('one'); }");
        expect(d.some((x: { message: string }) => /string/i.test(x.message) && /number/i.test(x.message))).toBe(true);
    });

    it('zero diagnostica su script valido con rune/prop/$signal/html', () => {
        const sc = "\n@prop title: string = 'x';\nlet count = $signal(0);\nfunction inc() { count = count + 1; }\nconst tpl = html`<b>${title}</b>`;\n";
        const src = '<template></template>\n<script setup>' + sc + '</script>';
        const start = src.indexOf('<script setup>') + '<script setup>'.length;
        const vf = buildVirtualFile(sc, start, [], '', -1);
        expect(getTsDiagnostics(svc, URI, vf, src)).toHaveLength(0);
    });

    // The compiler imports the router's `navigation` where a .pdx reads it (#149), so the editor
    // must know the name and its type with no import written.
    const script = (sc: string) => {
        const src = '<template></template>\n<script setup>' + sc + '</script>';
        const start = src.indexOf('<script setup>') + '<script setup>'.length;
        return getTsDiagnostics(svc, URI, buildVirtualFile(sc, start, [], '', -1), src)
            .map((d: { message: string }) => d.message);
    };

    it('navigation is known, typed, with no import', () => {
        expect(script('\nconst busy: boolean = navigation.pending();\nconst to: string | null = navigation.to();\n')).toEqual([]);
        expect(script('\nconst n: number = navigation.pending();\n').some(m => /boolean/.test(m))).toBe(true);
    });
});
