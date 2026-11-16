// The flags pdx-flag draws (#1091) are generated from flag-icons by scripts/gen-flags.mjs: one module
// per region, and the loader map written from them. Generated files drift when someone edits them; this
// holds the map to the modules and each module to a plain drawing, as `gen-flags.mjs --check` does.

import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
// @ts-expect-error — an .mjs script without types: the test reads its exports.
import { loaderText } from '../../scripts/gen-flags.mjs';

const FLAG_DIR = join(__dirname, '..', '..', 'src', 'flag');
const modules = readdirSync(join(FLAG_DIR, 'flags')).filter((f) => f.endsWith('.ts'));

describe('the flag modules', () => {
    it('the loader map lists exactly the modules there are', () => {
        expect(readFileSync(join(FLAG_DIR, 'flag-loaders.ts'), 'utf8')).toBe(loaderText(modules.map((f) => f.slice(0, -3))));
    });

    it('every module is a region of two letters, and its flag a plain SVG drawing', () => {
        expect(modules.length).toBeGreaterThan(200);
        for (const f of modules) {
            expect(f, f).toMatch(/^[a-z]{2}\.ts$/);
            const svg = JSON.parse(readFileSync(join(FLAG_DIR, 'flags', f), 'utf8').match(/export default (".*");/)![1]) as string;
            expect(svg.startsWith('<svg'), f).toBe(true);
            expect(/<script|\son\w+=|<foreignObject/i.test(svg), f).toBe(false);
        }
    });
});
