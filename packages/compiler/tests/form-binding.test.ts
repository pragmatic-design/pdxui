// Tests for applyFormBindings — auto-wiring form controls inside <pdx-form>.

import { describe, it, expect } from 'vitest';
import { applyFormBindings } from '../src/compiler/codegen-form-binding';
import type { HtmlNode, TemplateNode } from '../src/parser/template';

// ─── Helpers ──────────────────────────────────────────────────

function makeHtml(content: string): HtmlNode[] {
    return [{ type: 'html', content } as HtmlNode];
}

/**
 * The first model of each control that declares one, as the plugin reads it from the manifest
 * (`modelEventOf`, #478–#482). Every library value control has one since #125.
 */
const MODELS: Record<string, string> = {
    'pdx-checkbox': 'checked', 'pdx-switch': 'checked', 'pdx-toggle': 'pressed',
    'pdx-segmented': 'value', 'pdx-slider': 'value', 'pdx-rating': 'value',
    'pdx-input': 'value', 'pdx-textarea': 'value', 'pdx-password-input': 'value', 'pdx-search-input': 'value',
    'pdx-masked-input': 'value', 'pdx-number-input': 'value', 'pdx-otp-input': 'value', 'pdx-pin-input': 'value',
    'pdx-select': 'value', 'pdx-autocomplete': 'value', 'pdx-tag-input': 'value', 'pdx-color-picker': 'value',
    'pdx-date-picker': 'value', 'pdx-time-picker': 'value', 'pdx-radio-group': 'value', 'pdx-checkbox-group': 'value',
};
const modelEventOf = (tag: string) => (MODELS[tag] ? { model: MODELS[tag], event: `${MODELS[tag]}-change` } : null);

function applyAndGet(content: string): string {
    const nodes = makeHtml(content);
    applyFormBindings(nodes, undefined, modelEventOf);
    return (nodes[0] as HtmlNode).content;
}

// ─── Text input controls ─────────────────────────────────────

describe('applyFormBindings — text input controls', () => {
    it('injects @value-change and @pdx-blur on pdx-input, its model (no :value)', () => {
        const result = applyAndGet(
            '<pdx-form :form="f"><pdx-input name="x"></pdx-input></pdx-form>'
        );

        // Text inputs skip :value binding (controlled-input loop prevention)
        expect(result).not.toContain(':value=');
        // Its model's live event (#479), not the commit
        expect(result).toContain('@value-change=');
        expect(result).toContain('@pdx-blur=');
        // Check form variable reference
        expect(result).toContain('ctx.f.x');
    });

    it('injects @value-change on pdx-textarea (no :value)', () => {
        const result = applyAndGet(
            '<pdx-form :form="myForm"><pdx-textarea name="bio"></pdx-textarea></pdx-form>'
        );

        expect(result).not.toContain(':value=');
        expect(result).toContain('@value-change=');
        expect(result).toContain('@pdx-blur=');
        expect(result).toContain('ctx.myForm.bio');
    });

    it('injects @value-change on pdx-password-input (no :value)', () => {
        const result = applyAndGet(
            '<pdx-form :form="f"><pdx-password-input name="pw"></pdx-password-input></pdx-form>'
        );

        expect(result).not.toContain(':value=');
        expect(result).toContain('@value-change=');
    });

    it('injects @value-change on pdx-search-input (no :value)', () => {
        const result = applyAndGet(
            '<pdx-form :form="f"><pdx-search-input name="q"></pdx-search-input></pdx-form>'
        );

        expect(result).not.toContain(':value=');
        expect(result).toContain('@value-change=');
    });

    it('injects @value-change on pdx-masked-input (no :value)', () => {
        const result = applyAndGet(
            '<pdx-form :form="f"><pdx-masked-input name="phone"></pdx-masked-input></pdx-form>'
        );

        expect(result).not.toContain(':value=');
        expect(result).toContain('@value-change=');
    });
});

// ─── Checked controls ─────────────────────────────────────────

describe('applyFormBindings — checked controls', () => {
    it('injects :checked, @checked-change, @pdx-blur on pdx-checkbox, its model', () => {
        const result = applyAndGet(
            '<pdx-form :form="f"><pdx-checkbox name="agree"></pdx-checkbox></pdx-form>'
        );

        expect(result).toContain(':checked=');
        expect(result).not.toContain(':value=');
        expect(result).toContain('@checked-change=');
        expect(result).toContain('@pdx-blur=');
        expect(result).toContain('e.detail.value');
    });

    it('injects :checked, @checked-change on pdx-switch, its model', () => {
        const result = applyAndGet(
            '<pdx-form :form="f"><pdx-switch name="dark"></pdx-switch></pdx-form>'
        );

        expect(result).toContain(':checked=');
        expect(result).toContain('@checked-change=');
        expect(result).toContain('e.detail.value');
    });
});

// ─── Other controls (their model, value-change) ──────────────

describe('applyFormBindings — non-text controls', () => {
    it('injects :value and @value-change on pdx-select, its model (#481)', () => {
        const result = applyAndGet(
            '<pdx-form :form="f"><pdx-select name="color"></pdx-select></pdx-form>'
        );

        expect(result).toContain(':value=');
        expect(result).toContain('@value-change=');
        expect(result).toContain('@pdx-blur=');
    });

    it('injects :value and @value-change on pdx-number-input, its model (#479)', () => {
        const result = applyAndGet(
            '<pdx-form :form="f"><pdx-number-input name="qty"></pdx-number-input></pdx-form>'
        );

        expect(result).toContain(':value=');
        expect(result).toContain('@value-change=');
        expect(result).toContain('e.detail.value');
    });

    it('injects :value and @value-change on pdx-slider, its model', () => {
        const result = applyAndGet(
            '<pdx-form :form="f"><pdx-slider name="volume"></pdx-slider></pdx-form>'
        );

        expect(result).toContain(':value=');
        expect(result).toContain('@value-change=');
        expect(result).toContain('e.detail.value');
    });

    it('injects :value and @value-change on pdx-rating, its model', () => {
        const result = applyAndGet(
            '<pdx-form :form="f"><pdx-rating name="stars"></pdx-rating></pdx-form>'
        );

        expect(result).toContain(':value=');
        expect(result).toContain('@value-change=');
    });

    it('injects :value and @value-change on pdx-segmented, its model', () => {
        const result = applyAndGet(
            '<pdx-form :form="f"><pdx-segmented name="view"></pdx-segmented></pdx-form>'
        );

        expect(result).toContain(':value=');
        expect(result).toContain('@value-change=');
        expect(result).toContain('e.detail.value');
    });

    it('injects :pressed and @pressed-change on pdx-toggle, its model', () => {
        const result = applyAndGet(
            '<pdx-form :form="f"><pdx-toggle name="mode"></pdx-toggle></pdx-form>'
        );

        expect(result).toContain(':pressed=');
        expect(result).not.toContain(':value=');
        expect(result).toContain('@pressed-change=');
        expect(result).toContain('e.detail.value');
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
        expect(result).toContain('ctx.f.email');
    });

    it('uses correct signal accessor pattern on form-field', () => {
        const result = applyAndGet(
            '<pdx-form :form="myForm"><pdx-form-field name="name"></pdx-form-field></pdx-form>'
        );

        expect(result).toContain('ctx.myForm.name?.error()');
        expect(result).toContain('ctx.myForm.name?.touched()');
        expect(result).toContain('ctx.myForm.name?.warning()');
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
        // Should still inject @value-change and @pdx-blur
        expect(result).toContain('@value-change=');
        expect(result).toContain('@pdx-blur=');
    });

    it('does NOT overwrite existing @value-change binding', () => {
        const result = applyAndGet(
            '<pdx-form :form="f"><pdx-select name="x" @value-change="handler"></pdx-select></pdx-form>'
        );

        // Should keep original handler
        expect(result).toContain('@value-change="handler"');
        // Count: should have exactly one @value-change
        expect(result.split('@value-change').length - 1).toBe(1);
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

        expect(result).not.toContain('@value-change=');
        expect(result).not.toContain('@pdx-blur=');
    });

    it('does NOT inject after </pdx-form> closing tag', () => {
        const result = applyAndGet(
            '<pdx-form :form="f"><pdx-input name="inside"></pdx-input></pdx-form><pdx-input name="outside"></pdx-input>'
        );

        // "inside" should have bindings
        expect(result).toContain('ctx.f.inside');
        // "outside" should NOT have bindings
        expect(result).not.toContain('ctx.f.outside');
    });

    it('does NOT inject when form has no :form binding', () => {
        const result = applyAndGet(
            '<pdx-form><pdx-input name="x"></pdx-input></pdx-form>'
        );

        expect(result).not.toContain('@value-change=');
        expect(result).not.toContain('@pdx-blur=');
    });

    it('does NOT inject on elements without name attribute', () => {
        const result = applyAndGet(
            '<pdx-form :form="f"><pdx-input></pdx-input></pdx-form>'
        );

        expect(result).not.toContain('@value-change=');
        expect(result).not.toContain('@pdx-blur=');
    });

    it('does NOT inject on non-form-control elements inside form', () => {
        const result = applyAndGet(
            '<pdx-form :form="f"><div name="x">text</div></pdx-form>'
        );

        expect(result).not.toContain('@value-change=');
        expect(result).not.toContain(':value=');
    });
});

// ─── Without the library's manifest ─────────────────────────

describe('applyFormBindings — a control whose model is not known', () => {
    // A compile without the component registry knows no model. The binding no longer falls back to
    // the alpha `pdx-change`, which no library control emits since #125: it uses the beta
    // convention, the `value` model's event and its `detail.value`.
    it('is bound with value-change and e.detail?.value, not pdx-change', () => {
        const nodes = makeHtml('<pdx-form :form="f"><pdx-select name="color"></pdx-select></pdx-form>');
        applyFormBindings(nodes, undefined, null);
        const result = (nodes[0] as HtmlNode).content;
        expect(result).toContain('@value-change=');
        expect(result).toContain('onChange(e.detail?.value)');
        expect(result).not.toContain('pdx-change');
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

        applyFormBindings(nodes, undefined, modelEventOf);

        const secondNode = nodes[1] as HtmlNode;
        expect(secondNode.content).toContain('@value-change=');
        expect(secondNode.content).toContain('@pdx-blur=');
    });

    it('stops injecting after form closes across nodes', () => {
        const nodes: TemplateNode[] = [
            { type: 'html', content: '<pdx-form :form="f"><pdx-input name="in"></pdx-input></pdx-form>' } as HtmlNode,
            { type: 'html', content: '<pdx-input name="out"></pdx-input>' } as HtmlNode,
        ];

        applyFormBindings(nodes, undefined, modelEventOf);

        const secondNode = nodes[1] as HtmlNode;
        expect(secondNode.content).not.toContain('@value-change=');
    });

    it('skips non-html nodes gracefully', () => {
        const nodes: TemplateNode[] = [
            { type: 'html', content: '<pdx-form :form="f">' } as HtmlNode,
            { type: 'interpolation', expression: 'count', pipes: [] } as any,
            { type: 'html', content: '<pdx-input name="x"></pdx-input></pdx-form>' } as HtmlNode,
        ];

        applyFormBindings(nodes, undefined, modelEventOf);

        const thirdNode = nodes[2] as HtmlNode;
        expect(thirdNode.content).toContain('@value-change=');
    });
});

// ─── Self-closing tags ───────────────────────────────────────

describe('applyFormBindings — self-closing tags', () => {
    it('handles self-closing form controls', () => {
        const result = applyAndGet(
            '<pdx-form :form="f"><pdx-input name="x" /></pdx-form>'
        );

        expect(result).toContain('@value-change=');
        expect(result).toContain('@pdx-blur=');
        // Should still end with />
        expect(result).toContain('/>');
    });

    it('handles self-closing pdx-checkbox', () => {
        const result = applyAndGet(
            '<pdx-form :form="f"><pdx-checkbox name="ok" /></pdx-form>'
        );

        expect(result).toContain(':checked=');
        expect(result).toContain('@checked-change=');
        expect(result).toContain('/>');
    });
});

// ─── Field-group path prefixing ─────────────────────────────

describe('applyFormBindings — pdx-field-group', () => {
    it('prefixes child field paths with group name', () => {
        const result = applyAndGet(
            '<pdx-form :form="f"><pdx-field-group name="customer"><pdx-input name="email" /></pdx-field-group></pdx-form>'
        );
        // Should generate f['customer.email'] (bracket notation for dotted path)
        expect(result).toContain("f['customer.email']");
    });

    it('prefixes pdx-form-field with group path', () => {
        const result = applyAndGet(
            '<pdx-form :form="f"><pdx-field-group name="customer"><pdx-form-field name="email"></pdx-form-field></pdx-field-group></pdx-form>'
        );
        expect(result).toContain("f['customer.email']?.error()");
        expect(result).toContain("f['customer.email']?.touched()");
    });

    it('supports nested field-groups', () => {
        const result = applyAndGet(
            '<pdx-form :form="f"><pdx-field-group name="billing"><pdx-field-group name="address"><pdx-input name="city" /></pdx-field-group></pdx-field-group></pdx-form>'
        );
        expect(result).toContain("f['billing.address.city']");
    });

    it('pops group path on closing tag', () => {
        const result = applyAndGet(
            '<pdx-form :form="f"><pdx-field-group name="customer"><pdx-input name="name" /></pdx-field-group><pdx-input name="notes" /></pdx-form>'
        );
        // Inside group: customer.name (dotted path)
        expect(result).toContain("f['customer.name']");
        // Outside group: plain field name (dot notation)
        expect(result).toContain('f.notes');
    });

    it('mixes grouped and flat fields', () => {
        const result = applyAndGet(
            '<pdx-form :form="f"><pdx-input name="orderNumber" /><pdx-field-group name="customer"><pdx-input name="email" /></pdx-field-group></pdx-form>'
        );
        expect(result).toContain('f.orderNumber');
        expect(result).toContain("f['customer.email']");
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
        applyFormBindings(nodes, undefined, modelEventOf);
        const result = (nodes[0] as HtmlNode).content;
        // Second form should NOT have customer prefix
        expect(result).toContain('g.x');
        expect(result).not.toContain("g['customer.x']");
    });
});
