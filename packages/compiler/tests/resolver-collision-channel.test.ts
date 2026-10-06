// A tag collision found by the RESOLVER has a diagnostic code and a channel.
//
// There are two collision sites and they cover different inputs:
//
//   plugin.ts        throws PDX_TAG_COLLISION during transform, naming both files. It sees only
//                    the files the build actually COMPILES, because `tagRegistry` is filled from
//                    the transform hook.
//   component-resolver.ts  scans src/ and pages/ on disk at plugin start, so it sees files the
//                    build may never import — including the losing file itself, which is
//                    unreachable by auto-import precisely BECAUSE it lost.
//
// So the throwing path cannot be relied on to cover this one: the file it would need to compile is
// the one the collision made invisible. The warn is not redundant, and it is structured.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ComponentResolver } from '../src/component-resolver';

let root: string;

function pdx(rel: string, content = '<template><div/></template>'): string {
    const full = join(root, rel);
    mkdirSync(join(full, '..'), { recursive: true });
    writeFileSync(full, content);
    return full.replace(/\\/g, '/');
}

beforeEach(() => { root = mkdtempSync(join(tmpdir(), 'pdx-collision-')); });
afterEach(() => { vi.restoreAllMocks(); rmSync(root, { recursive: true, force: true }); });

describe('a resolver collision is a structured diagnostic', () => {
    it('carries a code, so it can be counted, filtered and surfaced like the other 24', () => {
        pdx('src/a/widget.pdx');
        pdx('src/b/widget.pdx');
        vi.spyOn(console, 'warn').mockImplementation(() => {});

        const r = new ComponentResolver();
        r.registerProjectComponents(root);

        expect(r.collisions, 'the collision reached no structured channel').toHaveLength(1);
        expect(r.collisions[0].code).toBe('PDX_TAG_COLLISION_RESOLVER');
        expect(r.collisions[0].severity).toBe('warn');
    });

    it('names both files, so the reader knows which one lost', () => {
        pdx('src/a/widget.pdx');
        pdx('src/b/widget.pdx');
        vi.spyOn(console, 'warn').mockImplementation(() => {});

        const r = new ComponentResolver();
        r.registerProjectComponents(root);
        const [c] = r.collisions;

        expect(c.message).toContain('pdx-widget');
        expect(c.message, 'the winning file is not named').toContain('a/widget.pdx');
        expect(c.message, 'the losing file is not named').toContain('b/widget.pdx');
    });

    it('says what to do about it', () => {
        pdx('src/a/widget.pdx');
        pdx('src/b/widget.pdx');
        vi.spyOn(console, 'warn').mockImplementation(() => {});

        const r = new ComponentResolver();
        r.registerProjectComponents(root);

        expect(r.collisions[0].hint, 'the diagnostic offers no fix').toMatch(/@tag/);
    });

    it('still prints the console line — a terminal build is a real consumer', () => {
        pdx('src/a/widget.pdx');
        pdx('src/b/widget.pdx');
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

        new ComponentResolver().registerProjectComponents(root);

        expect(warn).toHaveBeenCalledTimes(1);
        expect(String(warn.mock.calls[0][0])).toContain('PDX_TAG_COLLISION_RESOLVER');
    });

    it('reports one diagnostic per collision, not per file scanned', () => {
        pdx('src/a/widget.pdx');
        pdx('src/b/widget.pdx');
        pdx('src/c/widget.pdx');
        pdx('src/other.pdx');
        vi.spyOn(console, 'warn').mockImplementation(() => {});

        const r = new ComponentResolver();
        r.registerProjectComponents(root);

        expect(r.collisions, 'two losing files are two collisions').toHaveLength(2);
        expect(r.size, 'the winner plus the unrelated file').toBe(2);
    });

    it('is empty when nothing collides — the control', () => {
        pdx('src/a.pdx');
        pdx('src/b.pdx');

        const r = new ComponentResolver();
        r.registerProjectComponents(root);

        expect(r.collisions, 'a clean project reported a collision').toEqual([]);
    });

    it('a library tag a project file shadows is NOT a collision', () => {
        // The documented rule is that the library wins; reporting it would fire on every project
        // that happens to name a file button.pdx.
        pdx('src/button.pdx');

        const r = new ComponentResolver();
        expect(r.registerUiManifest()).toBe(true);
        r.registerProjectComponents(root);

        expect(r.collisions).toEqual([]);
    });

    it('the losing file keeps losing — the precedence rule is unchanged', () => {
        pdx('src/a/widget.pdx');
        pdx('src/b/widget.pdx');
        vi.spyOn(console, 'warn').mockImplementation(() => {});

        const r = new ComponentResolver();
        r.registerProjectComponents(root);

        expect(r.resolve('pdx-widget')!.importPath).toContain('/a/widget.pdx');
    });
});
