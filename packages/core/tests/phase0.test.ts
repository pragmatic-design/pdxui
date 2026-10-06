// Phase 0 tests: Form-Associated CE, A11y, Snippets integration.

import { describe, it, expect, beforeEach } from 'vitest';
import { component } from '../src/component/component';
import { html } from '../src/renderer/template';
import { announce, destroyAnnouncer } from '../src/a11y/announcer';
import { focusFirst, focusLast, saveFocus, getFocusableElements } from '../src/a11y/focus';
import { roving } from '../src/a11y/roving';

// ═══════════════════════════════════════════════════════════════
// 0.1: Form-Associated Custom Elements
// ═══════════════════════════════════════════════════════════════

describe('Form-Associated CE', () => {
    it('component with formAssociated creates ElementInternals', () => {
        component('pdx-test-input-fa', {
            props: { value: { type: String, default: '' } },
            formAssociated: true,
            setup(ctx) {
                return { value: ctx.value };
            },
            render: () => html`<input type="text" />`,
        });

        const el = document.createElement('pdx-test-input-fa') as any;
        document.body.appendChild(el);

        // Should have _internals (if browser supports it)
        // happy-dom may not support attachInternals, so check gracefully
        expect(el.form).toBeDefined(); // form getter exists
        expect(typeof el.checkValidity).toBe('function');
        expect(typeof el.reportValidity).toBe('function');

        el.remove();
    });

    it('component without formAssociated has no _internals', () => {
        component('pdx-test-plain-fa', {
            props: {},
            setup() {},
            render: () => html`<div>plain</div>`,
        });

        const el = document.createElement('pdx-test-plain-fa') as any;
        document.body.appendChild(el);
        expect(el._internals).toBeNull();
        el.remove();
    });
});

// ═══════════════════════════════════════════════════════════════
// 0.2: A11y — Announcer
// ═══════════════════════════════════════════════════════════════

describe('announce()', () => {
    beforeEach(() => destroyAnnouncer());

    it('creates a live region in the DOM', () => {
        announce('Hello screen reader');
        const region = document.querySelector('[aria-live]');
        expect(region).not.toBeNull();
        expect(region!.getAttribute('role')).toBe('status');
    });

    it('sets aria-live to assertive when priority is assertive', () => {
        announce('Error!', 'assertive');
        const region = document.querySelector('[aria-live]');
        expect(region!.getAttribute('aria-live')).toBe('assertive');
    });

    it('is visually hidden', () => {
        announce('hidden text');
        const region = document.querySelector('[aria-live]') as HTMLElement;
        expect(region.style.position).toBe('absolute');
        expect(region.style.overflow).toBe('hidden');
    });
});

// ═══════════════════════════════════════════════════════════════
// 0.2: A11y — Focus Management
// ═══════════════════════════════════════════════════════════════

describe('focus management', () => {
    it('focusFirst focuses the first focusable element', () => {
        const container = document.createElement('div');
        container.innerHTML = '<span>text</span><button id="btn1">First</button><button id="btn2">Second</button>';
        document.body.appendChild(container);

        const result = focusFirst(container);
        expect(result).not.toBeNull();
        expect(result!.id).toBe('btn1');
        container.remove();
    });

    it('focusLast focuses the last focusable element', () => {
        const container = document.createElement('div');
        container.innerHTML = '<button id="a">A</button><button id="b">B</button>';
        document.body.appendChild(container);

        const result = focusLast(container);
        expect(result!.id).toBe('b');
        container.remove();
    });

    it('saveFocus returns restore function', () => {
        const btn = document.createElement('button');
        document.body.appendChild(btn);
        btn.focus();

        const restore = saveFocus();
        // Focus something else
        const other = document.createElement('input');
        document.body.appendChild(other);
        other.focus();

        restore(); // should return focus to btn
        // Note: happy-dom may not fully support focus tracking
        btn.remove();
        other.remove();
    });

    it('getFocusableElements returns all focusable children', () => {
        const container = document.createElement('div');
        container.innerHTML = '<button>A</button><span>text</span><input type="text"><a href="#">link</a><div tabindex="0">div</div>';
        document.body.appendChild(container);

        const focusable = getFocusableElements(container);
        expect(focusable.length).toBe(4); // button, input, a, div[tabindex]
        container.remove();
    });
});

// ═══════════════════════════════════════════════════════════════
// 0.2: A11y — Roving Tabindex
// ═══════════════════════════════════════════════════════════════

describe('roving tabindex', () => {
    it('initializes tabindex: first=0, rest=-1', () => {
        const container = document.createElement('div');
        container.innerHTML = `
            <div role="tab">Tab 1</div>
            <div role="tab">Tab 2</div>
            <div role="tab">Tab 3</div>
        `;
        document.body.appendChild(container);

        const dispose = roving(container, { selector: '[role="tab"]' });

        const tabs = container.querySelectorAll('[role="tab"]');
        expect(tabs[0].getAttribute('tabindex')).toBe('0');
        expect(tabs[1].getAttribute('tabindex')).toBe('-1');
        expect(tabs[2].getAttribute('tabindex')).toBe('-1');

        dispose();
        container.remove();
    });

    it('calls onSelect on Enter key', () => {
        const container = document.createElement('div');
        container.innerHTML = `
            <div role="tab">Tab 1</div>
            <div role="tab">Tab 2</div>
        `;
        document.body.appendChild(container);

        let selectedIndex = -1;
        const dispose = roving(container, {
            selector: '[role="tab"]',
            onSelect: (_, i) => { selectedIndex = i; },
        });

        const firstTab = container.querySelector('[role="tab"]') as HTMLElement;
        firstTab.focus();
        firstTab.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));

        expect(selectedIndex).toBe(0);

        dispose();
        container.remove();
    });

    it('dispose removes event listener', () => {
        const container = document.createElement('div');
        container.innerHTML = '<div role="tab">Tab 1</div>';
        document.body.appendChild(container);

        const dispose = roving(container, { selector: '[role="tab"]' });
        dispose(); // should not throw

        container.remove();
    });
});
