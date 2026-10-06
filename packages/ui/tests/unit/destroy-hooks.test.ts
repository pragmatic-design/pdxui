// pdx-image and pdx-data-grid release what they hold when they are destroyed.
//
// A cleanup registered as `(ctx as any).onDestroy?.(…)` does nothing: the component context has no
// `onDestroy` — it is core's `onDestroy`, imported — so the optional call is a no-op and the cast
// keeps the compiler quiet: an image's IntersectionObserver would never be disconnected nor its object
// URL revoked; a grid's effect, virtual state and grid would never be disposed. The guard at the end
// keeps that pattern out of every component.
import { describe, it, expect, afterEach, vi } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import '../../src/image/pdx-image';
import '../../src/data-grid/pdx-data-grid';
import { tick } from './helpers';

afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    document.body.innerHTML = '';
});

/** An IntersectionObserver that records what is observed and disconnected. */
function stubObserver() {
    const seen = { observed: 0, disconnected: 0 };
    vi.stubGlobal('IntersectionObserver', class {
        observe() { seen.observed++; }
        disconnect() { seen.disconnected++; }
        unobserve() {}
        takeRecords() { return []; }
    });
    return seen;
}

describe('pdx-image', () => {
    it('disconnects its lazy-loading observer when removed', async () => {
        const seen = stubObserver();
        const el = document.createElement('pdx-image');
        el.setAttribute('src', '/a.png');
        document.body.appendChild(el);
        await tick(30);
        expect(seen.observed, 'the image never observed: the case measures nothing').toBe(1);
        el.remove();
        expect(seen.disconnected).toBe(1);
    });

    it('revokes the object URL it created for a fetched image when removed', async () => {
        stubObserver();
        vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:pdx-test');
        const revoked = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
        const el = document.createElement('pdx-image') as HTMLElement & { fetchFn: unknown };
        el.setAttribute('auth-src', '/secret.png');
        el.setAttribute('lazy', 'false');
        el.fetchFn = () => Promise.resolve(new Blob(['x']));
        document.body.appendChild(el);
        await vi.waitFor(() => { expect(URL.createObjectURL).toHaveBeenCalled(); }, { timeout: 2000 });
        el.remove();
        expect(revoked).toHaveBeenCalledWith('blob:pdx-test');
    });

    it('the control: an image left in the document keeps its observer', async () => {
        const seen = stubObserver();
        const el = document.createElement('pdx-image');
        el.setAttribute('src', '/a.png');
        document.body.appendChild(el);
        await tick(30);
        expect(seen.disconnected).toBe(0);
    });
});

describe('pdx-data-grid', () => {
    type Grid = HTMLElement & { columns: unknown; data: unknown; grid: { dispose(): void } };

    async function mountGrid(): Promise<Grid> {
        const el = document.createElement('pdx-data-grid') as Grid;
        el.columns = [{ field: 'name', header: 'Name' }];
        el.data = [{ id: 1, name: 'Ann' }];
        document.body.appendChild(el);
        await tick(30);
        return el;
    }

    it('disposes its grid when removed', async () => {
        const el = await mountGrid();
        expect(el.grid, 'the grid never built: the case measures nothing').toBeTruthy();
        const dispose = vi.spyOn(el.grid, 'dispose');
        el.remove();
        expect(dispose).toHaveBeenCalled();
    });

    it('the control: a grid left in the document is not disposed', async () => {
        const el = await mountGrid();
        const dispose = vi.spyOn(el.grid, 'dispose');
        await tick(10);
        expect(dispose).not.toHaveBeenCalled();
    });
});

describe('the guard', () => {
    const SRC = join(__dirname, '..', '..', 'src');
    function sources(dir: string, acc: string[] = []): string[] {
        for (const e of readdirSync(dir)) {
            const p = join(dir, e);
            if (statSync(p).isDirectory()) sources(p, acc);
            else if (e.endsWith('.ts')) acc.push(p);
        }
        return acc;
    }

    it('no component registers on ctx.onDestroy, which does not exist', () => {
        const files = sources(SRC);
        expect(files.length, 'the scan found no sources').toBeGreaterThan(100);
        // Comments that explain the rule name `ctx.onDestroy` too; only code counts.
        const code = (f: string) => readFileSync(f, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
        // Match: `ctx.onDestroy` and `(ctx as any).onDestroy`
        const hits = files.filter(f => /\bctx(?:\s+as\s+any\))?\??\.onDestroy\b/.test(code(f)))
            .map(f => f.slice(SRC.length + 1).replace(/\\/g, '/'));
        expect(hits, 'use onDestroy imported from @pdxui/core').toEqual([]);
    });
});
