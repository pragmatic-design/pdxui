// LSP P4 — TS IntelliSense inside <script setup> (over the projected virtual file).

import { describe, it, expect } from 'vitest';
import { join } from 'path';
import { PdxTsService, projectScript } from '../src/utils/ts-service';
import { tsCompletions, tsHover, tsDefinition } from '../src/capabilities/ts-features';
import { buildVirtualFile } from '../src/utils/virtual-file';

const ROOT = join(__dirname, '..', '..', '..'); // monorepo root (ha node_modules/typescript)
const URI = 'file:///' + join(ROOT, 'x.pdx').replace(/\\/g, '/');
// A virtual file from the script alone (scriptStart=0, no template) → offsets 1:1.
const vfOf = (script: string) => buildVirtualFile(script, 0, [], '', -1);

describe('projectScript', () => {
    it('azzera le rune @ preservando la lunghezza (offset 1:1)', () => {
        const src = "@prop title: string = 'x';\nlet n = $signal(0);";
        const out = projectScript(src);
        expect(out.length).toBe(src.length);
        expect(out).not.toContain('@prop');
        expect(out).toContain('$signal(0)'); // le rune $ restano (dichiarate ambient)
    });
});

describe('PdxTsService', () => {
    const svc = new PdxTsService(ROOT);

    it('finds the TypeScript lib of the workspace', () => {
        expect(svc.hasFullLib).toBe(true);
    });

    it('completa i membri di un tipo builtin (string)', () => {
        const script = "\nconst greeting = 'hi';\ngreeting.\n";
        const off = script.indexOf('greeting.') + 'greeting.'.length;
        const items = tsCompletions(svc, URI, vfOf(script), off);
        const labels = items.map(i => i.label);
        expect(labels).toContain('toUpperCase');
        expect(labels).toContain('length');
    });

    it('shows a hover with the type of a variable', () => {
        const script = "\nconst count = 42;\ncount;\n";
        const off = script.lastIndexOf('count');
        const h = tsHover(svc, URI, vfOf(script), off) as any;
        expect(h).not.toBeNull();
        expect(h.contents.value).toMatch(/count/);
        expect(h.contents.value).toMatch(/number|42/);
    });

    it('treats a $signal as its value (number → the number methods)', () => {
        // $signal<T>(v): T → in .pdx source a signal is used as its value.
        const script = "\nlet c = $signal(0);\nc.\n";
        const off = script.indexOf('c.\n') + 2;
        const labels = tsCompletions(svc, URI, vfOf(script), off).map(i => i.label);
        expect(labels).toContain('toFixed');
    });

    it('go-to-definition on an object method (c.del) → its definition', () => {
        // scriptStart simulated at 0; the virtual file = the script itself
        const script = "\nconst c = { del() { return 1; } };\nc.del();\n";
        const callOff = script.lastIndexOf('del'); // the `del` in `c.del()`
        const locs = tsDefinition(svc, URI, vfOf(script), callOff, script);
        expect(locs.length).toBeGreaterThan(0);
        // del() is defined on the line of the `del()` inside the object (line 1 of the script)
        expect(locs[0].range.start.line).toBeGreaterThanOrEqual(0);
    });
});
