// `pdx explain <CODE>`: what a diagnostic means, from the catalog, for a person or an agent.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { Mock } from 'vitest';
import explainCmd from '../src/commands/explain';

describe('pdx explain', () => {
    let exitSpy: ReturnType<typeof vi.spyOn>;
    let logSpy: Mock<typeof console.log>;

    beforeEach(() => {
        exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => undefined) as never);
        logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    });
    afterEach(() => { exitSpy.mockRestore(); logSpy.mockRestore(); });

    const printed = (): string => logSpy.mock.calls.map((c) => String(c[0])).join('\n');

    it('--json prints the catalog entry with its code and address', async () => {
        await (explainCmd as any).run({ args: { code: 'PDX_RAW_INTERPOLATION', json: true } });
        const entry = JSON.parse(printed());
        expect(entry).toMatchObject({
            code: 'PDX_RAW_INTERPOLATION', severity: 'warn', category: 'defect',
            url: 'https://pdxui.com/docs/diagnostics#pdx_raw_interpolation',
        });
        expect(entry.fix).toContain(':title="name"');
        expect(exitSpy).not.toHaveBeenCalled();
    });

    it('a lowercase code is the same code', async () => {
        await (explainCmd as any).run({ args: { code: 'pdx_raw_interpolation', json: true } });
        expect(JSON.parse(printed()).code).toBe('PDX_RAW_INTERPOLATION');
    });

    it('the human form names the summary, the fix and the address', async () => {
        await (explainCmd as any).run({ args: { code: 'PDX_DUP_PROP', json: false } });
        expect(printed()).toContain('The same `@prop` declared twice.');
        expect(printed()).toContain('Remove the duplicate `@prop`.');
        expect(printed()).toContain('https://pdxui.com/docs/diagnostics#pdx_dup_prop');
    });

    it('an unknown code exits 1 and suggests the closest one', async () => {
        await (explainCmd as any).run({ args: { code: 'PDX_RAW_INTERPOLATON', json: false } });
        expect(exitSpy).toHaveBeenCalledWith(1);
        expect(printed()).toContain('PDX_RAW_INTERPOLATION');
    });
});
