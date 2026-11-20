// The boot modules the pdx() plugin imports into an app (#1246): the theme where the design system is
// imported, the splash into a page that has it, and neither anywhere else.
import { describe, it, expect } from 'vitest';
import { withThemeBoot, withSplashBoot, importsDesign, BOOT_THEME, BOOT_SPLASH, bootImportsPlugin } from '../src/boot-imports';
import { pdx } from '../src/plugin';

describe('the theme boot module', () => {
    for (const code of [
        "import '@pdxui/design';",
        "import '@pdxui/design/base';\nimport '@pdxui/design/themes/neutral';",
        'import "@pdxui/design/components/button.css";',
        "const x = 1; import '@pdxui/design/base';",
    ]) {
        it(`is imported first by a module that imports the design system: ${JSON.stringify(code)}`, () => {
            const out = withThemeBoot(code);
            expect(out).not.toBeNull();
            expect(out!.startsWith(`import '${BOOT_THEME}';\n`)).toBe(true);
            expect(out!.endsWith(code)).toBe(true);
        });
    }

    for (const code of [
        "import { signal } from '@pdxui/core';",
        "const doc = 'import \"@pdxui/designer\"';",
        "import '@pdxui/designish';",
        '// see @pdxui/design for the tokens',
    ]) {
        it(`is not imported by a module that does not: ${JSON.stringify(code)}`, () => {
            expect(importsDesign(code)).toBe(false);
            expect(withThemeBoot(code)).toBeNull();
        });
    }

    it('is imported once', () => {
        const once = withThemeBoot("import '@pdxui/design';")!;
        expect(withThemeBoot(once)).toBeNull();
    });
});

describe('the splash boot module', () => {
    const page = '<html><head><title>x</title></head><body><div id="pdx-splash"></div></body></html>';

    it('is imported by a page that has the splash, in its head', () => {
        const out = withSplashBoot(page, false);
        expect(out).toContain(`<script type="module">import '${BOOT_SPLASH}';</script>\n</head>`);
    });

    it('is imported by a page the plugin will write the splash into', () => {
        expect(withSplashBoot('<html><head></head><body></body></html>', true)).toContain(BOOT_SPLASH);
    });

    it('is not imported by a page without one', () => {
        const plain = '<html><head></head><body></body></html>';
        expect(withSplashBoot(plain, false)).toBe(plain);
    });

    it('is imported once', () => {
        const once = withSplashBoot(page, false);
        expect(withSplashBoot(once, true)).toBe(once);
    });
});

describe('the plugin', () => {
    it('pdx() carries it, and adds the page\'s script before Vite processes the page', () => {
        const boot = pdx().find((p) => p.name === 'pragmatic-pdx-boot');
        expect(boot, 'pdx() has no boot plugin').toBeDefined();
        expect((boot!.transformIndexHtml as { order?: string }).order).toBe('pre');
    });

    it('leaves a stylesheet alone, and imports the theme into a page\'s inline script', () => {
        const plugin = bootImportsPlugin(() => false);
        const transform = plugin.transform as (code: string, id: string) => { code: string } | null;
        expect(transform("@import '@pdxui/design/base';", '/app/src/app.css')).toBeNull();
        expect(transform("import '@pdxui/design/base';", '/app/index.html?html-proxy&index=0.js')?.code).toContain(BOOT_THEME);
    });
});
