import { describe, it, expect, beforeEach } from 'vitest';
import { effect } from '../src/reactivity/signal';
import { html } from '../src/renderer/template';
import { setPermissions, hasPermission, requirePermission } from '../src/component/permissions';

describe('permissions', () => {
    beforeEach(() => {
        document.body.innerHTML = '';
        setPermissions(() => false); // reset
    });

    describe('setPermissions + hasPermission', () => {
        it('defaults to false when no permissions set', () => {
            const can = hasPermission('any.action');
            expect(can()).toBe(false);
        });

        it('returns true for granted permissions', () => {
            setPermissions((p) => p === 'booking.view');
            expect(hasPermission('booking.view')()).toBe(true);
            expect(hasPermission('booking.delete')()).toBe(false);
        });

        it('updates reactively when permissions change', () => {
            const canDelete = hasPermission('booking.delete');
            expect(canDelete()).toBe(false);

            setPermissions((p) => ['booking.view', 'booking.delete'].includes(p));
            expect(canDelete()).toBe(true);
        });

        it('works with effects', () => {
            const canAdmin = hasPermission('admin.panel');
            const values: boolean[] = [];

            effect(() => { values.push(canAdmin()); });
            expect(values).toEqual([false]);

            setPermissions(() => true);
            expect(values).toEqual([false, true]);
        });
    });

    describe('requirePermission', () => {
        it('shows content when permission granted', () => {
            setPermissions(() => true);
            const frag = requirePermission('any', () => html`<button>Delete</button>`);
            document.body.appendChild(frag);
            expect(document.body.querySelector('button')).not.toBeNull();
        });

        it('hides content when permission denied', () => {
            setPermissions(() => false);
            const frag = requirePermission('admin', () => html`<button>Admin</button>`);
            document.body.appendChild(frag);
            expect(document.body.querySelector('button')).toBeNull();
        });

        it('shows else branch when permission denied', () => {
            setPermissions(() => false);
            const frag = requirePermission(
                'admin',
                () => html`<nav>Admin Panel</nav>`,
                () => html`<span class="denied">No access</span>`
            );
            document.body.appendChild(frag);
            expect(document.body.querySelector('nav')).toBeNull();
            expect(document.body.querySelector('.denied')).not.toBeNull();
        });

        it('switches reactively on permission change', () => {
            let perms: string[] = [];
            setPermissions((p) => perms.includes(p));

            const frag = requirePermission(
                'booking.delete',
                () => html`<button class="del">Delete</button>`,
                () => html`<span class="no">Denied</span>`
            );
            document.body.appendChild(frag);

            expect(document.body.querySelector('.del')).toBeNull();
            expect(document.body.querySelector('.no')).not.toBeNull();

            // Grant permission
            perms = ['booking.delete'];
            setPermissions((p) => perms.includes(p));

            expect(document.body.querySelector('.del')).not.toBeNull();
            expect(document.body.querySelector('.no')).toBeNull();
        });

        it('works inside html template', () => {
            setPermissions((p) => p === 'view');
            const frag = html`<div>
                ${requirePermission('view', () => html`<span>Visible</span>`)}
                ${requirePermission('edit', () => html`<span>Hidden</span>`)}
            </div>`;
            document.body.appendChild(frag);

            const spans = document.body.querySelectorAll('span');
            expect(spans.length).toBe(1);
            expect(spans[0].textContent).toBe('Visible');
        });
    });
});
