// pdx-toast — Toast notification container.
// Renders toasts from a global queue. Supports 6 positions, 3 variants,
// title+description, progress bar, pause on hover, action buttons, promise API.

import { component, html, effect, createToastQueue } from '@pdxui/core';
import type { ToastQueue, Toast } from '@pdxui/core';
import { uiString, uiAttr} from '../shared/i18n';
// This component's styles travel with it, so an app ships the CSS of what it renders
// and no more.
import '@pdxui/design/components/toast';
import '../icon/pdx-icon'; // rendered by this component, and registered by nobody else

let _globalQueue: ToastQueue | null = null;

export function getToastQueue(): ToastQueue {
    if (!_globalQueue) _globalQueue = createToastQueue();
    return _globalQueue;
}

/** Global toast API. */
export const toast = {
    success: (msg: string, opts?: any) => getToastQueue().success(msg, opts),
    error: (msg: string, opts?: any) => getToastQueue().error(msg, opts),
    warning: (msg: string, opts?: any) => getToastQueue().warning(msg, opts),
    info: (msg: string, opts?: any) => getToastQueue().info(msg, opts),
    promise: (p: any, msgs: any, opts?: any) => getToastQueue().promise(p, msgs, opts),
    dismiss: (id: string) => getToastQueue().dismiss(id),
    clear: () => getToastQueue().clear(),
    /** Add with full options. */
    add: (data: any) => getToastQueue().add(data),
};

const ICON_MAP: Record<string, string> = {
    success: 'check-circle',
    error: 'alert-circle',
    warning: 'alert-triangle',
    info: 'info',
};

/**
 * A container that shows notification toasts from a global queue, in one of six screen positions,
 * pausing on hover and offering action buttons.
 */
component('pdx-toast', {
    props: {
        position: { type: String, default: 'top-right' },
    },
    setup(ctx) {
        const queue = getToastQueue();
        let containerEl: HTMLElement | null = null;

        function renderToasts(items: Toast[]) {
            if (!containerEl) return;
            containerEl.setAttribute('position', ctx.position() as string || 'top-right');

            const existingIds = new Set<string>();
            for (const child of Array.from(containerEl.children)) {
                const id = (child as HTMLElement).dataset.toastId;
                if (id) existingIds.add(id);
            }

            const currentIds = new Set(items.map(t => t.id));

            // Remove stale
            for (const child of Array.from(containerEl.children)) {
                const id = (child as HTMLElement).dataset.toastId;
                if (id && !currentIds.has(id)) {
                    (child as HTMLElement).removeAttribute('data-open');
                    setTimeout(() => child.remove(), 300);
                }
            }

            // Add/update
            for (const t of items) {
                if (existingIds.has(t.id)) {
                    // Update existing (for promise transitions)
                    const existing = containerEl.querySelector(`[data-toast-id="${t.id}"]`) as HTMLElement;
                    if (existing) updateToastElement(existing, t);
                    continue;
                }
                const el = createToastElement(t);
                containerEl.appendChild(el);
                requestAnimationFrame(() => el.setAttribute('data-open', ''));
            }
        }

        function updateToastElement(el: HTMLElement, t: Toast) {
            // Update class for type/variant change (e.g., promise: info→success)
            el.className = buildToastClass(t);
            const msg = el.querySelector('.pdx-toast-message');
            if (msg) msg.textContent = t.message;
            const title = el.querySelector('.pdx-toast-title');
            if (title && t.title) title.textContent = t.title;
            const icon = el.querySelector('.pdx-toast-icon') as HTMLElement;
            if (icon && t.icon !== null) {
                const iconName = t.icon ?? ICON_MAP[t.type] ?? 'info';
                icon.setAttribute('name', iconName);
            }
            // Sync progress bar with current duration (handles promise loading→success/error)
            const existingProgress = el.querySelector('.pdx-toast-progress') as HTMLElement | null;
            if (t.duration > 0) {
                if (!existingProgress) {
                    const progress = document.createElement('div');
                    progress.className = 'pdx-toast-progress';
                    progress.style.animationDuration = t.duration + 'ms';
                    el.appendChild(progress);
                } else {
                    // Duration changed (e.g. promise transition) — restart animation with new duration
                    existingProgress.style.animationDuration = t.duration + 'ms';
                    existingProgress.style.animation = 'none';
                    existingProgress.offsetHeight; // force reflow
                    existingProgress.style.animation = '';
                }
            } else if (existingProgress) {
                existingProgress.remove();
            }
        }

        function buildToastClass(t: Toast): string {
            let cls = `pdx-toast pdx-toast-${t.type}`;
            if (t.variant === 'bordered') cls += ' pdx-toast-bordered';
            else if (t.variant === 'minimal') cls += ' pdx-toast-minimal';
            if (t.title) cls += ' pdx-toast-rich';
            if (t.size === 'compact') cls += ' pdx-toast-compact';
            else if (t.size === 'large') cls += ' pdx-toast-large';
            return cls;
        }

        function createToastElement(t: Toast): HTMLElement {
            const el = document.createElement('div');
            el.className = buildToastClass(t);
            el.dataset.toastId = t.id;
            el.setAttribute('role', t.type === 'error' ? 'alert' : 'status');
            el.setAttribute('aria-live', t.type === 'error' ? 'assertive' : 'polite');

            // Icon (unless explicitly null)
            if (t.icon !== null) {
                const icon = document.createElement('pdx-icon');
                const iconName = t.icon ?? ICON_MAP[t.type] ?? 'info';
                icon.setAttribute('name', iconName);
                icon.setAttribute('size', t.title ? 'md' : 'sm');
                icon.className = 'pdx-toast-icon';
                el.appendChild(icon);
            }

            // Content (title + message)
            const content = document.createElement('div');
            content.className = 'pdx-toast-content';
            if (t.title) {
                const titleEl = document.createElement('div');
                titleEl.className = 'pdx-toast-title';
                titleEl.textContent = t.title;
                content.appendChild(titleEl);
            }
            const msg = document.createElement('div');
            msg.className = 'pdx-toast-message';
            msg.textContent = t.message;
            content.appendChild(msg);
            el.appendChild(content);

            // Action button
            if (t.action) {
                const actionBtn = document.createElement('button');
                actionBtn.className = 'pdx-toast-action';
                actionBtn.textContent = t.action.label;
                actionBtn.onclick = () => { t.action!.onClick(); queue.dismiss(t.id); };
                el.appendChild(actionBtn);
            }

            // Close button
            if (t.dismissible) {
                const closeBtn = document.createElement('button');
                closeBtn.className = 'pdx-toast-close';
                uiAttr(closeBtn, 'aria-label', () => uiString('toast', 'dismiss'));
                closeBtn.textContent = '\u00d7';
                closeBtn.onclick = () => queue.dismiss(t.id);
                el.appendChild(closeBtn);
            }

            // Progress bar
            if (t.duration > 0) {
                const progress = document.createElement('div');
                progress.className = 'pdx-toast-progress';
                progress.style.animationDuration = t.duration + 'ms';
                el.appendChild(progress);
            }

            // Pause on hover
            el.addEventListener('mouseenter', () => {
                queue.pause(t.id);
                const p = el.querySelector('.pdx-toast-progress') as HTMLElement;
                if (p) p.style.animationPlayState = 'paused';
            });
            el.addEventListener('mouseleave', () => {
                queue.resume(t.id);
                const p = el.querySelector('.pdx-toast-progress') as HTMLElement;
                if (p) p.style.animationPlayState = 'running';
            });

            return el;
        }

        let disposeEffect: (() => void) | null = null;

        ctx.track(() => {
            requestAnimationFrame(() => {
                containerEl = ctx.el.querySelector('.pdx-toast-container');
                disposeEffect = effect(() => {
                    const items = queue.items();
                    renderToasts(items);
                });
            });
            return () => { if (disposeEffect) disposeEffect(); };
        });

        return {};
    },
    render: (ctx) => html`
        <div class="pdx-toast-container" :position="${ctx.position}"></div>
    `,
});
