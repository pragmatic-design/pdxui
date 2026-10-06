// The script projection (runes→TS) + type diagnostics in the script.

import { describe, it, expect } from 'vitest';
import { join } from 'path';
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

    it('blanks out the non-prop runes and declares the names of @form/@fetch/@store', () => {
        const src = '@event changed: number;\n@form myForm: { a: string { required } }\nfunction f() { return myForm.valid(); }';
        const out = projectScript(src);
        expect(out).not.toContain('@event');
        expect(out).not.toContain('@form');
        expect(out).not.toContain('required'); // the schema block emptied
        expect(out).toContain('var myForm: any;'); // declared at the end, with `var`
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

    it('no diagnostics at all on a script that calls its own @event', () => {
        expect(withEvent('function f() { changed(1); }').map((d: { message: string }) => d.message)).toEqual([]);
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
});
