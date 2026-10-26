// pdx-tag-input — Multi-tag input with chip rendering, paste support, keyboard nav.
// Uses .pdx-input-wrap for consistent border/focus and .pdx-chip for tag rendering.

import { component, html, signal, computed, model, event, slot, snippetOrSlot } from '@pdxui/core';
import type { SlotFunction } from '@pdxui/core';
import { uiString, format } from '../shared/i18n';
// This component's styles travel with it, so an app ships the CSS of what it renders
// and no more.
import '@pdxui/design/components/tag-input';
// The tags are drawn with .pdx-chip, which chip.css owns.
import '@pdxui/design/components/chip';

/**
 * A text field where the user enters several tags, shown as chips, with paste support and
 * duplicates prevented.
 *
 * @slot tag - Renders one tag: a snippet `tag(tag, index)`, or the scoped slot, which receives `{ tag, index }`.
 *
 * @csspart root - The frame, `role="group"`: border, background and the states' colours.
 * @csspart input - The text box where a tag is typed; gone while `disabled`, `readonly` or at `max-tags`.
 * @csspart tag - One tag, a chip.
 * @csspart remove - A tag's remove button, while neither `disabled` nor `readonly`.
 *
 * @cssstate invalid - `error` is set; the text box is aria-invalid.
 * @cssstate success - `success` is set.
 * @cssstate warning - `warning` is set.
 * @cssstate disabled - `disabled` is set.
 * @cssstate readonly - `readonly` is set.
 * @cssstate loading - `loading` is set; the group is aria-busy.
 *
 * @alphaevent pdx-input
 * @alphaevent pdx-change
 * @alphadetail tags $event.detail.value
 * @alphadetail value $event.detail.value
 * @alpharename pdx-input draft-change
 */
component('pdx-tag-input', {
    // The tags (#481). Adding one, removing one and clear() write them, and the write dispatches
    // `value-change`. The text being typed is not the value: it is announced with `draft-change`.
    models: { value: model<string[]>(() => [], { type: Array, form: true }) },
    events: {
        /** The text typed into the field, before it becomes a tag. */
        'draft-change': event<{ value: string }>(),
        /** A tag was added. */
        'pdx-add': event<{ tag: string; tags: string[] }>(),
        /** A tag was removed. */
        'pdx-remove': event<{ tag: string; index: number; tags: string[] }>(),
    },
    // The visual states, on the host as custom states (#132), as pdx-input's: the frame is the host's
    // child `.pdx-input-wrap`, which inputs.css draws from them. It carries no state class of its own.
    states: ['invalid', 'success', 'warning', 'disabled', 'readonly', 'loading'],
    parts: ['root', 'input', 'tag', 'remove'],
    // The axis inputs.css keys by (#627), reflected on the host; each value maps the class that draws
    // the same size on a native field. `md` is the base look, which no class adds to.
    variants: {
        /** xs, sm, md (the default), lg or xl — the same scale as pdx-input. */
        size: { md: '.pdx-input-md', xs: '.pdx-input-xs', sm: '.pdx-input-sm', lg: '.pdx-input-lg', xl: '.pdx-input-xl' },
    },
    props: {
        placeholder: { type: String, default: '' },
        maxTags: { type: Number, default: 0 },
        maxLength: { type: Number, default: 0 },
        separator: { type: String, default: ',' },
        disabled: { type: Boolean, default: false },
        readonly: { type: Boolean, default: false },
        allowDuplicates: { type: Boolean, default: false },
        name: { type: String, default: '' },
        label: { type: String, default: '' },
        error: { type: Boolean, default: false },
        success: { type: Boolean, default: false },
        warning: { type: Boolean, default: false },
        /** Show loading state */
        loading: { type: Boolean, default: false },
    },
    // A parent's `@snippet` sets these, positional arguments; the alpha scoped slot stays (#596).
    slots: {
        tag: slot<(tag: string, index: number) => Node>(),
    },
    setup(ctx) {
        const tags = signal<string[]>([]);
        const inputValue = signal('');
        // "{tag} added" / "{tag} removed", politely: a tag does not come and go in silence.
        const announcement = signal('');

        ctx.track(() => {
            ctx.state('invalid', !!ctx.error());
            ctx.state('success', !!ctx.success());
            ctx.state('warning', !!ctx.warning());
            ctx.state('disabled', !!ctx.disabled());
            ctx.state('readonly', !!ctx.readonly());
            ctx.state('loading', !!ctx.loading());
        });

        // Sync external value prop into internal tags
        ctx.track(() => {
            const v = ctx.value();
            if (Array.isArray(v)) tags.set([...v]);
        });

        const isAtLimit = computed(() => {
            const max = ctx.maxTags() as number;
            return max > 0 && tags().length >= max;
        });

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
            ctx.value.set(next);
            announcement.set(format(uiString('tag-input', 'added'), { tag }));
            ctx.emit('pdx-add', { tag, tags: next });
            return true;
        }

        function addMultiple(raw: string) {
            const sep = ctx.separator() as string || ',';
            const parts = raw.split(sep);
            let changed = false;
            for (const part of parts) {
                if (addTag(part)) changed = true;
            }
            // value-change already dispatched per add; no extra one needed
            return changed;
        }

        function removeTag(index: number) {
            const current = tags();
            if (index < 0 || index >= current.length) return;
            const tag = current[index];
            const next = current.filter((_, i) => i !== index);
            tags.set(next);
            ctx.value.set(next);
            announcement.set(format(uiString('tag-input', 'removed'), { tag }));
            ctx.emit('pdx-remove', { tag, index, tags: next });
        }

        function clear() {
            tags.set([]);
            inputValue.set('');
            ctx.value.set([]);
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
                ctx.emit('draft-change', { value: val });
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

        function getTagSlot(): SlotFunction | undefined {
            return snippetOrSlot(ctx, 'tag', (s) => [s.tag, s.index]);
        }

        return {
            tags, inputValue, isAtLimit, announcement,
            onKeydown, onInput, onPaste, onRemoveClick, onWrapClick,
            getTagSlot,
        };
    },
    // The host is the one submitter, the tags as JSON, under its name (#133). A hidden input carrying
    // the name would send them a second time, comma-joined. Written after `setup`, so its type is read.
    host: { ':name': (ctx) => ctx.name() || null },
    render: (ctx) => html`
        <div
            class="pdx-tag-input pdx-input-wrap" data-part="root"
            role="group"
            :aria-label="${() => (ctx.label() as string) || uiString('tag-input', 'label')}"
            :aria-busy="${() => ctx.loading() ? 'true' : null}"
            @click="${ctx.onWrapClick}"
        >
            ${() => ctx.tags().map((tag: string, i: number) => {
                const tagSlot = ctx.getTagSlot();
                if (tagSlot) {
                    return html`<span class="pdx-chip pdx-chip-sm" data-part="tag">
                        ${() => tagSlot({ tag, index: i })}
                        ${() => !ctx.disabled() && !ctx.readonly()
                            ? html`<button class="pdx-chip-remove" data-part="remove" :aria-label="${() => format(uiString('tag-input', 'remove'), { tag })}" @click="${ctx.onRemoveClick(i)}">\u00d7</button>`
                            : ''}
                    </span>`;
                }
                return html`<span class="pdx-chip pdx-chip-sm" data-part="tag">
                    <span>${() => tag}</span>
                    ${() => !ctx.disabled() && !ctx.readonly()
                        ? html`<button class="pdx-chip-remove" data-part="remove" :aria-label="${() => format(uiString('tag-input', 'remove'), { tag })}" @click="${ctx.onRemoveClick(i)}">\u00d7</button>`
                        : ''}
                </span>`;
            })}
            ${() => !ctx.disabled() && !ctx.readonly() && !ctx.isAtLimit()
                ? html`<input
                    class="pdx-tag-input-field"
                    data-part="input"
                    type="text"
                    autocomplete="off" data-lpignore="true" data-1p-ignore="" data-form-type="other"
                    :value="${ctx.inputValue}"
                    placeholder="${() => ctx.tags().length === 0 ? ctx.placeholder() : ''}"
                    :disabled="${ctx.disabled}"
                    :readonly="${ctx.readonly}"
                    :aria-label="${() => (ctx.label() as string) || uiString('tag-input', 'add')}"
                    :aria-invalid="${() => ctx.error() ? 'true' : null}"
                    @input="${ctx.onInput}"
                    @keydown="${ctx.onKeydown}"
                    @paste="${ctx.onPaste}"
                />`
                : ''}
        </div>
        <span class="pdx-sr-only" role="status" aria-live="polite">${() => ctx.announcement()}</span>
    `,
});
