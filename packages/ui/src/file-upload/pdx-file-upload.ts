// pdx-file-upload — Drag-and-drop file upload with validation, preview, and XHR upload.
// Supports accept filter, size/count limits, image thumbnails, progress tracking.

import { component, html, signal, computed } from '@pdxui/core';
import type { SlotFunction } from '@pdxui/core';
import { uiString, format } from '../shared/i18n';
// This component's styles travel with it, so an app ships the CSS of what it renders
// and no more.
import '@pdxui/design/components/file-upload';
import '../icon/pdx-icon'; // rendered by this component, and registered by nobody else

interface FileEntry {
    file: File;
    id: string;
    status: 'pending' | 'uploading' | 'success' | 'error';
    progress: number;
    error?: string;
    preview?: string;
    xhr?: XMLHttpRequest;
}

let _idCounter = 0;
function uid(): string { return 'fu-' + (++_idCounter); }

function formatSize(bytes: number): string {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

function matchAccept(file: File, accept: string): boolean {
    if (!accept) return true;
    return accept.split(',').map(s => s.trim()).some(pattern => {
        if (pattern.startsWith('.')) return file.name.toLowerCase().endsWith(pattern.toLowerCase());
        if (pattern.endsWith('/*')) return file.type.startsWith(pattern.slice(0, -1));
        return file.type === pattern;
    });
}

function validateFile(file: File, accept: string, maxSize: number): string | null {
    if (maxSize > 0 && file.size > maxSize) return format(uiString('file-upload', 'tooLarge'), { size: formatSize(maxSize) });
    if (accept && !matchAccept(file, accept)) return uiString('file-upload', 'notAccepted');
    return null;
}

/** A file the upload refused, shown under the zone until the next selection. */
interface Rejection { name: string; reason: string }

function isImageFile(file: File): boolean {
    return file.type.startsWith('image/');
}

/**
 * The accepted types as a reader names them. The attribute is for the browser — «.csv,text/csv» —
 * and a MIME type is a machine's name for a format: the reader knows the extension. With extensions
 * in `accept`, the hint lists them in capitals, once each, and leaves the MIME types out; with none,
 * there is nothing better to say, and the attribute is shown as written.
 */
function acceptHint(accept: string): string {
    const extensions = accept.split(',').map(s => s.trim()).filter(s => s.startsWith('.') && s.length > 1)
        .map(s => s.slice(1).toUpperCase());
    return extensions.length ? [...new Set(extensions)].join(', ') : accept;
}

/**
 * Drag-and-drop file upload with validation, image preview and size and count limits.
 *
 * @slot file - Scoped — renders one file in the list. Receives `{ file, status, progress }`.
 */
component('pdx-file-upload', {
    props: {
        accept: { type: String, default: '' },
        multiple: { type: Boolean, default: false },
        maxSize: { type: Number, default: 0 },
        maxFiles: { type: Number, default: 0 },
        disabled: { type: Boolean, default: false },
        /** The dropzone's text and name. Empty: the file-upload.drop component string. */
        label: { type: String, default: '' },
        name: { type: String, default: '' },
        auto: { type: Boolean, default: false },
        action: { type: String, default: '' },
        size: { type: String, default: '' },
    },
    setup(ctx) {
        const entries = signal<FileEntry[]>([]);
        const dragging = signal(false);
        const rejections = signal<Rejection[]>([]);

        const hint = computed(() => {
            const parts: string[] = [];
            const ms = ctx.maxSize() as number;
            if (ms > 0) parts.push(format(uiString('file-upload', 'maxSize'), { size: formatSize(ms) }));
            const a = ctx.accept() as string;
            if (a) parts.push(acceptHint(a));
            return parts.join(', ');
        });

        const dropzoneClass = computed(() => {
            let cls = 'pdx-file-dropzone';
            if (dragging()) cls += ' dragover';
            if (ctx.disabled()) cls += ' disabled';
            return cls;
        });

        const rootClass = computed(() => {
            const s = ctx.size() as string;
            return s ? 'pdx-file-upload pdx-file-upload-' + s : 'pdx-file-upload';
        });

        function addFiles(files: FileList | File[]) {
            if (ctx.disabled()) return;
            const accept = ctx.accept() as string;
            const maxSize = ctx.maxSize() as number;
            const maxFiles = ctx.maxFiles() as number;
            const list = Array.from(files);
            const added: File[] = [];
            // Every refused file is emitted AND shown, a wrong type, an oversize file and a file over
            // max-files alike: none of them vanishes without a word.
            const refused: Rejection[] = [];
            const reject = (file: File, error: string) => {
                refused.push({ name: file.name, reason: error });
                ctx.emit('pdx-error', { file, error });
            };

            for (const file of list) {
                // The loop appends each accepted file to `entries`, so that count is the whole
                // count: adding `added.length` to it counted every file twice, and 3 kept 2.
                if (maxFiles > 0 && entries().length >= maxFiles) {
                    reject(file, format(uiString('file-upload', 'tooMany'), { n: maxFiles }));
                    continue;
                }
                const err = validateFile(file, accept, maxSize);
                if (err) {
                    reject(file, err);
                    continue;
                }
                const entry: FileEntry = { file, id: uid(), status: 'pending', progress: 0 };
                if (isImageFile(file)) {
                    const reader = new FileReader();
                    reader.onload = () => {
                        entry.preview = reader.result as string;
                        entries.set([...entries()]);
                    };
                    reader.readAsDataURL(file);
                }
                added.push(file);
                entries.set([...entries(), entry]);
            }
            rejections.set(refused);

            if (added.length > 0) {
                ctx.emit('pdx-select', { files: added });
                if (ctx.auto() && ctx.action()) uploadAll();
            }
        }

        function removeFile(index: number) {
            if (ctx.disabled()) return;
            const list = entries();
            if (index < 0 || index >= list.length) return;
            const entry = list[index];
            // Focus was in the removed row (its ×, or the row itself for Delete): it goes to the next
            // file's ×, else the previous one's, else the drop zone, never to <body>.
            const row = ctx.el.querySelectorAll('.pdx-file-item')[index];
            const hadFocus = !!row && row.contains(document.activeElement);
            if (entry.status === 'uploading' && entry.xhr) entry.xhr.abort();
            ctx.emit('pdx-remove', { file: entry.file, index });
            entries.set(list.filter((_, i) => i !== index));
            if (hadFocus) {
                requestAnimationFrame(() => {
                    const buttons = ctx.el.querySelectorAll<HTMLElement>('.pdx-file-remove');
                    const next = buttons[Math.min(index, buttons.length - 1)];
                    (next ?? ctx.el.querySelector<HTMLElement>('.pdx-file-dropzone'))?.focus();
                });
            }
        }

        function uploadEntry(entry: FileEntry) {
            const actionUrl = ctx.action() as string;
            if (!actionUrl) return;
            const xhr = new XMLHttpRequest();
            entry.xhr = xhr;
            entry.status = 'uploading';
            entries.set([...entries()]);
            ctx.emit('pdx-upload', { file: entry.file });

            xhr.upload.onprogress = (e) => {
                if (e.lengthComputable) {
                    entry.progress = Math.round((e.loaded / e.total) * 100);
                    entries.set([...entries()]);
                    ctx.emit('pdx-progress', { file: entry.file, percent: entry.progress });
                }
            };
            xhr.onload = () => {
                if (xhr.status >= 200 && xhr.status < 300) {
                    entry.status = 'success';
                    entry.progress = 100;
                    let response: unknown;
                    try { response = JSON.parse(xhr.responseText); } catch { response = xhr.responseText; }
                    ctx.emit('pdx-success', { file: entry.file, response });
                } else {
                    entry.status = 'error';
                    entry.error = format(uiString('file-upload', 'uploadFailed'), { status: xhr.status });
                    ctx.emit('pdx-error', { file: entry.file, error: entry.error });
                }
                entries.set([...entries()]);
            };
            xhr.onerror = () => {
                entry.status = 'error';
                entry.error = uiString('file-upload', 'networkError');
                entries.set([...entries()]);
                ctx.emit('pdx-error', { file: entry.file, error: entry.error });
            };
            const formData = new FormData();
            formData.append(ctx.name() as string || 'file', entry.file);
            xhr.open('POST', actionUrl);
            xhr.send(formData);
        }

        function uploadAll() {
            for (const entry of entries()) {
                if (entry.status === 'pending') uploadEntry(entry);
            }
        }

        function clear() {
            for (const entry of entries()) {
                if (entry.status === 'uploading' && entry.xhr) entry.xhr.abort();
            }
            entries.set([]);
        }

        function onDropzoneClick() {
            if (ctx.disabled()) return;
            const input = ctx.el.querySelector('input[type="file"]') as HTMLInputElement;
            if (input) input.click();
        }

        function onDropzoneKeydown(e: KeyboardEvent) {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onDropzoneClick();
            }
        }

        function onDragOver(e: DragEvent) {
            e.preventDefault();
            if (!ctx.disabled()) dragging.set(true);
        }

        function onDragLeave() { dragging.set(false); }

        function onDrop(e: DragEvent) {
            e.preventDefault();
            dragging.set(false);
            if (e.dataTransfer?.files) addFiles(e.dataTransfer.files);
        }

        function onInputChange(e: Event) {
            const input = e.target as HTMLInputElement;
            if (input.files) addFiles(input.files);
            input.value = '';
        }

        function onFileKeydown(e: KeyboardEvent, index: number) {
            if (e.key === 'Delete' || e.key === 'Backspace') {
                e.preventDefault();
                removeFile(index);
            }
        }

        // Abort all XHR on disconnect
        ctx.track(() => {
            return () => {
                for (const entry of entries()) {
                    if (entry.status === 'uploading' && entry.xhr) entry.xhr.abort();
                }
            };
        });

        ctx.expose({
            /** Put files through the checks a drop goes through: each refusal emits `pdx-error` and is shown in the list. */
            addFiles,
            /** Remove the file at this index, aborting its upload when one is running, and move focus off the row it deletes. */
            removeFile,
            /** Start uploading every file still pending; those uploading, done or failed are left alone. */
            uploadAll,
            clear,
        });

        function getFileSlot(): SlotFunction | undefined {
            return (ctx as any).__slots?.['file'] as SlotFunction | undefined;
        }

        /** A remove button's name: "Remove {file name}". */
        const removeName = (entry: FileEntry): string => format(uiString('file-upload', 'remove'), { name: entry.file.name });
        const rejectionText = (r: Rejection): string => format(uiString('file-upload', 'rejected'), { name: r.name, reason: r.reason });

        return {
            entries, dragging, hint, dropzoneClass, rootClass, rejections, removeName, rejectionText,
            onDropzoneClick, onDropzoneKeydown,
            onDragOver, onDragLeave, onDrop,
            onInputChange, onFileKeydown, removeFile,
            getFileSlot,
        };
    },
    render: (ctx) => html`
        <div :class="${ctx.rootClass}">
            <div :class="${ctx.dropzoneClass}"
                role="button" tabindex="0"
                :aria-label="${() => (ctx.label() as string) || uiString('file-upload', 'drop')}"
                :aria-disabled=${() => ctx.disabled() ? 'true' : null}
                @click=${ctx.onDropzoneClick}
                @keydown=${ctx.onDropzoneKeydown}
                @dragover=${ctx.onDragOver}
                @dragleave=${ctx.onDragLeave}
                @drop=${ctx.onDrop}>
                <span class="pdx-file-dropzone-icon" aria-hidden="true">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
                </span>
                <span class="pdx-file-dropzone-label">${() => (ctx.label() as string) || uiString('file-upload', 'drop')}</span>
                ${() => ctx.hint() ? html`<span class="pdx-file-dropzone-hint">${ctx.hint}</span>` : ''}
            </div>
            <input type="file"
                hidden
                :accept=${ctx.accept}
                :multiple=${ctx.multiple}
                :name=${ctx.name}
                @change=${ctx.onInputChange} />
            <div class="pdx-file-rejections" role="status">
                ${() => (ctx.rejections() as Rejection[]).map((r) => html`<div class="pdx-file-error">${ctx.rejectionText(r)}</div>`)}
            </div>
            ${() => {
                const list = ctx.entries();
                if (list.length === 0) return '';
                return html`<div class="pdx-file-list" role="list">
                    ${() => list.map((entry: any, i: number) => {
                        const fileSlot = ctx.getFileSlot();
                        if (fileSlot) {
                            return html`<div class=${() => 'pdx-file-item pdx-file-' + entry.status}
                                role="listitem" tabindex="0"
                                @keydown=${(e: KeyboardEvent) => ctx.onFileKeydown(e, i)}>
                                ${() => fileSlot({ file: entry.file, status: entry.status, progress: entry.progress })}
                                <button class="pdx-file-remove" :aria-label="${() => ctx.removeName(entry)}"
                                    :disabled=${() => ctx.disabled()}
                                    @click=${() => ctx.removeFile(i)}>\u00d7</button>
                            </div>`;
                        }
                        return html`<div class=${() => 'pdx-file-item pdx-file-' + entry.status}
                            role="listitem" tabindex="0"
                            @keydown=${(e: KeyboardEvent) => ctx.onFileKeydown(e, i)}>
                            ${entry.preview
                                ? html`<div class="pdx-file-thumb"><img :src=${() => entry.preview} alt="" /></div>`
                                : html`<div class="pdx-file-icon"><pdx-icon name="file" size="sm"></pdx-icon></div>`}
                            <div class="pdx-file-info">
                                <span class="pdx-file-name">${() => entry.file.name}</span>
                                <span class="pdx-file-size">${() => formatSize(entry.file.size)}</span>
                                ${() => entry.error ? html`<span class="pdx-file-error">${() => entry.error}</span>` : ''}
                            </div>
                            ${() => entry.status === 'uploading'
                                ? html`<div class="pdx-file-progress"
                                    role="progressbar"
                                    :aria-valuenow=${() => entry.progress}
                                    aria-valuemin="0" aria-valuemax="100">
                                    <div style=${() => 'width:' + entry.progress + '%'}></div>
                                </div>`
                                : ''}
                            ${() => entry.status === 'success'
                                ? html`<span class="pdx-file-status"><pdx-icon name="check" size="sm"></pdx-icon></span>`
                                : ''}
                            <button class="pdx-file-remove" :aria-label="${() => ctx.removeName(entry)}"
                                :disabled=${() => ctx.disabled()}
                                @click=${() => ctx.removeFile(i)}>\u00d7</button>
                        </div>`;
                    })}
                </div>`;
            }}
        </div>
    `,
});
