// Tests for @i18n directive — script analyzer + codegen integration.

import { describe, it, expect } from 'vitest';
import { compile } from '../src/plugin';
import { analyzeScript } from '../src/compiler/script-analyzer';

function compileI18n(source: string) {
    return compile(source, 'page.pdx');
}

describe('@i18n — script analyzer', () => {
    it('parses @i18n block with all options', () => {
        const analysis = analyzeScript(`
@i18n {
  locales: ['en', 'it', 'de'],
  default: 'en',
  translations: './translations',
  detect: true,
  persist: true,
}
@page '/home';
let count = $signal(0);
        `, 'page.pdx');

        expect(analysis.i18n).toBeDefined();
        expect(analysis.i18n!.locales).toEqual(['en', 'it', 'de']);
        expect(analysis.i18n!.default).toBe('en');
        expect(analysis.i18n!.translationsPath).toBe('./translations');
        expect(analysis.i18n!.detect).toBe(true);
        expect(analysis.i18n!.persist).toBe(true);
    });

    it('parses @i18n block with minimal options', () => {
        const analysis = analyzeScript(`
@i18n {
  locales: ['en', 'es'],
  default: 'en',
}
let x = $signal(0);
        `, 'page.pdx');

        expect(analysis.i18n!.locales).toEqual(['en', 'es']);
        expect(analysis.i18n!.default).toBe('en');
        expect(analysis.i18n!.translationsPath).toBe('./translations');
    });

    it('parses @i18n with session persist', () => {
        const analysis = analyzeScript(`
@i18n {
  locales: ['en'],
  default: 'en',
  persist: 'session',
}
let x = $signal(0);
        `, 'page.pdx');

        expect(analysis.i18n!.persist).toBe('session');
    });

    it('detects $t() usage in script', () => {
        const analysis = analyzeScript(`
let msg = $signal($t('hello'));
        `, 'page.pdx');

        expect(analysis.usedFeatures.has('$t')).toBe(true);
    });

    it('detects $n() and $d() usage', () => {
        const analysis = analyzeScript(`
let price = $signal($n(9.99));
let date = $signal($d(new Date()));
        `, 'page.pdx');

        expect(analysis.usedFeatures.has('$n')).toBe(true);
        expect(analysis.usedFeatures.has('$d')).toBe(true);
    });

    it('detects $r() usage', () => {
        const analysis = analyzeScript(`
let relative = $signal($r(-1, 'day'));
        `, 'page.pdx');

        expect(analysis.usedFeatures.has('$r')).toBe(true);
    });
});

describe('@i18n — codegen', () => {
    it('generates initI18n + createI18nLoader for @i18n block', () => {
        const { code } = compileI18n(`
<template><div>{{ $t('hello') }}</div></template>
<script setup>
@i18n {
  locales: ['en', 'it'],
  default: 'en',
  translations: './translations',
  detect: true,
  persist: true,
}
</script>
        `);

        expect(code).toContain('initI18n');
        expect(code).toContain('createI18nLoader');
        expect(code).toContain('locales: ["en", "it"]');
        expect(code).toContain('default: "en"');
        expect(code).toContain('detect: true');
        expect(code).toContain('persist: true');
        expect(code).toContain("basePath: './translations'");
    });

    it('auto-imports $t when used in template expressions', () => {
        const { code } = compileI18n(`
<template><div>{{ $t('welcome') }}</div></template>
<script setup>
let x = $signal(0);
</script>
        `);

        expect(code).toContain("$t");
        expect(code).toContain("from '@pdxui/core'");
    });

    it('auto-imports $n when used', () => {
        const { code } = compileI18n(`
<template><div>{{ $n(1234) }}</div></template>
<script setup>
let price = $signal(0);
const formatted = $derived($n(price));
</script>
        `);

        expect(code).toContain('$n');
    });

    it('does not import i18n helpers when not used', () => {
        const { code } = compileI18n(`
<template><div>Hello</div></template>
<script setup>
let count = $signal(0);
</script>
        `);

        expect(code).not.toContain('$t');
        expect(code).not.toContain('initI18n');
    });
});

describe('@transition / @layout — codegen manifest', () => {
    it('emits transition in route manifest', () => {
        const { code } = compileI18n(`
<template><div>Page</div></template>
<script setup>
@page '/dashboard';
@transition 'slide-left';
</script>
        `);

        expect(code).toContain('transition:"slide-left"');
        expect(code).toContain("__pdx_routes");
    });

    // The RESOLVED chain, not the layout's name, which nobody reads: what the outlet diffs is the
    // tag.
    it('emits the layout chain in route manifest', () => {
        const { code } = compileI18n(`
<template><div>Page</div></template>
<script setup>
@page '/admin/users';
@layout 'admin';
</script>
        `);

        expect(code).toContain('layouts:["pdx-admin-layout"]');
    });

    it('emits both transition and layout together', () => {
        const { code } = compileI18n(`
<template><div>Page</div></template>
<script setup>
@page '/settings';
@transition 'fade';
@layout 'dashboard';
</script>
        `);

        expect(code).toContain('transition:"fade"');
        expect(code).toContain('layouts:["pdx-dashboard-layout"]');
        expect(code).toContain('path:"/settings"');
    });
});
