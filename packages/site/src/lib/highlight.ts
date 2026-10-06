// Lightweight PDX syntax highlighter for inline code snippets (pdx-code).
// Single-pass tokenizer → HTML with token classes (.tok-*, styled globally in site.css).
// Not a full grammar (docs use Shiki); enough to give snippets real color, no Monaco.

function esc(s: string): string {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// Order matters: comments and strings first so we don't tokenize inside them.
const TOKEN = new RegExp([
    '(\\/\\/[^\\n]*|\\/\\*[\\s\\S]*?\\*\\/)',                              // 1 comment
    '(\'(?:[^\'\\\\]|\\\\.)*\'|"(?:[^"\\\\]|\\\\.)*"|`(?:[^`\\\\]|\\\\.)*`)', // 2 string
    '([@$][A-Za-z][\\w-]*)',                                              // 3 rune / decorator / attr sigil
    '(\\b(?:let|const|function|return|if|else|import|from|export|new|await|async|class|extends)\\b)', // 4 keyword
    '(\\b(?:true|false|null|undefined)\\b)',                             // 5 literal
    '(<\\/?[A-Za-z][\\w-]*)',                                            // 6 tag open/close
    '(\\b\\d+(?:\\.\\d+)?\\b)',                                          // 7 number
].join('|'), 'g');

/** Highlight a PDX/HTML/TS snippet → HTML string with .tok-* spans. */
export function highlightPdx(code: string): string {
    let out = '';
    let last = 0;
    let m: RegExpExecArray | null;
    TOKEN.lastIndex = 0;
    while ((m = TOKEN.exec(code)) !== null) {
        out += esc(code.slice(last, m.index));
        const cls = m[1] ? 'tok-com' : m[2] ? 'tok-str' : m[3] ? 'tok-rune'
            : m[4] ? 'tok-kw' : m[5] ? 'tok-lit' : m[6] ? 'tok-tag' : 'tok-num';
        out += `<span class="${cls}">${esc(m[0])}</span>`;
        last = m.index + m[0].length;
    }
    out += esc(code.slice(last));
    return out;
}
