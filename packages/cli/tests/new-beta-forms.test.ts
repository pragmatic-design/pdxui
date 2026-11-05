// `pdx new` writes only the forms of the language as it is (#159, step 5): a project, a component and
// a page it scaffolds give `pdx migrate --dry` nothing to rewrite and nothing to flag, and every
// .pdx it writes compiles with no warning.
//
// A scaffold that writes an alpha form teaches it to everyone who starts from it — the one place a
// removed form would reach a new project without anyone typing it.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, rmSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { compile } from '@pdxui/compiler';
import newCmd from '../src/commands/new';
import { migrate } from '../src/commands/migrate';

type Runnable = { run: (c: { args: Record<string, unknown> }) => Promise<void> };
const run = (type: string, name: string, dir: string) => (newCmd as unknown as Runnable).run({ args: { type, name, dir } });

let sandbox: string;
beforeEach(() => {
    sandbox = mkdtempSync(join(tmpdir(), 'pdx-new-beta-'));
    vi.spyOn(console, 'log').mockImplementation(() => {});
});
afterEach(() => {
    vi.restoreAllMocks();
    rmSync(sandbox, { recursive: true, force: true });
});

function pdxFiles(dir: string, acc: string[] = []): string[] {
    for (const entry of readdirSync(dir)) {
        const p = join(dir, entry);
        if (statSync(p).isDirectory()) { if (entry !== 'node_modules') pdxFiles(p, acc); }
        else if (p.endsWith('.pdx')) acc.push(p);
    }
    return acc;
}

/** A project with a component and a page scaffolded inside it, as an app is started. */
async function scaffold(): Promise<string> {
    await run('project', 'shop', sandbox);
    const project = join(sandbox, 'shop');
    await run('component', 'order-card', join(project, 'src'));
    // `page` writes under `<dir>/src/routes/` itself.
    await run('page', 'orders', project);
    return project;
}

describe('the check can fail', () => {
    it('finds an alpha form written into a scaffolded file', async () => {
        const project = await scaffold();
        const app = join(project, 'src', 'App.pdx');
        writeFileSync(app, readFileSync(app, 'utf-8').replace('<script>', '<script setup>'));
        const report = await migrate([project], { cwd: project, dry: true });
        expect(report.changed.map(c => c.id)).toContain('script-setup');
    });
});

describe('pdx new', () => {
    it('writes a project, a component and a page', async () => {
        const files = pdxFiles(await scaffold()).map(f => f.replace(/\\/g, '/'));
        expect(files.some(f => f.endsWith('/src/App.pdx'))).toBe(true);
        expect(files.some(f => f.endsWith('/src/order-card.pdx'))).toBe(true);
        expect(files.some(f => f.endsWith('/src/routes/orders.pdx'))).toBe(true);
    });

    it('writes nothing pdx migrate would rewrite or flag', async () => {
        const project = await scaffold();
        const report = await migrate([project], { cwd: project, dry: true });
        expect(report.changed.map(c => `${c.file}: ${c.id}`), 'forms pdx migrate would rewrite').toEqual([]);
        expect(report.flagged.map(f => `${f.file}:${f.line}: ${f.id}`), 'forms pdx migrate would flag').toEqual([]);
    });

    it('writes .pdx files that compile with no warning', async () => {
        const found: string[] = [];
        for (const file of pdxFiles(await scaffold())) {
            for (const w of compile(readFileSync(file, 'utf-8'), file).warnings) {
                if (w.severity === 'warn' || w.severity === 'error') found.push(`${file}: ${w.code}`);
            }
        }
        expect(found).toEqual([]);
    });
});
