// Tests for applyFormBindings — auto-wiring form controls inside <pdx-form>.

import { describe, it, expect } from 'vitest';
import { applyFormBindings } from '../src/compiler/codegen-form-binding';
import type { HtmlNode, TemplateNode } from '../src/parser/template';

// ─── Helpers ──────────────────────────────────────────────────

function makeHtml(content: string): HtmlNode[] {
    return [{ type: 'html', content } as HtmlNode];
}

function applyAndGet(content: string): string {
    const nodes = makeHtml(content);
    applyFormBindings(nodes);
    return (nodes[0] as HtmlNode).content;
}

// ─── Text input controls ─────────────────────────────────────

describe('applyFormBindings — text input controls', () => {
    it('injects @pdx-input and @pdx-blur on pdx-input (no :value)', () => {
        const result = applyAndGet(
            '<pdx-form :form="f"><pdx-input name="x"></pdx-input></pdx-form>'
        );

        // Text inputs skip :value binding (controlled-input loop prevention)
        expect(result).not.toContain(':value=');
        // Should inject pdx-input event (not pdx-change) for text inputs
        expect(result).toContain('@pdx-input=');
        expect(result).toContain('@pdx-blur=');
        // Check form variable reference
        expect(result).toContain('ctx.f.fields.x');
    });

    it('injects @pdx-input on pdx-textarea (no :value)', () => {
        const result = applyAndGet(
            '<pdx-form :form="myForm"><pdx-textarea name="bio"></pdx-textarea></pdx-form>'
        );

        expect(result).not.toContain(':value=');
        expect(result).toContain('@pdx-input=');
        expect(result).toContain('@pdx-blur=');
        expect(result).toContain('ctx.myForm.fields.bio');
    });

    it('injects @pdx-input on pdx-password-input (no :value)', () => {
        const result = applyAndGet(
            '<pdx-form :form="f"><pdx-password-input name="pw"></pdx-password-input></pdx-form>'
        );

        expect(result).not.toContain(':value=');
        expect(result).toContain('@pdx-input=');
    });

    it('injects @pdx-input on pdx-search-input (no :value)', () => {
        const result = applyAndGet(
            '<pdx-form :form="f"><pdx-search-input name="q"></pdx-search-input></pdx-form>'
        );

        expect(result).not.toContain(':value=');
        expect(result).toContain('@pdx-input=');
    });

    it('injects @pdx-input on pdx-masked-input (no :value)', () => {
        const result = applyAndGet(
            '<pdx-form :form="f"><pdx-masked-input name="phone"></pdx-masked-input></pdx-form>'
        );

        expect(result).not.toContain(':value=');
        expect(result).toContain('@pdx-input=');
    });
});

// ─── Checked controls ─────────────────────────────────────────

describe('applyFormBindings — checked controls', () => {
    it('injects :checked, @pdx-change, @pdx-blur on pdx-checkbox', () => {
        const result = applyAndGet(
            '<pdx-form :form="f"><pdx-checkbox name="agree"></pdx-checkbox></pdx-form>'
        );

        expect(result).toContain(':checked=');
        expect(result).not.toContain(':value=');
        expect(result).toContain('@pdx-change=');
        expect(result).toContain('@pdx-blur=');
        expect(result).toContain('e.detail?.checked');
    });

    it('injects :checked, @pdx-change on pdx-switch', () => {
        const result = applyAndGet(
            '<pdx-form :form="f"><pdx-switch name="dark"></pdx-switch></pdx-form>'
        );

        expect(result).toContain(':checked=');
        expect(result).toContain('@pdx-change=');
        expect(result).toContain('e.detail?.checked');
    });
});

// ─── Other controls (use pdx-change) ─────────────────────────

describe('applyFormBindings — non-text controls', () => {
    it('injects :value and @pdx-change on pdx-select', () => {
        const result = applyAndGet(
            '<pdx-form :form="f"><pdx-select name="color"></pdx-select></pdx-form>'
        );

        expect(result).toContain(':value=');
        expect(result).toContain('@pdx-change=');
        expect(result).toContain('@pdx-blur=');
    });

    it('injects :value and @pdx-change on pdx-number-input', () => {
        const result = applyAndGet(
            '<pdx-form :form="f"><pdx-number-input name="qty"></pdx-number-input></pdx-form>'
        );

        expect(result).toContain(':value=');
        expect(result).toContain('@pdx-change=');
    });

    it('injects :value and @pdx-change on pdx-slider', () => {
        const result = applyAndGet(
            '<pdx-form :form="f"><pdx-slider name="volume"></pdx-slider></pdx-form>'
        );

        expect(result).toContain(':value=');
        expect(result).toContain('@pdx-change=');
        expect(result).toContain('e.detail?.value');
    });

    it('injects :value and @pdx-change on pdx-rating', () => {
        const result = applyAndGet(
            '<pdx-form :form="f"><pdx-rating name="stars"></pdx-rating></pdx-form>'
        );

        expect(result).toContain(':value=');
        expect(result).toContain('@pdx-change=');
    });

    it('injects :value and change event on pdx-segmented', () => {
        const result = applyAndGet(
            '<pdx-form :form="f"><pdx-segmented name="view"></pdx-segmented></pdx-form>'
        );

        expect(result).toContain(':value=');
        expect(result).toContain('@change=');
        expect(result).toContain('e.detail?.value');
    });

    it('injects :value and pressedchange on pdx-toggle', () => {
        const result = applyAndGet(
            '<pdx-form :form="f"><pdx-toggle name="mode"></pdx-toggle></pdx-form>'
        );

        expect(result).toContain(':value=');
        expect(result).toContain('@pressedchange=');
        expect(result).toContain('e.detail?.pressed');
    });
});

// ─── pdx-form-field ──────────────────────────────────────────

describe('applyFormBindings — pdx-form-field', () => {
    it('injects :error, :touched, :warning on pdx-form-field', () => {
        const result = applyAndGet(
            '<pdx-form :form="f"><pdx-form-field name="email"></pdx-form-field></pdx-form>'
        );

        expect(result).toContain(':error=');
        expect(result).toContain(':touched=');
        expect(result).toContain(':warning=');
        expect(result).toContain('ctx.f.fields.email');
    });

    it('uses correct signal accessor pattern on form-field', () => {
        const result = applyAndGet(
            '<pdx-form :form="myForm"><pdx-form-field name="name"></pdx-form-field></pdx-form>'
        );

        expect(result).toContain('ctx.myForm.fields.name?.error()');
        expect(result).toContain('ctx.myForm.fields.name?.touched()');
        expect(result).toContain('ctx.myForm.fields.name?.warning()');
    });
});

// ─── No overwrite existing bindings ──────────────────────────

describe('applyFormBindings — no overwrite', () => {
    it('does NOT overwrite existing :value binding', () => {
        const result = applyAndGet(
            '<pdx-form :form="f"><pdx-select name="x" :value="custom"></pdx-select></pdx-form>'
        );

        // Should keep the custom binding
        expect(result).toContain(':value="custom"');
        // Should still inject @pdx-change and @pdx-blur
        expect(result).toContain('@pdx-change=');
        expect(result).toContain('@pdx-blur=');
    });

    it('does NOT overwrite existing @pdx-change binding', () => {
        const result = applyAndGet(
            '<pdx-form :form="f"><pdx-select name="x" @pdx-change="handler"></pdx-select></pdx-form>'
        );

        // Should keep original handler
        expect(result).toContain('@pdx-change="handler"');
        // Count: should have exactly one @pdx-change
        expect(result.split('@pdx-change').length - 1).toBe(1);
    });

    it('does NOT overwrite existing @pdx-blur binding', () => {
        const result = applyAndGet(
            '<pdx-form :form="f"><pdx-input name="x" @pdx-blur="myBlur"></pdx-input></pdx-form>'
        );

        expect(result).toContain('@pdx-blur="myBlur"');
        expect(result.split('@pdx-blur').length - 1).toBe(1);
    });

    it('does NOT overwrite existing :error on pdx-form-field', () => {
        const result = applyAndGet(
            '<pdx-form :form="f"><pdx-form-field name="x" :error="myError"></pdx-form-field></pdx-form>'
        );

        expect(result).toContain(':error="myError"');
        // Should still inject :touched and :warning
        expect(result).toContain(':touched=');
        expect(result).toContain(':warning=');
    });

    it('does NOT overwrite existing :checked on pdx-checkbox', () => {
        const result = applyAndGet(
            '<pdx-form :form="f"><pdx-checkbox name="x" :checked="custom"></pdx-checkbox></pdx-form>'
        );

        expect(result).toContain(':checked="custom"');
        // Count: only one :checked
        expect(result.split(':checked').length - 1).toBe(1);
    });
});

// ─── Scope boundaries ─────────────────────────────────────────

describe('applyFormBindings — scope boundaries', () => {
    it('does NOT inject on elements outside pdx-form', () => {
        const result = applyAndGet(
            '<pdx-input name="x"></pdx-input>'
        );

        expect(result).not.toContain('@pdx-input=');
        expect(result).not.toContain('@pdx-blur=');
    });

    it('does NOT inject after </pdx-form> closing tag', () => {
        const result = applyAndGet(
            '<pdx-form :form="f"><pdx-input name="inside"></pdx-input></pdx-form><pdx-input name="outside"></pdx-input>'
        );

        // "inside" should have bindings
        expect(result).toContain('ctx.f.fields.inside');
        // "outside" should NOT have bindings
        expect(result).not.toContain('ctx.f.fields.outside');
    });

    it('does NOT inject when form has no :form binding', () => {
        const result = applyAndGet(
            '<pdx-form><pdx-input name="x"></pdx-input></pdx-form>'
        );

        expect(result).not.toContain('@pdx-input=');
        expect(result).not.toContain('@pdx-blur=');
    });

    it('does NOT inject on elements without name attribute', () => {
        const result = applyAndGet(
            '<pdx-form :form="f"><pdx-input></pdx-input></pdx-form>'
        );

        expect(result).not.toContain('@pdx-input=');
        expect(result).not.toContain('@pdx-blur=');
    });

    it('does NOT inject on non-form-control elements inside form', () => {
        const result = applyAndGet(
            '<pdx-form :form="f"><div name="x">text</div></pdx-form>'
        );

        expect(result).not.toContain('@pdx-change=');
        expect(result).not.toContain(':value=');
    });
});

// ─── Multiple nodes (cross-node state) ───────────────────────

describe('applyFormBindings — multiple html nodes', () => {
    it('tracks form context across multiple HtmlNode objects', () => {
        const nodes: TemplateNode[] = [
            { type: 'html', content: '<pdx-form :form="f">' } as HtmlNode,
            { type: 'html', content: '<pdx-input name="x"></pdx-input>' } as HtmlNode,
            { type: 'html', content: '</pdx-form>' } as HtmlNode,
        ];

        applyFormBindings(nodes);

        const secondNode = nodes[1] as HtmlNode;
        expect(secondNode.content).toContain('@pdx-input=');
        expect(secondNode.content).toContain('@pdx-blur=');
    });

    it('stops injecting after form closes across nodes', () => {
        const nodes: TemplateNode[] = [
            { type: 'html', content: '<pdx-form :form="f"><pdx-input name="in"></pdx-input></pdx-form>' } as HtmlNode,
            { type: 'html', content: '<pdx-input name="out"></pdx-input>' } as HtmlNode,
        ];

        applyFormBindings(nodes);

        const secondNode = nodes[1] as HtmlNode;
        expect(secondNode.content).not.toContain('@pdx-input=');
    });

    it('skips non-html nodes gracefully', () => {
        const nodes: TemplateNode[] = [
            { type: 'html', content: '<pdx-form :form="f">' } as HtmlNode,
            { type: 'interpolation', expression: 'count', pipes: [] } as any,
            { type: 'html', content: '<pdx-input name="x"></pdx-input></pdx-form>' } as HtmlNode,
        ];

        applyFormBindings(nodes);

        const thirdNode = nodes[2] as HtmlNode;
        expect(thirdNode.content).toContain('@pdx-input=');
    });
});

// ─── Self-closing tags ───────────────────────────────────────

describe('applyFormBindings — self-closing tags', () => {
    it('handles self-closing form controls', () => {
        const result = applyAndGet(
            '<pdx-form :form="f"><pdx-input name="x" /></pdx-form>'
        );

        expect(result).toContain('@pdx-input=');
        expect(result).toContain('@pdx-blur=');
        // Should still end with />
        expect(result).toContain('/>');
    });

    it('handles self-closing pdx-checkbox', () => {
        const result = applyAndGet(
            '<pdx-form :form="f"><pdx-checkbox name="ok" /></pdx-form>'
        );

        expect(result).toContain(':checked=');
        expect(result).toContain('@pdx-change=');
        expect(result).toContain('/>');
    });
});

// ─── Field-group path prefixing ─────────────────────────────

describe('applyFormBindings — pdx-field-group', () => {
    it('prefixes child field paths with group name', () => {
        const result = applyAndGet(
            '<pdx-form :form="f"><pdx-field-group name="customer"><pdx-input name="email" /></pdx-field-group></pdx-form>'
        );
        // Should generate f.fields['customer.email'] (bracket notation for dotted path)
        expect(result).toContain("f.fields['customer.email']");
    });

    it('prefixes pdx-form-field with group path', () => {
        const result = applyAndGet(
            '<pdx-form :form="f"><pdx-field-group name="customer"><pdx-form-field name="email"></pdx-form-field></pdx-field-group></pdx-form>'
        );
        expect(result).toContain("f.fields['customer.email']?.error()");
        expect(result).toContain("f.fields['customer.email']?.touched()");
    });

    it('supports nested field-groups', () => {
        const result = applyAndGet(
            '<pdx-form :form="f"><pdx-field-group name="billing"><pdx-field-group name="address"><pdx-input name="city" /></pdx-field-group></pdx-field-group></pdx-form>'
        );
        expect(result).toContain("f.fields['billing.address.city']");
    });

    it('pops group path on closing tag', () => {
        const result = applyAndGet(
            '<pdx-form :form="f"><pdx-field-group name="customer"><pdx-input name="name" /></pdx-field-group><pdx-input name="notes" /></pdx-form>'
        );
        // Inside group: customer.name (dotted path)
        expect(result).toContain("f.fields['customer.name']");
        // Outside group: plain field name (dot notation)
        expect(result).toContain('f.fields.notes');
    });

    it('mixes grouped and flat fields', () => {
        const result = applyAndGet(
            '<pdx-form :form="f"><pdx-input name="orderNumber" /><pdx-field-group name="customer"><pdx-input name="email" /></pdx-field-group></pdx-form>'
        );
        expect(result).toContain('f.fields.orderNumber');
        expect(result).toContain("f.fields['customer.email']");
    });

    it('rewrites name attribute to dotted path inside field-group', () => {
        const result = applyAndGet(
            '<pdx-form :form="f"><pdx-field-group name="customer"><pdx-input name="email" /></pdx-field-group></pdx-form>'
        );
        // The name attribute should be rewritten from "email" to "customer.email"
        expect(result).toContain('name="customer.email"');
        expect(result).not.toMatch(/<pdx-input[^>]*name="email"/);
    });

    it('rewrites name on pdx-form-field inside field-group', () => {
        const result = applyAndGet(
            '<pdx-form :form="f"><pdx-field-group name="customer"><pdx-form-field name="email"></pdx-form-field></pdx-field-group></pdx-form>'
        );
        expect(result).toContain('<pdx-form-field name="customer.email"');
    });

    it('does not inject bindings on the field-group tag itself', () => {
        const result = applyAndGet(
            '<pdx-form :form="f"><pdx-field-group name="customer"><pdx-input name="email" /></pdx-field-group></pdx-form>'
        );
        // The field-group tag should NOT get :error, :value etc. bindings
        const fieldGroupTag = result.match(/<pdx-field-group[^>]*>/)?.[0] || '';
        expect(fieldGroupTag).not.toContain(':error=');
        expect(fieldGroupTag).not.toContain(':value=');
    });

    it('resets group path when form closes', () => {
        const nodes = makeHtml(
            '<pdx-form :form="f"><pdx-field-group name="customer"><pdx-input name="name" /></pdx-field-group></pdx-form><pdx-form :form="g"><pdx-input name="x" /></pdx-form>'
        );
        applyFormBindings(nodes);
        const result = (nodes[0] as HtmlNode).content;
        // Second form should NOT have customer prefix
        expect(result).toContain('g.fields.x');
        expect(result).not.toContain("g.fields['customer.x']");
    });
});
