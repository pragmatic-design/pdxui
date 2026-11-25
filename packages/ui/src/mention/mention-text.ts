// pdx-mention's text model: the mention ranges kept beside the textarea's clean text, and what is
// built from them — the highlight mirror, the persistence markup, the caret's box. Pure functions of
// their arguments, beside the component, whose .pdx script holds the state.

/**
 * A mention in the text: where it is, whom it names, and the trigger that made it. The component's
 * own model, not a shape an app passes: a type alias, which the manifest does not list among the
 * component's shapes, where an exported interface its script names would be (manifest-shared.mjs).
 */
export type MentionRange = {
    start: number;
    end: number;
    value: string;
    label: string;
    trigger: string;
};

/** The ranges after an edit of `delta` characters at `pos`: one the edit falls inside is dropped. */
export function shiftMentions(mentions: readonly MentionRange[], pos: number, delta: number): MentionRange[] {
    return mentions.filter(m => !(pos > m.start && pos < m.end)).map(m => {
        if (m.start >= pos) return { ...m, start: m.start + delta, end: m.end + delta };
        return m;
    });
}

export function escapeHTML(s: string): string {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** The mirror's markup: the text, HTML-escaped, with each mention in a `.pdx-mention-tag` span. */
export function buildMirrorHTML(text: string, mentions: readonly MentionRange[]): string {
    let result = '';
    let lastIdx = 0;
    // Sort mentions by start position
    const sorted = [...mentions].sort((a, b) => a.start - b.start);
    for (const m of sorted) {
        if (m.start < lastIdx || m.start > text.length || m.end > text.length) continue;
        // Text before mention (HTML-escaped)
        result += escapeHTML(text.substring(lastIdx, m.start));
        // Mention span
        result += `<span class="pdx-mention-tag">${escapeHTML(text.substring(m.start, m.end))}</span>`;
        lastIdx = m.end;
    }
    // Remaining text
    result += escapeHTML(text.substring(lastIdx));
    return result + '\n'; // trailing newline for correct height
}

/** The markup format for persistence: each mention as `@[Label](value)`. */
export function mentionMarkup(text: string, mentions: readonly MentionRange[]): string {
    let result = '';
    let lastIdx = 0;
    const sorted = [...mentions].sort((a, b) => a.start - b.start);
    for (const m of sorted) {
        if (m.start < lastIdx) continue;
        result += text.substring(lastIdx, m.start);
        result += `${m.trigger}[${m.label}](${m.value})`;
        lastIdx = m.end;
    }
    result += text.substring(lastIdx);
    return result;
}

/**
 * The trigger the caret is typing after, and where: back from the caret to the first space or line
 * break, a trigger at the start of a word that is not inside a mention already. `null` for none.
 */
export function findTrigger(text: string, pos: number, triggers: readonly string[], mentions: readonly MentionRange[]): { trigger: string; at: number } | null {
    for (let i = pos - 1; i >= 0; i--) {
        const ch = text[i];
        if (ch === ' ' || ch === '\n') break;
        if (triggers.includes(ch)) {
            if (i === 0 || text[i - 1] === ' ' || text[i - 1] === '\n') {
                // Check we're not inside an existing mention
                const inMention = mentions.some(m => i >= m.start && i < m.end);
                if (!inMention) return { trigger: ch, at: i };
            }
            return null;
        }
    }
    return null;
}

/**
 * The caret's box in viewport coordinates. A hidden copy of the textarea lays out the text up
 * to the caret the same way, and a marker at its end is where the caret is inside the
 * textarea; the textarea's own rect and scroll put that in the viewport.
 */
export function caretRect(textarea: HTMLTextAreaElement | null): DOMRect {
    if (!textarea) return new DOMRect();
    const mirror = document.createElement('div');
    const style = getComputedStyle(textarea);
    mirror.style.cssText = `position:absolute;visibility:hidden;white-space:pre-wrap;word-wrap:break-word;overflow:hidden;box-sizing:${style.boxSizing};width:${style.width};font:${style.font};padding:${style.padding};border:${style.border};line-height:${style.lineHeight};`;
    const text = textarea.value.substring(0, textarea.selectionStart);
    mirror.textContent = text;
    const span = document.createElement('span');
    span.textContent = '|';
    mirror.appendChild(span);
    document.body.appendChild(mirror);
    const box = textarea.getBoundingClientRect();
    // offsetLeft/Top count from the mirror's padding edge, i.e. inside its border — the same
    // border the textarea has, which clientLeft/Top measure.
    const left = box.left + textarea.clientLeft + span.offsetLeft - textarea.scrollLeft;
    const top = box.top + textarea.clientTop + span.offsetTop - textarea.scrollTop;
    const height = span.offsetHeight;
    document.body.removeChild(mirror);
    return new DOMRect(left, top, 0, height);
}
