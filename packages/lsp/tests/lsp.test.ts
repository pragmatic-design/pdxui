// Tests for LSP capabilities — diagnostics, completion, definition, hover.
// Tests individual capability functions, not the full LSP connection.

import { describe, it, expect } from 'vitest';
import { getRuneCompletions, getComponentCompletions, getTranslationKeyCompletions, getTransitionCompletions } from '../src/capabilities/completion';
import { resolveTagDefinition, getWordAtPosition } from '../src/capabilities/definition';
import { getHoverInfo } from '../src/capabilities/hover';
import type { ComponentEntry, TranslationKeys } from '../src/utils/project-scanner';

// ─── Completion ─────────────────────────────────────────────────────

describe('Completion', () => {
    it('returns rune completions', () => {
        const items = getRuneCompletions();
        expect(items.length).toBeGreaterThan(10);

        const labels = items.map(i => i.label);
        expect(labels).toContain('@prop');
        expect(labels).toContain('@page');
        expect(labels).toContain('@transition');
        expect(labels).toContain('@i18n');
        expect(labels).toContain('@fetch');
        expect(labels).toContain('@form');
    });

    it('returns component completions from registry', () => {
        const components: ComponentEntry[] = [
            { tag: 'pdx-counter', filePath: '/src/counter.pdx' },
            { tag: 'pdx-user-card', filePath: '/src/user-card.pdx' },
        ];
        const items = getComponentCompletions(components);
        expect(items).toHaveLength(2);
        expect(items[0].label).toBe('pdx-counter');
        expect(items[1].label).toBe('pdx-user-card');
    });

    it('returns empty for no components', () => {
        const items = getComponentCompletions([]);
        expect(items).toHaveLength(0);
    });

    it('returns translation key completions', () => {
        const translations: TranslationKeys[] = [
            { locale: 'en', keys: ['welcome', 'errors.required', 'items'] },
            { locale: 'it', keys: ['welcome', 'errors.required', 'extra'] },
        ];
        const items = getTranslationKeyCompletions(translations);
        // Deduplicated: welcome, errors.required, items, extra = 4
        expect(items).toHaveLength(4);
        expect(items.map(i => i.label)).toContain('welcome');
        expect(items.map(i => i.label)).toContain('extra');
    });

    it('returns transition preset completions', () => {
        const items = getTransitionCompletions();
        expect(items.length).toBeGreaterThan(5);
        expect(items.map(i => i.label)).toContain('fade');
        expect(items.map(i => i.label)).toContain('slide-left');
    });
});

// ─── Go-to-Definition ───────────────────────────────────────────────

describe('Definition', () => {
    const components: ComponentEntry[] = [
        { tag: 'pdx-counter', filePath: '/src/counter.pdx' },
        { tag: 'pdx-header', filePath: '/src/layout/header.pdx' },
    ];

    it('resolves known component tag to file', () => {
        const loc = resolveTagDefinition('pdx-counter', components);
        expect(loc).not.toBeNull();
        expect(loc!.uri).toContain('counter.pdx');
    });

    it('returns null for unknown tag', () => {
        const loc = resolveTagDefinition('pdx-unknown', components);
        expect(loc).toBeNull();
    });

    it('extracts word at position', () => {
        const source = '<pdx-counter :value="5" />';
        const word = getWordAtPosition(source, { line: 0, character: 5 });
        expect(word).toBe('pdx-counter');
    });

    it('extracts word from middle of tag', () => {
        const source = '  <pdx-header class="big">';
        const word = getWordAtPosition(source, { line: 0, character: 8 });
        expect(word).toBe('pdx-header');
    });

    it('returns null outside word', () => {
        const source = '  <pdx-counter />';
        const word = getWordAtPosition(source, { line: 0, character: 0 });
        expect(word).toBeNull();
    });
});

// ─── Hover ──────────────────────────────────────────────────────────

describe('Hover', () => {
    it('returns docs for @prop', () => {
        const source = '@prop label: string;';
        const hover = getHoverInfo(source, { line: 0, character: 2 });
        expect(hover).not.toBeNull();
        expect(hover!.contents).toHaveProperty('value');
        expect((hover!.contents as any).value).toContain('@prop');
    });

    it('returns docs for $signal', () => {
        const source = 'let count = $signal(0);';
        const hover = getHoverInfo(source, { line: 0, character: 14 });
        expect(hover).not.toBeNull();
        expect((hover!.contents as any).value).toContain('$signal');
    });

    it('returns docs for $t', () => {
        const source = "const msg = $t('hello');";
        const hover = getHoverInfo(source, { line: 0, character: 13 });
        expect(hover).not.toBeNull();
        expect((hover!.contents as any).value).toContain('$t');
    });

    it('returns docs for @transition', () => {
        const source = "@transition 'fade';";
        const hover = getHoverInfo(source, { line: 0, character: 5 });
        expect(hover).not.toBeNull();
        expect((hover!.contents as any).value).toContain('@transition');
    });

    it('returns null for non-keyword', () => {
        const source = 'const x = 42;';
        const hover = getHoverInfo(source, { line: 0, character: 10 });
        expect(hover).toBeNull();
    });
});
