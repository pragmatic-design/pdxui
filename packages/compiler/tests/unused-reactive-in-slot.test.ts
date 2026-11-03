// A signal read inside a snippet the page passes its child IS read.
//
// `collectTemplateIdentifiers` walks every block a template can hold — @if, @for, @switch, @defer,
// @try, @await, @show, @portal — and a snippet's body too. Without it, a page that passes content to
// a child through `@snippet empty() { … }` (the alpha `<slot name="empty" let:_>`) and reads its own
// signals in there is told those signals are «declared but not used in the template», which is
// exactly backwards: they are used, in the one place the walk cannot see.
//
// In the showcase the two empty states live in the grid's `empty` snippet and `activeFilterCount` is
// read only there. The warning is `info`, so nothing fails loudly — the showcase's own
// `page-warnings.spec.ts` is what catches it, because that suite holds the app to ZERO warnings.
import { describe, it, expect } from 'vitest';
import { compile } from '../src/plugin';

const src = (template: string, script: string) =>
    `<template>\n${template}\n</template>\n<script>\n${script}\n</script>`;

const warningsOf = (source: string): string[] =>
    (compile(source, 'probe.pdx').warnings ?? []).map(w => `${w.code}: ${w.message}`);

describe('a reactive variable read inside a snippet the page passes', () => {
    it('is not reported as unused', () => {
        const code = src(
            `<pdx-data-grid>
  @snippet empty() {
    @show (count > 0) { <p>{{ count }}</p> }
  }
</pdx-data-grid>`,
            'let count = $signal(0);',
        );

        expect(warningsOf(code).filter(w => w.includes('PDX_UNUSED_REACTIVE')),
            'a signal read only inside a snippet is reported as dead code')
            .toEqual([]);
    });

    it('control — one that is read NOWHERE is still reported', () => {
        // The check has to keep working: a snippet in the template must not silence every unused
        // warning in the file.
        const code = src(
            `<pdx-data-grid>
  @snippet empty() {
    <p>{{ used }}</p>
  }
</pdx-data-grid>`,
            'let used = $signal(0);\nlet neverRead = $signal(0);',
        );

        const unused = warningsOf(code).filter(w => w.includes('PDX_UNUSED_REACTIVE'));
        expect(unused.join(' '), 'the unused one is no longer reported').toContain('neverRead');
        expect(unused.join(' '), 'the one read in the snippet is reported too').not.toContain("'used'");
    });

    it('a $derived read only by a script @snippet is not reported as unused (#683)', () => {
        // The snippet's body is a template the component's own template renders with @render: what
        // it reads is read.
        const code = src(
            '@render row(1)',
            "let items = $signal(['a']);\nconst shown = $derived(items.map(s => s.toUpperCase()));\n@snippet row(n) { <p>{{ n }}: {{ shown }}</p> }",
        );
        expect(warningsOf(code).filter(w => w.includes('PDX_UNUSED_REACTIVE'))).toEqual([]);
    });

    it('control — a $derived neither the template nor a snippet reads is still reported', () => {
        const code = src(
            '@render row(1)',
            "let items = $signal(['a']);\nconst shown = $derived(items.length);\nconst unread = $derived(items.length * 2);\n@snippet row(n) { <p>{{ n }}: {{ shown }}</p> }",
        );
        const unused = warningsOf(code).filter(w => w.includes('PDX_UNUSED_REACTIVE')).join(' ');
        expect(unused).toContain("'unread'");
        expect(unused).not.toContain("'shown'");
    });

    it('control — the snippet’s parameters are not counted as page identifiers', () => {
        // `row` names a value the CHILD passes. It is not the page's, and a page that declares
        // nothing by that name must not be told it is using one.
        const code = src(
            `<pdx-list>
  @snippet item(row) {
    <span>{{ row.name }}</span>
  }
</pdx-list>`,
            'let rows = $signal([]);',
        );

        expect(warningsOf(code).some(w => w.includes('PDX_UNDEFINED') && w.includes('row')),
            'the snippet’s parameter was read as an undefined page identifier')
            .toBe(false);
    });
});
