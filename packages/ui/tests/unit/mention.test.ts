// Tests for pdx-mention component.

import { describe, it, expect, beforeEach } from 'vitest';
import { cleanup, mount, tick } from './helpers';

import '../../src/mention/pdx-mention';

describe('pdx-mention', () => {
    beforeEach(cleanup);

    const users = [
        { value: 'alice', label: 'Alice Johnson' },
        { value: 'bob', label: 'Bob Smith' },
        { value: 'charlie', label: 'Charlie Brown' },
        { value: 'diana', label: 'Diana Prince' },
    ];

    async function mountMention(props: Record<string, any> = {}) {
        const attrs: Record<string, string> = {};
        if (props.trigger) attrs.trigger = props.trigger;
        if (props.placeholder) attrs.placeholder = props.placeholder;
        if (props.disabled) attrs.disabled = '';
        if (props.readonly) attrs.readonly = '';
        if (props.name) attrs.name = props.name;
        if (props.rows) attrs.rows = String(props.rows);
        const el = await mount('pdx-mention', attrs) as any;
        if (props.items) el.items = props.items;
        if (props.value !== undefined) el.value = props.value;
        await tick(200);
        return el;
    }

    it('renders mention wrapper', async () => {
        const el = await mountMention({ items: users });
        const wrap = el.querySelector('.pdx-mention-wrap');
        expect(wrap).toBeTruthy();
    });

    it('renders textarea', async () => {
        const el = await mountMention({ items: users });
        const textarea = el.querySelector('.pdx-mention-textarea');
        expect(textarea).toBeTruthy();
        expect(textarea.tagName).toBe('TEXTAREA');
    });

    it('renders dropdown element (hidden by default)', async () => {
        const el = await mountMention({ items: users });
        const dropdown = el.querySelector('.pdx-mention-dropdown');
        expect(dropdown).toBeTruthy();
        expect(dropdown.style.display).toBe('none');
    });

    it('sets placeholder text', async () => {
        const el = await mountMention({ items: users, placeholder: 'Type here...' });
        const textarea = el.querySelector('.pdx-mention-textarea') as HTMLTextAreaElement;
        expect(textarea.placeholder).toBe('Type here...');
    });

    it('sets textarea rows', async () => {
        const el = await mountMention({ items: users, rows: 5 });
        const textarea = el.querySelector('.pdx-mention-textarea') as HTMLTextAreaElement;
        expect(Number(textarea.rows)).toBe(5);
    });

    it('disables textarea when disabled', async () => {
        const el = await mountMention({ items: users, disabled: true });
        const textarea = el.querySelector('.pdx-mention-textarea') as HTMLTextAreaElement;
        expect(textarea.disabled).toBe(true);
    });

    it('sets readonly on textarea', async () => {
        const el = await mountMention({ items: users, readonly: true });
        const textarea = el.querySelector('.pdx-mention-textarea') as HTMLTextAreaElement;
        expect(textarea.readOnly).toBe(true);
    });

    it('the name is the host\'s: it submits, and no inner input is named', async () => {
        const el = await mountMention({ items: users, name: 'comment' });
        expect(el.getAttribute('name')).toBe('comment');
        expect(el.querySelectorAll('[name]')).toHaveLength(0);
    });

    it('sets initial value on textarea', async () => {
        const el = await mountMention({ items: users, value: 'Hello @Alice' });
        const textarea = el.querySelector('.pdx-mention-textarea') as HTMLTextAreaElement;
        expect(textarea.value).toBe('Hello @Alice');
    });

    it('supports custom trigger characters', async () => {
        const el = await mountMention({ items: users, trigger: '#' });
        // Component created with # trigger — just verify it mounts
        const textarea = el.querySelector('.pdx-mention-textarea');
        expect(textarea).toBeTruthy();
    });

    it('supports multiple trigger characters', async () => {
        const el = await mountMention({ items: users, trigger: '@, #' });
        const textarea = el.querySelector('.pdx-mention-textarea');
        expect(textarea).toBeTruthy();
    });
});
