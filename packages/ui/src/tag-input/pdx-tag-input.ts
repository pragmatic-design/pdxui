// pdx-tag-input — Multi-tag input with chip rendering, paste support, keyboard nav.
// Uses .pdx-input-wrap for consistent border/focus and .pdx-chip for tag rendering.

import { component, html, signal, computed, useFormAssociated } from '@pdxui/core';
import type { SlotFunction } from '@pdxui/core';
import { uiString, format } from '../shared/i18n';
import { setOwnProp, reflectNameToHost } from '../shared/own-prop';
// This component's styles travel with it, so an app ships the CSS of what it renders
// and no more.
import '@pdxui/design/components/tag-input';
// The tags are drawn with .pdx-chip, which chip.css owns.
import '@pdxui/design/components/chip';

/**
 * A text field where the user enters several tags, shown as chips, with paste support and
 * duplicates prevented.
 *
 * @slot tag - Scoped — renders one tag. Receives `{ tag, index }`.
 */
component('pdx-tag-input', {
    formAssociated: true,
    props: {
        value: { type: Array, default: [] },
        placeholder: { type: String, default: '' },
        maxTags: { type: Number, default: 0 },
        maxLength: { type: Number, default: 0 },
        separator: { type: String, default: ',' },
        disabled: { type: Boolean, default: false },
        readonly: { type: Boolean, default: false },
        allowDuplicates: { type: Boolean, default: false },
        size: { type: String, default: '' },
        name: { type: String, default: '' },
        label: { type: String, default: '' },
        error: { type: Boolean, default: false },
        success: { type: Boolean, default: false },
        warning: { type: Boolean, default: false },
        /** Show loading state */
        loading: { type: Boolean, default: false },
    },
    setup(ctx) {
        const tags = signal<string[]>([]);
        const inputValue = signal('');
        // "{tag} added" / "{tag} removed", politely: a tag does not come and go in silence.
        const announcement = signal('');

        // Sync external value prop into internal tags
        ctx.track(() => {
            if (ctx.loading()) ctx.el.setAttribute('aria-busy', 'true');
            else ctx.el.removeAttribute('aria-busy');

            const v = ctx.value();
            if (Array.isArray(v)) tags.set([...v]);
        });

        const isAtLimit = computed(() => {
            const max = ctx.maxTags() as number;
            return max > 0 && tags().length >= max;
        });

        function wrapClass(): string {
            let cls = 'pdx-tag-input pdx-input-wrap';
            const s = ctx.size() as string;
            if (s) cls += ' pdx-input-' + s;
            if (ctx.disabled()) cls += ' disabled';
            if (ctx.readonly()) cls += ' readonly';
            if (ctx.error()) cls += ' error';
            if (ctx.success()) cls += ' success';
            if (ctx.warning()) cls += ' warning';
            return cls;
        }

        function validate(tag: string): boolean {
            if (!tag) return false;
            const max = ctx.maxLength() as number;
            if (max > 0 && tag.length > max) return false;
            if (isAtLimit()) return false;
            if (!ctx.allowDuplicates() && tags().includes(tag)) return false;
            return true;
        }

        function addTag(raw: string): boolean {
            const tag = raw.trim();
            if (!validate(tag)) return false;
            const next = [...tags(), tag];
            tags.set(next);
            setOwnProp(ctx.el, 'value', next);
            announcement.set(format(uiString('tag-input', 'added'), { tag }));
            ctx.emit('pdx-add', { tag, tags: next });
            ctx.emit('pdx-change', { tags: next });
            return true;
        }

        function addMultiple(raw: string) {
            const sep = ctx.separator() as string || ',';
            const parts = raw.split(sep);
            let changed = false;
            for (const part of parts) {
                if (addTag(part)) changed = true;
            }
            // pdx-change already emitted per-add; no extra emit needed
            return changed;
        }

        function removeTag(index: number) {
            const current = tags();
            if (index < 0 || index >= current.length) return;
            const tag = current[index];
            const next = current.filter((_, i) => i !== index);
            tags.set(next);
            setOwnProp(ctx.el, 'value', next);
            announcement.set(format(uiString('tag-input', 'removed'), { tag }));
            ctx.emit('pdx-remove', { tag, index, tags: next });
            ctx.emit('pdx-change', { tags: next });
        }

        function clear() {
            tags.set([]);
            inputValue.set('');
            setOwnProp(ctx.el, 'value', []);
            ctx.emit('pdx-change', { tags: [] });
        }

        function getTags(): string[] {
            return [...tags()];
        }

        function commitInput() {
            const val = inputValue();
            if (!val.trim()) return;
            const sep = ctx.separator() as string || ',';
            if (val.includes(sep)) {
                addMultiple(val);
            } else {
                addTag(val);
            }
            inputValue.set('');
        }

        function onKeydown(e: KeyboardEvent) {
            if (ctx.disabled() || ctx.readonly()) return;
            const sep = ctx.separator() as string || ',';

            if (e.key === 'Enter' || e.key === 'Tab' || e.key === sep) {
                if (inputValue().trim()) {
                    e.preventDefault();
                    commitInput();
                }
            } else if (e.key === 'Backspace') {
                if (!inputValue() && tags().length > 0) {
                    removeTag(tags().length - 1);
                }
            } else if (e.key === 'Escape') {
                inputValue.set('');
                (e.target as HTMLInputElement).value = '';
            }
        }

        function onInput(e: Event) {
            const val = (e.target as HTMLInputElement).value;
            const sep = ctx.separator() as string || ',';
            // Auto-split if separator typed (caught before keydown for IME/mobile)
            if (val.includes(sep)) {
                addMultiple(val);
                inputValue.set('');
                (e.target as HTMLInputElement).value = '';
            } else {
                inputValue.set(val);
                ctx.emit('pdx-input', { value: val });
            }
        }

        function onPaste(e: ClipboardEvent) {
            if (ctx.disabled() || ctx.readonly()) return;
            const text = e.clipboardData?.getData('text') || '';
            if (!text) return;
            e.preventDefault();
            addMultiple(text);
            inputValue.set('');
            const input = e.target as HTMLInputElement;
            if (input) input.value = '';
        }

        function onRemoveClick(index: number) {
            return (e: Event) => {
                e.stopPropagation();
                if (ctx.disabled() || ctx.readonly()) return;
                removeTag(index);
            };
        }

        function onWrapClick(e: Event) {
            const target = e.target as HTMLElement;
            if (target.tagName === 'INPUT' || target.tagName === 'BUTTON') return;
            ctx.el.querySelector<HTMLInputElement>('.pdx-tag-input-field')?.focus();
        }

        // Imperative API: focus/blur/clear (clear/addTag/removeTag/getTags already exposed)
        ctx.expose({
            /** Add one tag, trimmed. Returns false and adds nothing when validation refuses it: a duplicate, one over `max`, or one off `pattern`. */
            addTag,
            /** Remove the tag at this index and emit `pdx-remove`; an index outside the list does nothing. */
            removeTag,
            clear,
            /** A copy of the current tags — mutating it changes nothing. */
            getTags,
            focus() { (ctx.el.querySelector('input, textarea, [tabindex]:not([tabindex="-1"]), button') as HTMLElement | null)?.focus(); },
            blur() { (ctx.el.querySelector('input, textarea, [tabindex]:not([tabindex="-1"]), button') as HTMLElement | null)?.blur(); },
        });

        useFormAssociated(ctx, { getFormValue: () => { const t = tags(); return t.length > 0 ? JSON.stringify(t) : null; } });
        // The host is the one submitter, the tags as JSON. A hidden input carrying the name would send
        // them a second time, comma-joined.
        reflectNameToHost(ctx);

        function getTagSlot(): SlotFunction | undefined {
            return (ctx as any).__slots?.['tag'] as SlotFunction | undefined;
        }

        return {
            tags, inputValue, isAtLimit, wrapClass, announcement,
            onKeydown, onInput, onPaste, onRemoveClick, onWrapClick,
            getTagSlot,
        };
    },
    render: (ctx) => html`
        <div
            :class="${ctx.wrapClass}"
            role="group"
            :aria-label="${() => (ctx.label() as string) || uiString('tag-input', 'label')}"
            @click="${ctx.onWrapClick}"
        >
            ${() => ctx.tags().map((tag: string, i: number) => {
                const tagSlot = ctx.getTagSlot();
                if (tagSlot) {
                    return html`<span class="pdx-chip pdx-chip-sm">
                        ${() => tagSlot({ tag, index: i })}
                        ${() => !ctx.disabled() && !ctx.readonly()
                            ? html`<button class="pdx-chip-remove" :aria-label="${() => format(uiString('tag-input', 'remove'), { tag })}" @click="${ctx.onRemoveClick(i)}">\u00d7</button>`
                            : ''}
                    </span>`;
                }
                return html`<span class="pdx-chip pdx-chip-sm">
                    <span>${() => tag}</span>
                    ${() => !ctx.disabled() && !ctx.readonly()
                        ? html`<button class="pdx-chip-remove" :aria-label="${() => format(uiString('tag-input', 'remove'), { tag })}" @click="${ctx.onRemoveClick(i)}">\u00d7</button>`
                        : ''}
                </span>`;
            })}
            ${() => !ctx.disabled() && !ctx.readonly() && !ctx.isAtLimit()
                ? html`<input
                    class="pdx-tag-input-field"
                    type="text"
                    autocomplete="off" data-lpignore="true" data-1p-ignore="" data-form-type="other"
                    :value="${ctx.inputValue}"
                    placeholder="${() => ctx.tags().length === 0 ? ctx.placeholder() : ''}"
                    :disabled="${ctx.disabled}"
                    :readonly="${ctx.readonly}"
                    :aria-label="${() => (ctx.label() as string) || uiString('tag-input', 'add')}"
                    @input="${ctx.onInput}"
                    @keydown="${ctx.onKeydown}"
                    @paste="${ctx.onPaste}"
                />`
                : ''}
        </div>
        <span class="pdx-sr-only" role="status" aria-live="polite">${() => ctx.announcement()}</span>
    `,
});
