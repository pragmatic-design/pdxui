// A popup announces `open-change` `{ value }` in place of `pdx-open` and `pdx-close` (#287, decision
// 50), and pdx-select drives its popup with the overlay verbs. `pdx migrate` rewrites both
// mechanically; what a person must join by hand is flagged and left as written.

import { describe, it, expect } from 'vitest';
import { openChangeEvent, selectOverlayVerbs, selectOverlayVerbsScript, cascaderOverlayVerbs, cascaderOverlayVerbsScript, treeSelectOverlayVerbs, treeSelectOverlayVerbsScript, datePickerOverlayVerbs, datePickerOverlayVerbsScript, autocompleteOpenShow, autocompleteOpenUnbound, colorPickerOpenShow, colorPickerOpenUnbound, popoverHideClose, popoverHideUnbound, commandOverlayVerbs, commandOverlayVerbsScript, menuCloseAllClose, menuCloseAllUnbound } from '../src/language/open-change';
import { languageChanges } from '../src/language/changes';
import { compile } from '../src/plugin';

const fix = openChangeEvent.fix as (text: string) => string;

describe('open-change-event: the mechanical rewrite', () => {
    it('both, the open handler a reference: one guard returns it, the close handler follows (the issue\'s case)', () => {
        expect(fix('<pdx-select @pdx-open="load" @pdx-close="count = 0; touched = true"></pdx-select>'))
            .toBe('<pdx-select @open-change="if ($event.detail.value) return load($event); count = 0; touched = true"></pdx-select>');
    });

    it('both, only the close handler a single call: the mirror guard', () => {
        expect(fix('<pdx-select @pdx-open="a = 1; b = 2" @pdx-close="save(a)"></pdx-select>'))
            .toBe('<pdx-select @open-change="if (!$event.detail.value) return save(a); a = 1; b = 2"></pdx-select>');
    });

    it('open alone: returns on close', () => {
        expect(fix('<pdx-select @pdx-open="loaded = true;"></pdx-select>'))
            .toBe('<pdx-select @open-change="if (!$event.detail.value) return; loaded = true"></pdx-select>');
    });

    it('close alone, a reference: returns on open, and is called with the event', () => {
        expect(fix('<pdx-select\n    label="Pick"\n    @pdx-close="onClose"></pdx-select>'))
            .toBe('<pdx-select\n    label="Pick"\n    @open-change="if ($event.detail.value) return; onClose($event)"></pdx-select>');
    });

    it('modifiers are kept, and the quote', () => {
        expect(fix(`<pdx-select @pdx-open.stop='n++'></pdx-select>`))
            .toBe(`<pdx-select @open-change.stop='if (!$event.detail.value) return; n++'></pdx-select>`);
    });

    it('a tag that has not moved to open-change is left alone', () => {
        // pdx-tabs' pdx-close closes a tab, a result: it stays.
        const source = '<pdx-tabs @pdx-close="done = true"></pdx-tabs>';
        expect(openChangeEvent.detect(source)).toEqual([]);
        expect(fix(source)).toBe(source);
    });

    it('a second run changes nothing, and finds nothing', () => {
        const once = fix('<pdx-select @pdx-open="load" @pdx-close="count = 0; touched = true"></pdx-select>');
        expect(openChangeEvent.detect(once)).toEqual([]);
        expect(fix(once)).toBe(once);
    });
});

describe('open-change-event: what a person must join is flagged and left as written', () => {
    const left = [
        // neither handler is a single call or a reference (the issue's case)
        '<pdx-select @pdx-open="a = 1; b = 2" @pdx-close="c = 3; d = 4"></pdx-select>',
        // an arrow function
        '<pdx-select @pdx-open="() => load()"></pdx-select>',
        // two listeners on one event
        '<pdx-select @pdx-open="a()" @pdx-open="b()"></pdx-select>',
        // different modifiers
        '<pdx-select @pdx-open.stop="a()" @pdx-close="b()"></pdx-select>',
    ];
    for (const source of left) {
        it(`flags, and leaves: ${source}`, () => {
            const found = openChangeEvent.detect(source);
            expect(found).toHaveLength(1);
            expect(found[0].note).toMatch(/^Not rewritten: /);
            expect(fix(source)).toBe(source);
        });
    }
});

describe('select-overlay-verbs: pdx-select\'s popup methods are the overlay verbs', () => {
    const script = selectOverlayVerbsScript.fix as (text: string) => string;
    const template = selectOverlayVerbs.fix as (text: string) => string;

    it('in a script: openSelect, closeSelect and toggleSelect become show, close and toggle', () => {
        expect(script('sel.openSelect(); sel?.closeSelect(); el.toggleSelect();'))
            .toBe('sel.show(); sel?.close(); el.toggle();');
    });

    it('a DataSource\'s toggleSelect(id), which takes an argument, is not the select\'s', () => {
        const source = 'ds.toggleSelect(row.id);';
        expect(selectOverlayVerbsScript.detect(source)).toEqual([]);
        expect(script(source)).toBe(source);
    });

    it('in a .pdx the template\'s calls are the pdx entry\'s, the script\'s the script entry\'s', () => {
        const source = '<template><pdx-select :ref="sel"></pdx-select><button @click="sel.openSelect()">Open</button></template>\n<script>\nfunction f() { sel.closeSelect(); }\n</script>';
        expect(selectOverlayVerbs.detect(source).map((f) => f.found)).toEqual(['.openSelect()']);
        expect(template(source)).toContain('@click="sel.show()"');
        expect(template(source)).toContain('sel.closeSelect();');
    });
});

describe('cascader: its popup events and its undeclared methods', () => {
    it('`@pdx-open` on a pdx-cascader is rewritten too', () => {
        expect(fix('<pdx-cascader @pdx-close="saved = true"></pdx-cascader>'))
            .toBe('<pdx-cascader @open-change="if ($event.detail.value) return; saved = true"></pdx-cascader>');
    });

    it('`openCascader()` and `closeCascader()` are `show()` and `close()`, wherever they are written', () => {
        const script = cascaderOverlayVerbsScript.fix as (text: string) => string;
        expect(script('el.openCascader(); el?.closeCascader();')).toBe('el.show(); el?.close();');
        const template = cascaderOverlayVerbs.fix as (text: string) => string;
        expect(template('<template><button @click="c.openCascader()">x</button></template>')).toBe('<template><button @click="c.show()">x</button></template>');
    });
});

describe('tree-select: its popup events and its undeclared methods', () => {
    it('`@pdx-open` on a pdx-tree-select is rewritten too', () => {
        expect(fix('<pdx-tree-select @pdx-open="load"></pdx-tree-select>'))
            .toBe('<pdx-tree-select @open-change="if (!$event.detail.value) return; load($event)"></pdx-tree-select>');
    });

    it('`openTreeSelect()` and `closeTreeSelect()` are `show()` and `close()`, wherever they are written', () => {
        const script = treeSelectOverlayVerbsScript.fix as (text: string) => string;
        expect(script('t.openTreeSelect(); t?.closeTreeSelect();')).toBe('t.show(); t?.close();');
        const template = treeSelectOverlayVerbs.fix as (text: string) => string;
        expect(template('<template><button @click="t.closeTreeSelect()">x</button></template>')).toBe('<template><button @click="t.close()">x</button></template>');
    });
});

describe('the overlays of #288', () => {
    it('`@pdx-close` on a pdx-dialog is rewritten: its open is a model, announced by open-change', () => {
        expect(fix('<pdx-dialog :open="editing" @pdx-close="editing = false"></pdx-dialog>'))
            .toBe('<pdx-dialog :open="editing" @open-change="if ($event.detail.value) return; editing = false"></pdx-dialog>');
    });

    it('`@pdx-close` on a pdx-bottom-sheet is rewritten the same way', () => {
        expect(fix('<pdx-bottom-sheet :open="sheet" @pdx-close="sheet = false"></pdx-bottom-sheet>'))
            .toBe('<pdx-bottom-sheet :open="sheet" @open-change="if ($event.detail.value) return; sheet = false"></pdx-bottom-sheet>');
    });

    it('`@pdx-open` and `@pdx-close` on a pdx-command are joined into one `@open-change` (#288)', () => {
        expect(fix('<pdx-command :open="open" @pdx-open="track()" @pdx-close="open = false"></pdx-command>'))
            .toBe('<pdx-command :open="open" @open-change="if ($event.detail.value) return track(); open = false"></pdx-command>');
    });

    it('`openPalette()` and `closePalette()` on a pdx-command are `show()` and `close()`, wherever they are written (#288)', () => {
        const script = commandOverlayVerbsScript.fix as (text: string) => string;
        expect(script('cmd.openPalette(); cmd?.closePalette();')).toBe('cmd.show(); cmd?.close();');
        const template = commandOverlayVerbs.fix as (text: string) => string;
        expect(template('<template><button @click="cmd.openPalette()">x</button></template>')).toBe('<template><button @click="cmd.show()">x</button></template>');
        for (const id of ['command-overlay-verbs', 'command-overlay-verbs-script']) {
            const entry = languageChanges().find((c) => c.id === id);
            expect(entry?.kind, id).toBe('removed');
            expect(entry?.issue).toBe(288);
        }
    });

    it('`@pdx-close` on a pdx-menu is rewritten the same way (#288)', () => {
        expect(fix('<pdx-menu :open="shown === \'a\'" @pdx-close="hide"></pdx-menu>'))
            .toBe('<pdx-menu :open="shown === \'a\'" @open-change="if ($event.detail.value) return; hide($event)"></pdx-menu>');
    });

    it('`@pdx-close` on a pdx-drawer is rewritten the same way', () => {
        expect(fix('<pdx-drawer :open="panel" @pdx-close="panel = false"></pdx-drawer>'))
            .toBe('<pdx-drawer :open="panel" @open-change="if ($event.detail.value) return; panel = false"></pdx-drawer>');
    });
});

describe('date-picker: its popup events and its undeclared methods', () => {
    it('`@pdx-close` on a pdx-date-picker is rewritten too', () => {
        expect(fix('<pdx-date-picker @pdx-close="saved = true"></pdx-date-picker>'))
            .toBe('<pdx-date-picker @open-change="if ($event.detail.value) return; saved = true"></pdx-date-picker>');
    });

    it('`openPopover()` and `closePopover()` are `show()` and `close()`, wherever they are written', () => {
        const script = datePickerOverlayVerbsScript.fix as (text: string) => string;
        expect(script('dp.openPopover(); dp?.closePopover();')).toBe('dp.show(); dp?.close();');
        const template = datePickerOverlayVerbs.fix as (text: string) => string;
        expect(template('<template><button @click="dp.openPopover()">x</button></template>')).toBe('<template><button @click="dp.show()">x</button></template>');
    });
});

describe('autocomplete-open-show: pdx-autocomplete\'s open() is show()', () => {
    const fix = autocompleteOpenShow.fix as (text: string) => string;

    it('a call on a :ref bound on a pdx-autocomplete of the file, in its template and its script (the issue\'s case)', () => {
        const source = '<template><pdx-autocomplete :ref="ac"></pdx-autocomplete><button @click="ac.open()">Find</button></template>\n<script>\nlet ac = $signal(null);\nfunction focusFind() { ac?.open(); }\n</script>';
        const out = fix(source);
        expect(out).toContain('@click="ac.show()"');
        expect(out).toContain('ac?.show();');
        expect(autocompleteOpenShow.detect(out)).toEqual([]);
        expect(fix(out)).toBe(out);
    });

    it('a ref on another component, or a name the file does not bind to a pdx-autocomplete, is left', () => {
        const source = '<template><pdx-dialog :ref="dlg"></pdx-dialog><pdx-autocomplete :ref="ac"></pdx-autocomplete></template>\n<script>\nfunction f() { dlg.open(); other.open(); }\n</script>';
        expect(autocompleteOpenShow.detect(source)).toEqual([]);
        expect(fix(source)).toBe(source);
    });

    it('`close()` stays', () => {
        const source = '<template><pdx-autocomplete :ref="ac"></pdx-autocomplete><button @click="ac.close()">x</button></template>';
        expect(fix(source)).toBe(source);
    });
});

describe('color-picker: its undeclared open() is show(), tied to the tag as the autocomplete\'s', () => {
    const fix = colorPickerOpenShow.fix as (text: string) => string;

    it('a call on a :ref bound on a pdx-color-picker of the file is rewritten; close() stays', () => {
        const source = '<template><pdx-color-picker :ref="cp"></pdx-color-picker><button @click="cp.open()">Pick</button><button @click="cp.close()">x</button></template>\n<script>\nlet cp = $signal(null);\nfunction pick() { cp?.open(); }\n</script>';
        const out = fix(source);
        expect(out).toContain('@click="cp.show()"');
        expect(out).toContain('cp?.show();');
        expect(out).toContain('@click="cp.close()"');
        expect(fix(out)).toBe(out);
    });

    it('an autocomplete\'s ref is not the colour picker\'s, and the reverse', () => {
        const source = '<template><pdx-autocomplete :ref="ac"></pdx-autocomplete><pdx-color-picker :ref="cp"></pdx-color-picker></template>\n<script>\nfunction f() { ac.open(); }\n</script>';
        expect(colorPickerOpenShow.detect(source)).toEqual([]);
        expect(autocompleteOpenShow.detect('<template><pdx-color-picker :ref="cp"></pdx-color-picker></template>\n<script>\ncp.open();\n</script>')).toEqual([]);
    });

    it('`document.querySelector(\'pdx-color-picker\').open()` is flagged and left', () => {
        const found = colorPickerOpenUnbound.detect("document.querySelector('pdx-color-picker').open();");
        expect(found).toHaveLength(1);
        expect(found[0].note).toContain('show()');
        expect(colorPickerOpenUnbound.fix).toBe('flag');
    });
});

describe('autocomplete-open-unbound: a call the text cannot tie to the tag is flagged', () => {
    it('`document.querySelector(\'pdx-autocomplete\').open()` is flagged and left (the issue\'s case)', () => {
        const source = "document.querySelector('pdx-autocomplete').open();";
        const found = autocompleteOpenUnbound.detect(source);
        expect(found).toHaveLength(1);
        expect(found[0].note).toContain('show()');
        expect(autocompleteOpenUnbound.fix).toBe('flag');
    });

    it('a querySelector of another tag is not reported', () => {
        expect(autocompleteOpenUnbound.detect("document.querySelector('pdx-dialog').open();")).toEqual([]);
    });
});

describe('popover-hide-close: pdx-popover\'s hide() is close() (#288)', () => {
    const fix = popoverHideClose.fix as (text: string) => string;

    it('a call on a :ref bound on a pdx-popover of the file, in its template and its script', () => {
        const source = '<template><pdx-popover :ref="pop"></pdx-popover><button @click="pop.hide()">Done</button></template>\n<script>\nlet pop = $signal(null);\nfunction done() { pop?.hide(); }\n</script>';
        const out = fix(source);
        expect(out).toContain('@click="pop.close()"');
        expect(out).toContain('pop?.close();');
        expect(popoverHideClose.detect(out)).toEqual([]);
        expect(fix(out)).toBe(out);
    });

    it('a ref on another component, or show() and toggle() on the popover, are left', () => {
        const source = '<template><pdx-toast :ref="t"></pdx-toast><pdx-popover :ref="pop"></pdx-popover><button @click="pop.show()">x</button></template>\n<script>\nfunction f() { t.hide(); pop.toggle(); }\n</script>';
        expect(popoverHideClose.detect(source)).toEqual([]);
        expect(fix(source)).toBe(source);
    });

    it('`document.querySelector(\'pdx-popover\').hide()` is flagged and left', () => {
        const found = popoverHideUnbound.detect("document.querySelector('pdx-popover').hide();");
        expect(found).toHaveLength(1);
        expect(found[0].note).toContain('close()');
        expect(popoverHideUnbound.fix).toBe('flag');
        expect(popoverHideUnbound.detect("document.querySelector('pdx-popover').show();")).toEqual([]);
    });

    it('both are in the registry, removed, under #288', () => {
        for (const id of ['popover-hide-close', 'popover-hide-unbound']) {
            const entry = languageChanges().find((c) => c.id === id);
            expect(entry?.kind, id).toBe('removed');
            expect(entry?.issue).toBe(288);
        }
    });
});

describe('menu-closeAll-close: pdx-menu\'s closeAll() is close() (#288)', () => {
    const fix = menuCloseAllClose.fix as (text: string) => string;

    it('a call on a :ref bound on a pdx-menu of the file is rewritten; closeSubmenu() stays', () => {
        const source = '<template><pdx-menu :ref="m"></pdx-menu><button @click="m.closeAll()">x</button><button @click="m.closeSubmenu()">y</button></template>\n<script>\nfunction done() { m?.closeAll(); }\n</script>';
        const out = fix(source);
        expect(out).toContain('@click="m.close()"');
        expect(out).toContain('m?.close();');
        expect(out).toContain('@click="m.closeSubmenu()"');
        expect(fix(out)).toBe(out);
    });

    it('the dialog service\'s closeAll() is left, and a lookup of the tag is flagged', () => {
        const source = '<template><pdx-menu :ref="m"></pdx-menu></template>\n<script>\ndialog.closeAll();\n</script>';
        expect(menuCloseAllClose.detect(source)).toEqual([]);
        const found = menuCloseAllUnbound.detect("document.querySelector('pdx-menu').closeAll();");
        expect(found).toHaveLength(1);
        expect(menuCloseAllUnbound.fix).toBe('flag');
        for (const id of ['menu-closeAll-close', 'menu-closeAll-unbound']) {
            expect(languageChanges().find((c) => c.id === id)?.issue, id).toBe(288);
        }
    });
});

describe('the registry', () => {
    it('holds the #287 entries, each removed', () => {
        for (const id of ['open-change-event', 'select-overlay-verbs', 'select-overlay-verbs-script', 'cascader-overlay-verbs', 'cascader-overlay-verbs-script', 'tree-select-overlay-verbs', 'tree-select-overlay-verbs-script', 'date-picker-overlay-verbs', 'date-picker-overlay-verbs-script', 'autocomplete-open-show', 'autocomplete-open-unbound', 'color-picker-open-show', 'color-picker-open-unbound']) {
            const entry = languageChanges().find((c) => c.id === id);
            expect(entry?.kind, id).toBe('removed');
            expect(entry?.issue).toBe(287);
        }
    });

    it('the compiler reports `@pdx-open` on a pdx-select as PDX_REMOVED_FORM, naming open-change', () => {
        const r = compile('<template>\n  <pdx-select @pdx-open="n++"></pdx-select>\n</template>\n<script>\nlet n = $signal(0);\n</script>\n', 'f.pdx');
        const removed = r.warnings.filter((w) => w.code === 'PDX_REMOVED_FORM');
        expect(removed).toHaveLength(1);
        expect(removed[0].line).toBe(2);
        expect(removed[0].message).toContain('open-change');
    });

    it('control: `@pdx-close` on a component that keeps it is not reported', () => {
        const r = compile('<template>\n  <pdx-tabs @pdx-close="n++"></pdx-tabs>\n</template>\n<script>\nlet n = $signal(0);\n</script>\n', 'f.pdx');
        expect(r.warnings.filter((w) => w.code === 'PDX_REMOVED_FORM')).toEqual([]);
    });
});
