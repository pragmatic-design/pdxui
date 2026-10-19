// pdx()'s second plugin (#156): `@pdxui/design`'s stylesheets in the form of the target, and the target
// told to core through `__PDX_TARGET__`. The rewrite itself is behaviour-queries.test.ts.
import { describe, it, expect } from 'vitest';
import { join } from 'node:path';
import { pdx } from '../src/plugin';

type Transform = (code: string, id: string) => { code: string } | undefined;
type Config = (c: object, env: { command: string }) => { define?: Record<string, string> } | undefined;

const RULE = '[pdx-card-style="elevated"] .pdx-surface-card { border: none; }';
const DESIGN_CSS = join(__dirname, '../../design/src/surfaces/base.css').replace(/\\/g, '/');
const APP_CSS = join(__dirname, '../demo/showcase-new/showcase-shared.css').replace(/\\/g, '/');

function plugins(target?: 'baseline-2026' | 'baseline-2024') {
    const [main, design] = pdx({ devtools: false, autoAlias: false, ...(target && { target }) });
    return { main: main as unknown as { enforce?: string; config: Config }, design: design as unknown as { enforce?: string; transform: Transform } };
}

describe("pdx()'s design-target plugin", () => {
    it('is the second plugin, without enforce: between vite:css and vite:css-post', () => {
        const { main, design } = plugins();
        expect(main.enforce).toBe('pre');
        expect(design.enforce).toBeUndefined();
    });

    it('rewrites a design stylesheet into style queries under the default target', () => {
        const out = plugins().design.transform(RULE, DESIGN_CSS);
        expect(out?.code).toContain('@container style(--pdx-card-style: elevated)');
        expect(plugins().design.transform(RULE, `${DESIGN_CSS}?direct`)?.code).toContain('@container style(');
    });

    it('leaves it as written under baseline-2024', () => {
        expect(plugins('baseline-2024').design.transform(RULE, DESIGN_CSS)).toBeUndefined();
    });

    it("control — leaves an app's own stylesheet, and a module that is not CSS, alone", () => {
        expect(plugins().design.transform(RULE, APP_CSS)).toBeUndefined();
        expect(plugins().design.transform('export {}', DESIGN_CSS.replace(/\.css$/, '.ts'))).toBeUndefined();
    });

    it('defines __PDX_TARGET__ for core, with the target', () => {
        expect(plugins().main.config({}, { command: 'serve' })?.define).toEqual({ __PDX_TARGET__: '"baseline-2026"' });
        expect(plugins('baseline-2024').main.config({}, { command: 'build' })?.define).toEqual({ __PDX_TARGET__: '"baseline-2024"' });
    });
});
