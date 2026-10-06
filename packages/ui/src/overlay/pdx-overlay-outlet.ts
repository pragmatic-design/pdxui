// pdx-overlay-outlet — Container for programmatic dialogs (confirm/alert/dialog).
// Watches dialogQueue.items() via effect() and imperatively creates/removes DOM.
// Pattern: identical to pdx-toast.ts rendering (effect + imperative DOM).

import { component, html, effect, overlayStack, focusTrap } from '@pdxui/core';
import type { DialogInstance, Dispose } from '@pdxui/core';
import { getDialogQueue } from '../dialog/dialog-service';
import { uiString, aroundPlaceholder, uiAttr} from '../shared/i18n';
import { holdModalFocus } from '../shared/modal-focus';
// The modals it draws are the dialog's — `.pdx-dialog-backdrop`, `-panel`, `-header` — so the dialog's
// stylesheet travels with it. Without it they are styled only where another component has brought
// dialog.css; with the outlet alone, the modal is plain text at the top of the page.
import '@pdxui/design/components/dialog';

/**
 * Where the dialogs opened from code appear: it draws the page's dialog queue, stacking each dialog
 * above the last, trapping focus inside and closing the top one on Escape.
 */
component('pdx-overlay-outlet', {
    props: {},
    setup(ctx) {
        const queue = getDialogQueue();
        let containerEl: HTMLElement | null = null;
        const trapDisposers = new Map<string, Dispose>();
        const dismissDisposers = new Map<string, Dispose>();
        // Where focus goes when dialogs close. Not each trap recording, at creation, what had focus:
        // a dialog created while focus is not yet inside the one under it — two opened in the same
        // tick — would record the page, behind the modal still open, and closeAll() would return
        // focus into a dialog it had just closed. The outlet decides instead:
        // into the dialog now on top, at what last had focus in it; with none left, to what opened
        // the first.
        const openers = new Map<string, HTMLElement | null>();
        const lastFocused = new Map<string, HTMLElement>();

        /** The element a dialog focuses first: Cancel for a confirm, OK for an alert, Close for a dialog. */
        function focusTargetOf(el: Element, type: DialogInstance['type']): HTMLElement | null {
            return el.querySelector(
                type === 'confirm' ? '.pdx-alert-cancel' : type === 'alert' ? '.pdx-alert-ok' : '.pdx-dialog-close',
            ) as HTMLElement | null;
        }

        /** Read from the queue, not the DOM: a dialog that closed stays in the DOM for its exit. */
        function isOpen(id: string): boolean {
            return queue.items.peek().some(d => d.id === id);
        }

        function isTop(id: string): boolean {
            const items = queue.items.peek();
            return items[items.length - 1]?.id === id;
        }

        function refocusAfterClose(items: DialogInstance[], removed: HTMLElement[]): void {
            const top = items[items.length - 1];
            if (top) {
                const topEl = containerEl?.querySelector(`[data-dialog-id="${top.id}"]`);
                if (!topEl) return;
                const last = lastFocused.get(top.id);
                const target = last && last.isConnected && topEl.contains(last) ? last : focusTargetOf(topEl, top.type);
                target?.focus();
                return;
            }
            // None left: what opened the bottom-most of those that closed.
            const opener = openers.get(removed[0]?.dataset.dialogId ?? '');
            if (opener?.isConnected && !removed.some(r => r.contains(opener))) opener.focus();
        }

        function renderDialogs(items: DialogInstance[]) {
            if (!containerEl) return;
            const currentIds = new Set(items.map(d => d.id));

            // Remove stale dialogs
            const removed: HTMLElement[] = [];
            const active = document.activeElement;
            for (const child of Array.from(containerEl.children) as HTMLElement[]) {
                const id = child.dataset.dialogId;
                if (id && !currentIds.has(id)) {
                    child.removeAttribute('data-open');
                    cleanupDialog(id);
                    removed.push(child);
                    setTimeout(() => child.remove(), 200);
                }
            }
            // Focus was in a dialog that closed (or is lost): it moves now, not when the element goes.
            if (removed.length && (!active || active === document.body || removed.some(r => r.contains(active)))) {
                refocusAfterClose(items, removed);
            }
            for (const r of removed) {
                const id = r.dataset.dialogId ?? '';
                openers.delete(id);
                lastFocused.delete(id);
            }

            // Add new dialogs
            const existingIds = new Set<string>();
            for (const child of Array.from(containerEl.children)) {
                const id = (child as HTMLElement).dataset.dialogId;
                if (id) existingIds.add(id);
            }

            for (const item of items) {
                if (existingIds.has(item.id)) continue;
                openers.set(item.id, document.activeElement as HTMLElement | null);
                const el = createDialogElement(item);
                containerEl.appendChild(el);
                requestAnimationFrame(() => {
                    // Closed before its first frame (Escape, closeAll): a trap opened now would never
                    // be disposed, and would hide the dialogs still open from screen readers.
                    if (!isOpen(item.id)) return;
                    el.setAttribute('data-open', '');
                    // Focus trap. It does not restore focus: refocusAfterClose does.
                    const panel = el.querySelector('.pdx-dialog-panel') as HTMLElement;
                    if (panel) {
                        panel.addEventListener('focusin', (e) => lastFocused.set(item.id, e.target as HTMLElement));
                        trapDisposers.set(item.id, focusTrap(panel, { restoreFocus: false }));
                    }
                    // Auto-focus: cancel for confirm, OK for alert, close for dialog. Only if it is still
                    // the dialog on top when the timer runs: closed by then, focus would land in a dialog
                    // that is leaving; covered by another, behind the one on top.
                    const focusTarget = focusTargetOf(el, item.type);
                    if (focusTarget) setTimeout(() => { if (isTop(item.id)) focusTarget.focus(); }, 0);
                });
            }
        }

        function cleanupDialog(id: string) {
            const trap = trapDisposers.get(id);
            if (trap) { trap(); trapDisposers.delete(id); }
            const dismiss = dismissDisposers.get(id);
            if (dismiss) { dismiss(); dismissDisposers.delete(id); }
        }

        function closeDialog(item: DialogInstance, result: unknown) {
            cleanupDialog(item.id);
            queue.close(item.id, result);
        }

        function createDialogElement(item: DialogInstance): HTMLElement {
            const wrapper = document.createElement('div');
            wrapper.dataset.dialogId = item.id;
            wrapper.className = 'pdx-dialog-backdrop';
            wrapper.style.zIndex = String(item.zIndex);

            const sizeClass = item.size ? `pdx-dialog-${item.size}` : 'pdx-dialog-sm';
            const panel = document.createElement('div');
            panel.className = `pdx-dialog-panel ${sizeClass}`;
            // confirm/alert = alertdialog (requires user action), dialog = dialog
            panel.setAttribute('role', item.type === 'dialog' ? 'dialog' : 'alertdialog');
            panel.setAttribute('aria-modal', 'true');
            panel.setAttribute('aria-label', item.title);

            // Header
            const header = document.createElement('div');
            header.className = 'pdx-dialog-header';
            const titleSpan = document.createElement('span');
            titleSpan.textContent = item.title;
            header.appendChild(titleSpan);

            if (item.type === 'dialog') {
                const closeBtn = document.createElement('button');
                closeBtn.className = 'pdx-dialog-close';
                uiAttr(closeBtn, 'aria-label', () => uiString('overlay', 'close'));
                closeBtn.textContent = '\u00d7';
                closeBtn.onclick = () => closeDialog(item, undefined);
                header.appendChild(closeBtn);
            }

            panel.appendChild(header);

            // Body
            const body = document.createElement('div');
            body.className = 'pdx-dialog-body';

            if (item.message) {
                const msg = document.createElement('p');
                msg.style.cssText = 'margin:0 0 var(--pdx-space-md);color:var(--pdx-color-muted)';
                msg.textContent = item.message;
                // The message is the dialog's description, read with its title.
                msg.id = `pdx-outlet-msg-${item.id}`;
                panel.setAttribute('aria-describedby', msg.id);
                body.appendChild(msg);
            }

            // Type-to-confirm input
            let typeInput: HTMLInputElement | null = null;
            if (item.type === 'confirm' && item.confirmText) {
                const typeBlock = document.createElement('div');
                typeBlock.style.marginTop = 'var(--pdx-space-md)';
                const typeLabel = document.createElement('p');
                typeLabel.className = 'pdx-txt-small pdx-ink-muted';
                typeLabel.style.marginBottom = 'var(--pdx-space-xs)';
                // Build label safely — no innerHTML with user content. The sentence is a string with a
                // `{text}` placeholder, split around the <strong> that shows it.
                const [before, after] = aroundPlaceholder(uiString('alert-dialog', 'typeToConfirm'), 'text');
                typeLabel.appendChild(document.createTextNode(before));
                const strong = document.createElement('strong');
                strong.textContent = item.confirmText;
                typeLabel.appendChild(strong);
                typeLabel.appendChild(document.createTextNode(after));
                typeBlock.appendChild(typeLabel);
                typeInput = document.createElement('input');
                typeInput.className = 'pdx-input';
                typeInput.type = 'text';
                typeBlock.appendChild(typeInput);
                body.appendChild(typeBlock);
            }

            panel.appendChild(body);

            // Footer
            const footer = document.createElement('div');
            footer.className = 'pdx-dialog-footer';

            if (item.type === 'confirm') {
                const cancelBtn = document.createElement('button');
                cancelBtn.className = 'pdx-alert-cancel pdx-ghost';
                cancelBtn.type = 'button';
                cancelBtn.textContent = item.cancelLabel || uiString('alert-dialog', 'cancel');
                cancelBtn.onclick = () => closeDialog(item, false);
                footer.appendChild(cancelBtn);

                const confirmBtn = document.createElement('button');
                confirmBtn.className = `pdx-alert-confirm ${item.variant === 'danger' ? 'pdx-danger' : 'pdx-primary'}`;
                confirmBtn.type = 'button';
                footer.appendChild(confirmBtn);

                // Timer-gated + type-to-confirm logic
                let countdown = item.confirmDelay || 0;
                let countdownInterval: ReturnType<typeof setInterval> | null = null;

                function updateConfirmState() {
                    let enabled = true;
                    let label = item.confirmLabel || uiString('alert-dialog', 'confirm');

                    if (countdown > 0) {
                        enabled = false;
                        label = `${label} (${countdown}s)`;
                    }
                    if (item.confirmText && typeInput && typeInput.value !== item.confirmText) {
                        enabled = false;
                    }

                    confirmBtn.disabled = !enabled;
                    confirmBtn.textContent = label;
                }

                if (countdown > 0) {
                    countdownInterval = setInterval(() => {
                        countdown--;
                        updateConfirmState();
                        if (countdown <= 0 && countdownInterval) {
                            clearInterval(countdownInterval);
                            countdownInterval = null;
                        }
                    }, 1000);
                }

                if (typeInput) {
                    typeInput.addEventListener('input', updateConfirmState);
                }

                updateConfirmState();
                confirmBtn.onclick = () => {
                    if (confirmBtn.disabled) return;
                    if (countdownInterval) clearInterval(countdownInterval);
                    closeDialog(item, true);
                };
            } else if (item.type === 'alert') {
                const okBtn = document.createElement('button');
                okBtn.className = 'pdx-alert-ok pdx-primary';
                okBtn.type = 'button';
                okBtn.textContent = uiString('overlay', 'ok');
                okBtn.onclick = () => closeDialog(item, undefined);
                footer.appendChild(okBtn);
            }

            if (footer.children.length > 0) {
                panel.appendChild(footer);
            }

            wrapper.appendChild(panel);
            // A click on the backdrop or on the dialog's text keeps focus inside.
            holdModalFocus(wrapper, panel);

            // Escape dismissal via overlayStack
            dismissDisposers.set(item.id, overlayStack.onDismissTop(() => {
                if (item.type === 'confirm') closeDialog(item, false);
                else closeDialog(item, undefined);
            }));

            return wrapper;
        }

        let disposeEffect: (() => void) | null = null;

        ctx.track(() => {
            requestAnimationFrame(() => {
                containerEl = ctx.el.querySelector('.pdx-overlay-container');
                disposeEffect = effect(() => {
                    const items = queue.items();
                    renderDialogs(items);
                });
            });
            return () => {
                if (disposeEffect) disposeEffect();
                for (const [id] of trapDisposers) cleanupDialog(id);
            };
        });

        return {};
    },
    render: () => html`<div class="pdx-overlay-container"></div>`,
});
