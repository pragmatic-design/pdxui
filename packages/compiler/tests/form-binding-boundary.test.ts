// Where a long form can be split: `pdx-form`'s wiring is compile-time and stops at the template.
//
// The recipe says «the compiler wires the rest: every named control gets its change and blur events
// routed into `form.fields.x`». True, and it does not say that "named control" means *written in
// that template*. `applyFormBindings` walks the HTML nodes of ONE .pdx: a control living inside a
// child component's own template is another file, and is never seen — the child is in the same
// `<pdx-form>` in the DOM, carries the same `name`, and the form does not know it exists.
//
// A probe shows it: a form with two named controls, one local and one inside a child, typed into
// both, gives `{ "here": "A", "deep": "" }`. The consequence is architectural, not cosmetic — a
// panel whose controls need the binding has to stay in the form's own file. This file states the
// boundary as a fact so a page can be written against it, and so it cannot move without someone
// deciding to move it.

import { describe, it, expect } from 'vitest';
import { applyFormBindings } from '../src/compiler/codegen-form-binding';
import type { HtmlNode } from '../src/parser/template';

function wire(content: string): string {
    const nodes = [{ type: 'html', content } as HtmlNode];
    applyFormBindings(nodes);
    return (nodes[0] as HtmlNode).content;
}

describe('the form binding reaches the controls of this template', () => {
    it('wires a named control written beside the form', () => {
        const out = wire('<pdx-form :form="f"><pdx-input name="here"></pdx-input></pdx-form>');
        expect(out, 'the control the recipe promises is not wired').toContain('@pdx-input=');
        expect(out).toContain('here');
    });

    it('does NOT wire a control that lives inside a child component', () => {
        // The child tag is not a form control, and whatever it renders is compiled from its own
        // file. Nothing here can see the `pdx-input name="deep"` in its template.
        const out = wire('<pdx-form :form="f"><pdx-inner-field name="deep"></pdx-inner-field></pdx-form>');
        expect(out, 'a child component was wired — the boundary moved').not.toContain('@pdx-input=');
        expect(out).not.toContain('@pdx-change=');
        expect(out).not.toContain(':value=');
    });

    it('the two cases side by side: the local one is wired, the nested one is not', () => {
        // The probe, as a compile-time assertion: `{ here: 'A', deep: '' }`.
        const out = wire(
            '<pdx-form :form="f">'
            + '<pdx-input name="here"></pdx-input>'
            + '<pdx-inner-field name="deep"></pdx-inner-field>'
            + '</pdx-form>',
        );
        const local = out.slice(out.indexOf('<pdx-input'), out.indexOf('<pdx-inner-field'));
        const nested = out.slice(out.indexOf('<pdx-inner-field'));
        expect(local, 'the local control lost its wiring').toContain('f.fields.here');
        expect(nested, 'the nested control gained wiring it cannot have').not.toContain('f.fields.deep');
    });

    it('and a control nested in plain markup IS wired — the boundary is the component, not the depth', () => {
        // Worth pinning: the rule is not "only direct children". Any depth of ordinary elements is
        // still this template. That is what makes the component boundary the thing to document.
        const out = wire(
            '<pdx-form :form="f"><div class="panel"><fieldset><pdx-input name="deep"></pdx-input></fieldset></div></pdx-form>',
        );
        expect(out).toContain('f.fields.deep');
    });
});
