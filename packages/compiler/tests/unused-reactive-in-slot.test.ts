// A signal read inside a `<slot>` template IS read.
//
// `collectTemplateIdentifiers` walks every block a template can hold — @if, @for, @switch, @defer,
// @try, @await, @show, @portal — and a SLOT TEMPLATE too. Without it, a page that passes content to
// a child through `<slot name="empty" let:_>` and reads its own signals in there is told those
// signals are «declared but not used in the template», which is exactly backwards: they are used,
// in the one place the walk cannot see.
//
// In the showcase the two empty states live in the grid's `empty` slot and `activeFilterCount` is
// read only there. The warning is `info`, so nothing fails loudly — the showcase's own
// `page-warnings.spec.ts` is what catches it, because that suite holds the app to ZERO warnings.
import { describe, it, expect } from 'vitest';
import { compile } from '../src/plugin';

const src = (template: string, script: string) =>
    `<template>\n${template}\n</template>\n<script setup>\n${script}\n</script>`;

const warningsOf = (source: string): string[] =>
    (compile(source, 'probe.pdx').warnings ?? []).map(w => `${w.code}: ${w.message}`);

describe('a reactive variable read inside a slot template', () => {
    it('is not reported as unused', () => {
        const code = src(
            `<pdx-data-grid>
  <slot name="empty" let:_>
    <p :show="count > 0">{{ count }}</p>
  </slot>
</pdx-data-grid>`,
            'let count = $signal(0);',
        );

        expect(warningsOf(code).filter(w => w.includes('PDX_UNUSED_REACTIVE')),
            'a signal read only inside a slot is reported as dead code')
            .toEqual([]);
    });

    it('control — one that is read NOWHERE is still reported', () => {
        // The check has to keep working: a slot in the template must not silence every unused
        // warning in the file.
        const code = src(
            `<pdx-data-grid>
  <slot name="empty" let:_>
    <p>{{ used }}</p>
  </slot>
</pdx-data-grid>`,
            'let used = $signal(0);\nlet neverRead = $signal(0);',
        );

        const unused = warningsOf(code).filter(w => w.includes('PDX_UNUSED_REACTIVE'));
        expect(unused.join(' '), 'the unused one is no longer reported').toContain('neverRead');
        expect(unused.join(' '), 'the one read in the slot is reported too').not.toContain("'used'");
    });

    it('control — the slot’s own scope variables are not counted as page identifiers', () => {
        // `let:row` names a variable the CHILD supplies. It is not the page's, and a page that
        // declares nothing by that name must not be told it is using one.
        const code = src(
            `<pdx-list>
  <slot name="item" let:row>
    <span>{{ row.name }}</span>
  </slot>
</pdx-list>`,
            'let rows = $signal([]);',
        );

        expect(warningsOf(code).some(w => w.includes('PDX_UNDEFINED') && w.includes('row')),
            'the slot’s scope variable was read as an undefined page identifier')
            .toBe(false);
    });
});
