// `@pdxui/core/devtools` resolves to the overlay under every condition, not only `development`.
// An `import` or `require` pointing at the core barrel, which has no `initDevTools`, would leave
// the CDN's "manual init" the devtools page documents unable to work from a build.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

const CORE = join(__dirname, '..');
const pkg = JSON.parse(readFileSync(join(CORE, 'package.json'), 'utf-8')) as {
    exports: Record<string, Record<string, string>>;
};
const viteConfig = readFileSync(join(CORE, 'vite.config.ts'), 'utf-8');

describe('@pdxui/core/devtools', () => {
    const entry = pkg.exports['./devtools'];

    it('points its built conditions at a devtools build, not at the barrel', () => {
        const barrel = pkg.exports['.'];
        expect(entry.import).not.toBe(barrel.import);
        expect(entry.require).not.toBe(barrel.require);
        expect(entry.import).toMatch(/devtools/);
        expect(entry.require).toMatch(/devtools/);
    });

    it('is a build entry of its own, from the overlay', () => {
        expect(viteConfig).toMatch(/devtools:\s*'src\/devtools\/overlay\.ts'/);
    });
});
