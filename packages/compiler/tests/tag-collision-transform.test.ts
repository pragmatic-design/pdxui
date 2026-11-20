// Two .pdx files that derive the same tag stop the build (PDX_TAG_COLLISION): the plugin reads the tag
// each compiled module defines, and the second file to define one already defined throws. The tag is
// read from the compiled call, so this is what says the plugin still finds it when the call changes
// shape (#1246: `defineComponent('app-card', …)`).

import { describe, it, expect, afterEach } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { pdx } from '../src/plugin';

const CARD = '<template><p>card</p></template>\n<script>\nlet n = $signal(0);\n</script>\n';

describe('PDX_TAG_COLLISION from the plugin\'s transform', () => {
    let root: string | null = null;
    afterEach(() => { if (root) rmSync(root, { recursive: true, force: true }); root = null; });

    /** A plugin in build mode, and the transform it runs on a file under its root. */
    function plugin() {
        root = mkdtempSync(join(tmpdir(), 'pdx-tag-collision-'));
        mkdirSync(join(root, 'src', 'a'), { recursive: true });
        mkdirSync(join(root, 'src', 'b'), { recursive: true });
        const [p] = pdx();
        (p.config as (c: object, e: { command: string }) => void)({}, { command: 'build' });
        (p.configResolved as (c: { root: string; server: { fs: { allow: string[] } } }) => void)(
            { root, server: { fs: { allow: [] } } });
        const transform = p.transform as (this: { error(m: string): never }, code: string, id: string) => { code: string };
        const ctx = { error(m: string): never { throw new Error(m); } };
        const at = (rel: string) => join(root!, rel).replace(/\\/g, '/');
        return (rel: string) => transform.call(ctx, CARD, at(rel));
    }

    it('a second file that defines the same tag throws, naming the first', () => {
        const run = plugin();
        expect(run('src/a/card.pdx').code).toContain("defineComponent('app-card'");
        expect(() => run('src/b/card.pdx')).toThrow(/PDX_TAG_COLLISION: "app-card" is already registered by/);
    });

    it('the control: the same file compiled again is not a collision', () => {
        const run = plugin();
        run('src/a/card.pdx');
        expect(() => run('src/a/card.pdx')).not.toThrow();
    });
});
